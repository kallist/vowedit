import { expect, test } from "@playwright/test";

test("partial preparation resumes saved slots; invalid replacement preserves prepared asset", async ({
  page,
}) => {
  await page.goto("/edit/new");
  await page
    .getByRole("button", { name: "Use Demo — image, instruction & masks" })
    .click();
  await page.getByRole("button", { name: "Review edit contract" }).click();
  await page.getByLabel("Import 3 candidates", { exact: true }).check();
  for (const letter of ["A", "B", "C"]) {
    await page
      .getByLabel(`Upload Candidate ${letter}`)
      .setInputFiles("public/fixtures/imported/mismatch.png");
    await expect(
      page.getByAltText(`Uploaded Candidate ${letter}`),
    ).toBeVisible();
  }
  const rawRequests: string[] = [];
  await page.route("**/api/prepared-candidates", async (route) => {
    rawRequests.push(route.request().postDataJSON().candidate_image);
    if (rawRequests.length === 2)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "STORAGE_FAILED",
            message: "Controlled offline storage failure.",
          },
        }),
      });
    else await route.continue();
  });
  const lock = page.getByRole("button", {
    name: "Apply VowEdit Boundary Lock",
  });
  const evaluate = page.getByRole("button", {
    name: "Evaluate imported candidates",
  });
  await lock.click();
  await expect(page.locator('p.error[role="alert"]')).toContainText(
    "Controlled offline storage failure",
  );
  await expect(
    page.getByText("BOUNDARY LOCKED · prepared asset", { exact: false }),
  ).toHaveCount(1);
  await expect(evaluate).toBeDisabled();
  const first = await page
    .getByAltText("Uploaded Candidate A")
    .getAttribute("src");
  await lock.click();
  await expect(evaluate).toBeEnabled();
  expect(rawRequests).toHaveLength(4);
  expect(rawRequests[2]).toBe(rawRequests[1]);
  expect(rawRequests.filter((id) => id === rawRequests[0])).toHaveLength(1);
  await expect(page.getByAltText("Uploaded Candidate A")).toHaveAttribute(
    "src",
    first!,
  );
  await page
    .getByLabel("Upload Candidate A")
    .setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.locator('p.error[role="alert"]')).toContainText(
    "This file could not be decoded safely.",
  );
  await expect(evaluate).toBeEnabled();
  await expect(page.getByAltText("Uploaded Candidate A")).toHaveAttribute(
    "src",
    first!,
  );
  await page
    .getByLabel("Source label", { exact: true })
    .fill("Changed attribution requires preparation");
  await expect(evaluate).toBeDisabled();
  await expect(
    page.getByText("BOUNDARY LOCKED · prepared asset", { exact: false }),
  ).toHaveCount(0);
});
