import { expect, it, vi } from "vitest";
import { ApiError, type Api } from "./api";
import { DraftSaver, type EditingDraft } from "./editingDrafts";
const fixture = () =>
  ({
    id: "draft",
    source_image: "source",
    source_size: [64, 64],
    revision: 0,
    submitted_run_id: null,
    data: { instruction: "first" },
  }) as EditingDraft;
it("coalesces writes in one in-flight request and acknowledges latest input", async () => {
  const saved = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bodies: { data: EditingDraft["data"]; expected_revision: number }[] =
    [];
  const api = vi.fn(async (_path, init) => {
    const body = JSON.parse(init!.body as string);
    bodies.push(body);
    if (bodies.length === 1) await gate;
    return { ...saved, data: body.data, revision: body.expected_revision + 1 };
  }) as Api;
  const saver = new DraftSaver(saved, api, () => {});
  saver.set({ ...saved.data, instruction: "second" });
  const writing = saver.flush();
  saver.set({ ...saved.data, instruction: "third" });
  expect(bodies).toHaveLength(1);
  expect(saver.flush()).toBe(writing);
  release();
  expect((await writing).data.instruction).toBe("third");
  expect(bodies).toHaveLength(2);
  expect(bodies[1].expected_revision).toBe(1);
  saver.dispose();
});
it("replays the exact lost-response key and stops on conflict without merging", async () => {
  const saved = fixture();
  const bodies: unknown[] = [];
  let first = true;
  const api = vi.fn(async (_path, init) => {
    const body = JSON.parse(init!.body as string);
    bodies.push(body);
    if (first) {
      first = false;
      throw new ApiError("offline", 0);
    }
    return { ...saved, data: body.data, revision: body.expected_revision + 1 };
  }) as Api;
  const saver = new DraftSaver(saved, api, () => {});
  saver.set({ ...saved.data, instruction: "second" });
  await expect(saver.flush()).rejects.toThrow();
  await saver.flush();
  expect(bodies[0]).toEqual(bodies[1]);
  saver.dispose();
  const conflicting = new DraftSaver(
    saved,
    (async () => {
      throw new ApiError("conflict", 409);
    }) as Api,
    () => {},
  );
  conflicting.set({ ...saved.data, instruction: "keep local" });
  await expect(conflicting.flush()).rejects.toThrow();
  expect(conflicting.status).toBe("Conflict");
  expect(conflicting.desired.instruction).toBe("keep local");
  await expect(conflicting.flush()).rejects.toThrow();
  conflicting.dispose();
});
it("acknowledges canonical whitespace normalization without an endless save loop", async () => {
  const saved = fixture();
  const api = vi.fn(async (_path, init) => {
    const body = JSON.parse(init!.body as string);
    return {
      ...saved,
      data: { ...body.data, instruction: body.data.instruction.trim() },
      revision: body.expected_revision + 1,
    };
  }) as Api;
  const saver = new DraftSaver(saved, api, () => {});
  saver.set({ ...saved.data, instruction: "  normalized instruction  " });
  const result = await saver.flush();
  expect(result.data.instruction).toBe("normalized instruction");
  expect(saver.status).toBe("Saved");
  expect(api).toHaveBeenCalledTimes(1);
  await saver.flush();
  expect(api).toHaveBeenCalledTimes(1);
  saver.dispose();
});
