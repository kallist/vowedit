import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

for (const width of [1440, 768, 390]) {
  test(`explicit boundary preparation then evaluation at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await (
      await page.request.get("/api/test/provider-calls")
    ).json();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let preparations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/prepared-candidates")) preparations++;
    });
    await page.goto("/edit/new");
    await page
      .getByRole("button", { name: "Use Demo — image, instruction & masks" })
      .click();
    await page.getByRole("button", { name: "Review edit contract" }).click();
    await page.getByLabel("Import 3 candidates", { exact: true }).check();
    await page
      .getByLabel("Source label", { exact: true })
      .fill("Offline Boundary Lock fixture");
    for (const letter of ["A", "B", "C"]) {
      await page
        .getByLabel(`Upload Candidate ${letter}`)
        .setInputFiles("public/fixtures/imported/mismatch.png");
      await expect(
        page.getByAltText(`Uploaded Candidate ${letter}`),
      ).toBeVisible();
    }
    const evaluate = page.getByRole("button", {
      name: "Evaluate imported candidates",
    });
    await expect(evaluate).toBeDisabled();
    expect(preparations).toBe(0);
    await expect(
      page.getByText("Raw · 64 × 64 px", { exact: false }),
    ).toHaveCount(3);
    await expect(
      page.getByText("Target · 640 × 704 px", { exact: false }),
    ).toHaveCount(3);
    await expect(
      page.getByText("Outside CHANGE stays exactly original.", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apply VowEdit Boundary Lock" })
      .click();
    await expect(evaluate).toBeEnabled();
    expect(preparations).toBe(3);
    await expect(
      page.getByText("BOUNDARY LOCKED · prepared asset", { exact: false }),
    ).toHaveCount(3);
    const dir = `docs/screenshots/boundary/${width}`;
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/prepared.png`, fullPage: true });
    await evaluate.click();
    await expect(
      page.getByRole("heading", { name: "The edit. And the evidence." }),
    ).toBeVisible();
    await expect(page.locator(".pill")).toContainText("IMPORTED");
    for (const letter of ["A", "B", "C"]) {
      await page
        .getByRole("button", { name: `Inspect Candidate ${letter}` })
        .click();
      await expect(
        page.getByText("BOUNDARY LOCKED · VowEdit Boundary Lock", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Raw external", exact: true })
        .click();
      await expect(
        page.getByAltText(`Candidate ${letter} raw external image`),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Ghost View", exact: true })
        .click();
      await expect(page.getByTestId("ghost-overlay")).toBeVisible();
      await page.getByRole("button", { name: "View Edit Receipt" }).click();
      await expect(
        page.getByRole("region", { name: "Edit Receipt" }),
      ).toContainText("Constraint enforcement: VowEdit Boundary Lock");
      await expect(page.getByLabel("Your verdict")).toHaveValue("pending");
    }
    const id = page.url().split("/").pop();
    const receipt = await (
      await page.request.get(`/api/runs/${id}/receipt`)
    ).json();
    expect(receipt.generated).toBe(0);
    expect(receipt.constraint_enforcement).toHaveLength(3);
    expect(
      receipt.candidates.every(
        (c: {
          evaluation: {
            unexpected_drift: number;
            protected_similarity: number;
          };
        }) =>
          c.evaluation.unexpected_drift === 0 &&
          c.evaluation.protected_similarity === 100,
      ),
    ).toBe(true);
    expect(
      await (await page.request.get("/api/test/provider-calls")).json(),
    ).toEqual(calls);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `${dir}/ghost-receipt.png`, fullPage: true });
    await page.reload();
    await expect(
      page.getByText("BOUNDARY LOCKED · VowEdit Boundary Lock", {
        exact: true,
      }),
    ).toBeVisible();
    expect(preparations).toBe(3);
  });
}
