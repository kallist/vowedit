import { test, expect } from "@playwright/test";
test("lost continuation response survives refresh and returns the same starter without generation", async ({
  page,
}) => {
  await page.goto("/edit/new");
  await page
    .getByRole("button", { name: "Use Demo — image, instruction & masks" })
    .click();
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await page
    .getByRole("button", { name: "Generate 3 candidates", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The edit. And the evidence." }),
  ).toBeVisible();
  const id = page.url().split("/").pop()!;
  await page.getByLabel("Human review is pending", { exact: true }).check();
  await page
    .getByRole("button", { name: "Adopt this candidate", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Adopted candidate" }),
  ).toBeVisible();
  const calls = await (
    await page.request.get("/api/test/provider-calls")
  ).json();
  let accepted: { id: string; source_image: string } | null = null;
  let first = true;
  const requests: unknown[] = [];
  await page.route("**/api/runs/*/continuations", async (route) => {
    requests.push(route.request().postDataJSON());
    if (first) {
      first = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      accepted = await response.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Continue Editing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Recover continuation", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Recover continuation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recover continuation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/edit\/new\?draft=/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(new URL(page.url()).searchParams.get("draft")).toBe(accepted!.id);
  expect(
    await (await page.request.get("/api/test/provider-calls")).json(),
  ).toEqual(calls);
  const run = await (await page.request.get(`/api/runs/${id}`)).json();
  expect(run.continuation_starters).toHaveLength(1);
});
