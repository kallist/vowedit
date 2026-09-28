import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
async function capture(page: Page, width: number, name: string) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const directory = path.join("docs", "screenshots", String(width));
  await fs.mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    fullPage: true,
  });
}
async function paint(page: Page) {
  const surface = page.getByTestId("mask-surface");
  await expect(surface).toBeVisible();
  await page.getByLabel("Brush size").fill("120");
  await surface.scrollIntoViewIfNeeded();
  let box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.47, box.y + box.height * 0.61);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.69, {
    steps: 8,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "02 / KEEP" }).click();
  await surface.scrollIntoViewIfNeeded();
  box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.26);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.3, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator(".keep-dot").first()).not.toContainText(
    "KEEP · 0 px",
  );
}
for (const width of [1440, 768, 390]) {
  test(`full product flow and visual evidence at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Try VowEdit" })).toBeVisible();
    await capture(page, width, "landing");
    await page.getByRole("link", { name: "Try VowEdit" }).click();
    await page
      .getByLabel("Upload original image")
      .setInputFiles("public/fixtures/original.png");
    await page
      .getByLabel("What would you like to change?")
      .fill("Change the jacket to cool blue.");
    await paint(page);
    await capture(page, width, "mask-editor");
    await page.getByRole("button", { name: "Review edit contract" }).click();
    await expect(
      page.getByRole("heading", { name: "A promise, before the pixels." }),
    ).toBeVisible();
    await capture(page, width, "constraint-summary");
    // Returning to the editor must not discard either mask.
    await page.getByRole("button", { name: "Edit the contract" }).click();
    await expect(page.locator(".keep-dot").first()).not.toContainText(
      "KEEP · 0 px",
    );
    await expect(page.locator(".change-dot").first()).not.toContainText(
      "CHANGE · 0 px",
    );
    await page.getByRole("button", { name: "Review edit contract" }).click();
    await page.getByRole("button", { name: "Generate 3 candidates" }).click();
    await expect(page).toHaveURL(/\/edit\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "A little change, under review." }),
    ).toBeVisible();
    await capture(page, width, "processing");
    await expect(
      page.getByRole("button", { name: "Inspect Candidate B" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "The edit. And the evidence." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Inspect Candidate B" }),
    ).toHaveAttribute("aria-pressed", "true");
    const id = page.url().split("/").pop()!;
    const response = await page.request.get(`/api/runs/${id}`),
      run = await response.json();
    expect(run.status).toBe("completed");
    expect(run.candidates).toHaveLength(3);
    expect(run.candidates[0].index).toBe(1);
    expect(run.candidates[0].evaluation.protected_similarity).toBe(100);
    await capture(page, width, "result");
    await page.getByLabel("Before after slider").fill("25");
    await expect(page.locator(".before-layer")).toHaveAttribute("style", /75%/);
    await page.getByRole("button", { name: "Inspect Candidate A" }).click();
    await expect(
      page.getByRole("button", { name: "Inspect Candidate A" }),
    ).toHaveAttribute("aria-pressed", "true");
    await capture(page, width, "candidate-comparison");
    await page.getByRole("button", { name: "Ghost View", exact: true }).click();
    await expect(page.getByTestId("ghost-overlay")).toBeVisible();
    expect(
      await page
        .getByTestId("ghost-overlay")
        .evaluate((img: HTMLImageElement) => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          return d.some((v, i) => i % 4 === 3 && v > 0);
        }),
    ).toBe(true);
    await capture(page, width, "ghost-view");
    await page.getByRole("button", { name: "View Edit Receipt" }).click();
    await expect(
      page.getByRole("region", { name: "Edit Receipt" }),
    ).toContainText("Candidate B");
    await page.getByLabel("Your verdict").selectOption("fail");
    await page
      .getByLabel("Human notes")
      .fill(
        "The mock preserves the face, but inverted pixels do not prove a blue jacket.",
      );
    await page.getByRole("button", { name: "Save human review" }).click();
    await expect(page.getByRole("status")).toContainText("Human review saved.");
    await capture(page, width, "edit-receipt");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export JSON" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain(id);
    const receipt = await (
      await page.request.get(`/api/runs/${id}/receipt`)
    ).json();
    expect(receipt.selected.index).toBe(1);
    expect(receipt.selected.manual_review.verdict).toBe("fail");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Inspect Candidate B" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Your edits" }).click();
    await expect(page.locator(`a[href="/edit/${id}"]`)).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test("provider outage recovers without repainting", async ({ page }) => {
  await page.goto("/edit/new");
  await page
    .getByLabel("Upload original image")
    .setInputFiles("public/fixtures/original.png");
  await page
    .getByLabel("What would you like to change?")
    .fill("Test provider recovery");
  await paint(page);
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await page.getByRole("button", { name: "Generate 3 candidates" }).click();
  await expect(
    page.getByRole("heading", { name: "Generation could not finish." }),
  ).toBeVisible();
  const failedId = page.url().split("/").pop();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(page, width, "failure-state");
  }
  let retryId = "";
  await page.route(
    "**/retry-generation",
    async (route) => {
      retryId = (await (await route.fetch()).json()).id;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Retry Generation" }).click();
  await expect(page.locator('p.error[role="alert"]')).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry Generation" }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${retryId}$`));
  await expect(page).not.toHaveURL(new RegExp(`/edit/${failedId}$`));
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/runs/${page.url().split("/").pop()}`,
      );
      return (await response.json()).status;
    })
    .toBe("completed");
  await expect(
    page.getByRole("heading", { name: "The edit. And the evidence." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect Candidate B" }),
  ).toBeVisible();
  const next = await (
    await page.request.get(`/api/runs/${page.url().split("/").pop()}`)
  ).json();
  expect(next.parent_run_id).toBe(failedId);
  expect(next.candidates).toHaveLength(3);
});
test("mask validation, erase, undo, clear and reset work", async ({ page }) => {
  await page.goto("/edit/new");
  await page
    .getByLabel("Upload original image")
    .setInputFiles("public/fixtures/original.png");
  await page.getByLabel("What would you like to change?").fill("Change jacket");
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText(
    "Paint an area",
  );
  await paint(page);
  await page.getByRole("button", { name: "Undo last stroke" }).click();
  await expect(page.locator(".keep-dot").first()).toContainText("KEEP · 0 px");
  await page.getByTestId("mask-surface").scrollIntoViewIfNeeded();
  let box = (await page.getByTestId("mask-surface").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.49, box.y + box.height * 0.65);
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await expect(page.locator('.error[role="alert"]')).toContainText("overlap");
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await page.getByLabel("Brush size").fill("180");
  await page.getByTestId("mask-surface").scrollIntoViewIfNeeded();
  box = (await page.getByTestId("mask-surface").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.49, box.y + box.height * 0.65);
  await expect(page.locator(".keep-dot").first()).toContainText("KEEP · 0 px");
  await page.getByRole("button", { name: "Clear current mask" }).click();
  await page.getByRole("button", { name: "Reset both masks" }).click();
  await expect(page.locator(".change-dot").first()).toContainText(
    "CHANGE · 0 px",
  );
});

test("lost submission response and refresh reuse the same request key", async ({
  page,
}) => {
  await page.goto("/edit/new");
  await page
    .getByLabel("Upload original image")
    .setInputFiles("public/fixtures/original.png");
  await page
    .getByLabel("What would you like to change?")
    .fill("Test response recovery");
  await paint(page);
  await page.getByRole("button", { name: "Review edit contract" }).click();
  let originalId = "";
  await page.route(
    "**/api/runs",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      originalId = (await response.json()).id;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Generate 3 candidates" }).click();
  await expect(page.locator('.error[role="alert"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit the contract" }),
  ).toBeDisabled();
  await page.route("**/api/runs", (route) => route.abort("failed"), {
    times: 1,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry submission recovery" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose an image" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry submission recovery" }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${originalId}$`));
  await expect(
    page.getByRole("heading", { name: "The edit. And the evidence." }),
  ).toBeVisible();
  const history = await (await page.request.get("/api/runs")).json();
  expect(
    history.filter(
      (r: { contract: { change: { instruction: string } } }) =>
        r.contract.change.instruction === "Test response recovery",
    ),
  ).toHaveLength(1);
});

test("no meaningful edit produces no selected candidate", async ({ page }) => {
  await page.goto("/edit/new");
  await page
    .getByLabel("Upload original image")
    .setInputFiles("public/fixtures/original.png");
  await page
    .getByLabel("What would you like to change?")
    .fill("Test no qualifying edit");
  await paint(page);
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await page.getByRole("button", { name: "Generate 3 candidates" }).click();
  await expect(
    page.getByText("No candidate fully satisfied your constraints."),
  ).toBeVisible();
  await expect(page.locator(".candidate-card")).toHaveCount(3);
  await expect(page.locator(".suggested")).toHaveCount(0);
  await page.getByRole("button", { name: "View Edit Receipt" }).click();
  await expect(
    page.getByRole("heading", { name: "No qualifying candidate" }),
  ).toBeVisible();
});
