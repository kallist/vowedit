import { ApiError, jsonPost, type Api } from "./api";
import type { Stroke } from "./masks";
import type { Contract, Run } from "./types";
export type DraftData = {
  schema_version: 1;
  strokes: Stroke[];
  seed_masks: { change: string | null; keep: string | null };
  instruction: string;
  keep_label: string;
  threshold: number;
  background: boolean;
  mode: "generate" | "import";
  provider: "mock" | "comfyui" | "runninghub";
  raw_candidates: (string | null)[];
  effective_candidates: (string | null)[];
  source_label: string;
  checkpoint: { change: string | null; keep: string | null };
  plan_fingerprint: string | null;
  continuation_starter_id: string | null;
};
export type EditingDraft = {
  id: string;
  source_image: string;
  source_size: [number, number];
  data: DraftData;
  revision: number;
  submitted_run_id: string | null;
};
export type SaveStatus = "Saved" | "Saving" | "Not saved" | "Conflict";

// One write in flight. An ambiguous write keeps its exact body/key until acknowledged.
export class DraftSaver {
  desired: DraftData;
  status: SaveStatus = "Saved";
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<EditingDraft>;
  private ambiguous?: {
    expected_revision: number;
    mutation_key: string;
    data: DraftData;
  };
  private disposed = false;
  constructor(
    public saved: EditingDraft,
    private api: Api,
    private changed: (status: SaveStatus, draft: EditingDraft) => void,
  ) {
    this.desired = saved.data;
  }
  set(data: DraftData) {
    this.desired = structuredClone(data);
    if (this.status === "Conflict") return;
    this.status = "Not saved";
    this.changed(this.status, this.saved);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, 600);
  }
  flush(): Promise<EditingDraft> {
    clearTimeout(this.timer);
    if (this.status === "Conflict")
      return Promise.reject(
        new ApiError("DRAFT_CONFLICT", 409, "DRAFT_CONFLICT"),
      );
    if (this.active) return this.active;
    this.active = this.drain().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async drain() {
    try {
      while (
        this.ambiguous ||
        JSON.stringify(this.desired) !== JSON.stringify(this.saved.data)
      ) {
        this.ambiguous ||= {
          expected_revision: this.saved.revision,
          mutation_key: crypto.randomUUID(),
          data: structuredClone(this.desired),
        };
        this.status = "Saving";
        this.changed(this.status, this.saved);
        const sent = this.ambiguous;
        this.saved = await this.api<EditingDraft>(
          `/editing-drafts/${this.saved.id}`,
          {
            ...jsonPost(this.ambiguous),
            method: "PUT",
          },
        );
        // The schema trims canonical strings. Acknowledge normalization only when
        // no newer local input replaced this exact snapshot while it was in flight.
        if (JSON.stringify(this.desired) === JSON.stringify(sent.data))
          this.desired = structuredClone(this.saved.data);
        this.ambiguous = undefined;
        if (this.disposed) return this.saved;
      }
      this.status = "Saved";
      this.changed(this.status, this.saved);
      return this.saved;
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 409
      )
        this.ambiguous = undefined;
      this.status =
        e instanceof ApiError && e.status === 409 ? "Conflict" : "Not saved";
      this.changed(this.status, this.saved);
      throw e;
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
export function draftContract(data: DraftData): Contract {
  if (!data.checkpoint.change) throw new Error("MASK_REQUIRED");
  return {
    change: { instruction: data.instruction, mask: data.checkpoint.change },
    keep: data.checkpoint.keep
      ? [
          {
            type: "manual_region",
            label: data.keep_label,
            mask: data.checkpoint.keep,
            threshold: data.threshold,
          },
        ]
      : [],
    background_threshold: data.background ? data.threshold : null,
  };
}
export function draftSubmission(draft: EditingDraft, requestKey: string) {
  const d = draft.data;
  return {
    source_image: draft.source_image,
    contract: draftContract(d),
    request_key: requestKey,
    editing_draft_id: draft.id,
    expected_draft_revision: draft.revision,
    ...(d.continuation_starter_id
      ? { continuation_draft_id: d.continuation_starter_id }
      : {}),
    ...(d.mode === "import"
      ? {
          candidate_images: d.effective_candidates,
          source_label: d.source_label,
        }
      : {
          provider: d.provider,
          candidate_count: 3,
          candidate_mode: "strategy-v1",
          preview_fingerprint: d.plan_fingerprint,
        }),
  };
}
export async function submitDraft(api: Api, draft: EditingDraft, key: string) {
  return api<Run>(
    draft.data.mode === "import" ? "/imported-runs" : "/runs",
    jsonPost(draftSubmission(draft, key)),
  );
}
