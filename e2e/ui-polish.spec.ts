import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

// Layout changes must keep the displayed image, overlay and exported source pixels aligned.
for (const width of [1440, 1024, 768, 390, 360]) {
  test(`proofing desk preserves brush geometry and keyboard access at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/edit/new");
    await page.getByLabel("Upload original image").setInputFiles("public/fixtures/original.png");
    const surface = page.getByTestId("mask-surface");
    await expect(surface).toBeVisible();
    const directory = `.local/ui-evidence/${width}`;
    await fs.mkdir(directory, { recursive: true });
    for (const zoom of [1, 2]) {
      // CSS zoom scales pointer coordinates; viewport tests separately exercise media-query reflow.
      await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
      await page.getByRole("button", { name: "Reset both masks" }).click();
      await page.getByLabel("Brush size").fill("20");
      await surface.scrollIntoViewIfNeeded();
      const image = page.locator(".paint-frame img");
      await image.evaluate(async (element: HTMLImageElement) => { await element.decode(); });
      const box = (await surface.boundingBox())!;
      const imageBox = (await image.boundingBox())!;
      expect(Math.abs(box.width / box.height - 640 / 704)).toBeLessThan(.002);
      expect(Math.abs(box.width - imageBox.width)).toBeLessThan(1);
      expect(Math.abs(box.height - imageBox.height)).toBeLessThan(1);
      await page.mouse.click(box.x + box.width * .25, box.y + box.height * .75);
      await expect.poll(() => surface.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(160, 528, 1, 1).data[3])).toBeGreaterThan(0);
      expect(await surface.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(480, 176, 1, 1).data[3])).toBe(0);
      const widthAtZoom = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(widthAtZoom.scroll).toBeLessThanOrEqual(widthAtZoom.client + 1);
      await page.screenshot({ path: `${directory}/brush-zoom-${zoom}.png`, fullPage: true });
      await page.getByRole("button", { name: "02 / KEEP" }).click();
      await expect(page.getByRole("button", { name: "02 / KEEP" })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "01 / CHANGE" }).click();
      await page.getByText("Keyboard painting", { exact: true }).click();
      await page.getByLabel("X %").fill("75");
      await page.getByLabel("Y %").fill("25");
      await page.getByRole("button", { name: "Add brush dab" }).click();
      await expect.poll(() => surface.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(480, 176, 1, 1).data[3])).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Undo last stroke" }).click();
      await expect.poll(() => surface.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(480, 176, 1, 1).data[3])).toBe(0);
      await page.getByText("Keyboard painting", { exact: true }).click();
    }
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "02 / KEEP" }).click();
    expect(await page.locator(".mode-buttons").evaluate(el => getComputedStyle(el, "::before").transitionDuration)).toBe("0s");
    await page.getByRole("button", { name: "Interface language" }).click();
    await expect(page.getByRole("button", { name: "检查编辑契约" })).toBeVisible();
    await page.getByLabel("你想修改什么？").fill("只改变外套颜色，保留边界。".repeat(50));
    await page.screenshot({ path: `${directory}/editor-zh-long.png`, fullPage: true });
    // Exported masks are independent of the selected tool, UI language and effects.
    await page.getByRole("button", { name: "检查编辑契约" }).click();
    await expect(page.getByRole("heading", { name: "像素生成前，先约定边界。" })).toBeVisible();
    await page.getByRole("button", { name: "生成 3 张候选", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\/[0-9a-f-]+$/);
    const run = await (await page.request.get(`/api/runs/${page.url().split("/").pop()}`)).json();
    const exported = await page.evaluate(async mask => {
      const image = new Image(); image.src = `/api/assets/${mask}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, painted: ctx.getImageData(160, 528, 1, 1).data[0], undone: ctx.getImageData(480, 176, 1, 1).data[0] };
    }, run.contract.change.mask);
    expect(exported).toEqual({ width: 640, height: 704, painted: 255, undone: 0 });
    if (width <= 390) {
      await expect.poll(async () => (await (await page.request.get(`/api/runs/${run.id}`)).json()).status, { timeout: 20000 }).toBe("completed");
      await expect(page.getByTestId("comparison-image")).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      for (const view of ["修改前 / 后", "Ghost 视图"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        const image = page.getByTestId("comparison-image");
        await image.scrollIntoViewIfNeeded();
        const picture = (await image.boundingBox())!;
        const mat = (await page.locator(".comparison-mat").boundingBox())!;
        // Excessive desktop padding made a 200% mobile picture smaller than its usable canvas.
        expect(picture.width).toBeGreaterThan(mat.width * .75);
        expect(Math.abs(picture.width / picture.height - 640 / 704)).toBeLessThan(.002);
        await page.screenshot({ path: `${directory}/${view.includes("Ghost") ? "ghost" : "compare"}-200.png` });
      }
    }
  });
}

test("unknown-provider warning remains readable at narrow zoom and cannot retry", async ({ page }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  await page.addInitScript(() => localStorage.setItem("vowedit.locale", "zh-CN"));
  // Only browser responses are controlled here; no provider call or persisted run is created.
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/browser-session") ? { csrf: "controlled-fixture" }
      : path === `/api/runs/${id}` ? {
        id, job_id: id, source_image: id, status: "failed_generation", provider: "mock",
        contract: { change: { mask: id, instruction: "受控错误布局 fixture" }, keep: [] },
        candidates: [], selected_candidate_id: null, no_good_candidate: false,
        generation_retry_safe: false, error: { code: "PROVIDER_STATE_UNKNOWN", message: "Fixture" },
        failures: [], created_at: "2026-10-07T00:00:00Z",
      } : path.endsWith("/actions") ? [] : { entries: [], next_cursor: 0 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/edit/${id}`);
  await expect(page.getByRole("heading", { name: "生成未能完成。" })).toBeVisible();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    const card = (await page.locator(".failure-state").boundingBox())!;
    const content = (await page.locator(".failure-state > div").boundingBox())!;
    // The icon must not consume the text column at 200%; this failed with the old flex row.
    expect(content.width).toBeGreaterThan(card.width * .7);
    await expect(page.getByRole("button", { name: "重试生成" })).toBeDisabled();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  }
});
