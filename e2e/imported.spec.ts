import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

const fixture = (letter: string) =>
  `public/fixtures/imported/candidate-${letter.toLowerCase()}.png`;
async function prepare(page: Page) {
  await page.goto("/edit/new");
  await page
    .getByRole("button", { name: "Use Demo — image, instruction & masks" })
    .click();
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await page.getByLabel("Import 3 candidates", { exact: true }).check();
}
async function capture(page: Page, width: number, name: string) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((i) => i.decode().catch(() => {})),
    );
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dir = `docs/screenshots/imported/${width}`;
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
for (const width of [1440, 768, 390]) {
  test(`offline import, same evaluation, Ghost, Receipt and review at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const calls = await (
      await page.request.get("/api/test/provider-calls")
    ).json();
    await prepare(page);
    const cta = page.getByRole("button", {
      name: "Evaluate imported candidates",
    });
    await expect(cta).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Generate 3 candidates" }),
    ).toHaveCount(0);
    for (const letter of ["A", "B", "C"]) {
      await page
        .getByLabel(`Upload Candidate ${letter}`)
        .setInputFiles(fixture(letter));
      await expect(
        page.getByAltText(`Uploaded Candidate ${letter}`),
      ).toBeVisible();
    }
    await page.getByLabel("Source label", { exact: true }).fill(" ");
    await expect(cta).toBeDisabled();
    await page
      .getByLabel("Source label", { exact: true })
      .fill("Deterministic offline fixtures");
    await expect(cta).toBeEnabled();
    await capture(page, width, "import-mode");
    await cta.click();
    await expect(page).toHaveURL(/\/edit\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "The edit. And the evidence." }),
    ).toBeVisible();
    const id = page.url().split("/").pop()!;
    const run = await (await page.request.get(`/api/runs/${id}`)).json();
    expect(run.provider).toBe("imported");
    expect(run.provider_jobs).toEqual([]);
    expect(run.candidates).toHaveLength(3);
    expect(
      run.candidates.every((c: { seed: number | null }) => c.seed === null),
    ).toBe(true);
    await expect(page.locator(".pill")).toHaveText(
      "IMPORTED · Deterministic offline fixtures",
    );
    await expect(
      page.getByRole("button", { name: "Retry Generation" }),
    ).toHaveCount(0);
    await capture(page, width, "result");
    for (const letter of ["A", "B", "C"]) {
      await page
        .getByRole("button", { name: `Inspect Candidate ${letter}` })
        .click();
      await page
        .getByRole("button", { name: "Ghost View", exact: true })
        .click();
      await expect(page.getByTestId("ghost-overlay")).toBeVisible();
      await page.getByRole("button", { name: "View Edit Receipt" }).click();
      const receipt = page.getByRole("region", { name: "Edit Receipt" });
      await expect(receipt).toContainText("external-import");
      await expect(receipt).toContainText(`Reviewing Candidate ${letter}`);
      await page.getByLabel("Your verdict").selectOption("fail");
      await page
        .getByLabel("Human notes")
        .fill(
          "Offline test review only, not a genuine user review of GPT Image.",
        );
      await page.getByRole("button", { name: "Save human review" }).click();
      await expect(page.getByRole("status")).toHaveText("Human review saved.");
      if (letter === "C") await capture(page, width, "ghost-receipt");
    }
    const receipt = await (
      await page.request.get(`/api/runs/${id}/receipt`)
    ).json();
    expect(receipt.generated).toBe(0);
    expect(receipt.imported).toBe(3);
    expect(
      receipt.candidates.every(
        (c: { manual_review: { verdict: string } }) =>
          c.manual_review.verdict === "fail",
      ),
    ).toBe(true);
    expect(receipt.selected.id).toBe(run.selected_candidate_id);
    await page.reload();
    await expect(page.locator(".pill")).toContainText("IMPORTED");
    expect(
      await (await page.request.get("/api/test/provider-calls")).json(),
    ).toEqual(calls);
    expect(errors).toEqual([]);
  });
}
test("imported ambiguous submission refresh never duplicates a run", async ({
  page,
}) => {
  await prepare(page);
  for (const letter of ["A", "B", "C"]) {
    await page
      .getByLabel(`Upload Candidate ${letter}`)
      .setInputFiles(fixture(letter));
    await expect(
      page.getByAltText(`Uploaded Candidate ${letter}`),
    ).toBeVisible();
  }
  let id = "";
  await page.route(
    "**/api/imported-runs",
    async (route) => {
      id = (await (await route.fetch()).json()).id;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Evaluate imported candidates" })
    .click();
  await expect(page.locator('p.error[role="alert"]')).toBeVisible();
  await expect(
    page.getByLabel("Import 3 candidates", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/edit/${id}$`));
  await expect(
    page.getByRole("heading", { name: "The edit. And the evidence." }),
  ).toBeVisible();
  const history = await (await page.request.get("/api/runs")).json();
  expect(history.filter((r: { id: string }) => r.id === id)).toHaveLength(1);
});
test("import mode rejects mismatched candidate without silently resizing", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByLabel("Upload Candidate A")
    .setInputFiles("public/fixtures/keep.png");
  // Same-sized mask PNG remains a legal candidate upload; asset kinds come from upload intent.
  await expect(page.getByAltText("Uploaded Candidate A")).toBeVisible();
  const mismatched = await page.request.get("/fixtures/imported/mismatch.png");
  await page.getByLabel("Upload Candidate A").setInputFiles({
    name: "mismatch.png",
    mimeType: "image/png",
    buffer: await mismatched.body(),
  });
  await expect(page.locator('p.error[role="alert"]')).toContainText(
    "CANDIDATE_SIZE_MISMATCH",
  );
  await expect(page.getByAltText("Uploaded Candidate A")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Evaluate imported candidates" }),
  ).toBeDisabled();
});

test("maximum-length external attribution wraps without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await prepare(page);
  for (const letter of ["A", "B", "C"]) {
    await page
      .getByLabel(`Upload Candidate ${letter}`)
      .setInputFiles(fixture(letter));
    await expect(
      page.getByAltText(`Uploaded Candidate ${letter}`),
    ).toBeVisible();
  }
  const attribution = "X".repeat(80);
  await page.getByLabel("Source label", { exact: true }).fill(attribution);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Evaluate imported candidates" })
    .click();
  await expect(
    page.getByRole("heading", { name: "The edit. And the evidence." }),
  ).toBeVisible();
  await expect(page.locator(".pill")).toHaveText(`IMPORTED · ${attribution}`);
  await page.getByRole("button", { name: "View Edit Receipt" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
