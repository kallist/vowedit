import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`V0.2 saved workbench round trip zh/en at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => {
      // Next cancels speculative RSC fetches when navigation/refresh supersedes them.
      const url = new URL(request.url());
      if (
        url.searchParams.has("_rsc") &&
        request.failure()?.errorText === "net::ERR_ABORTED"
      )
        return;
      failedRequests.push(`${request.url()} ${request.failure()?.errorText}`);
    });
    if (width === 390) {
      await page.goto("/");
      await page.getByRole("button", { name: "Interface language" }).click();
      await expect(
        page.getByRole("link", { name: "试用 VowEdit" }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "界面语言" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "界面语言" }).click();
    }
    await page.goto("/edit/new");
    await page
      .getByRole("button", { name: "Use Demo — image, instruction & masks" })
      .click();
    const base =
      "把外套改成蓝色。保持脸部和头发。" +
      (width === 360
        ? "只在已确认的服装区域内调整颜色，保留结构与细节。".repeat(30)
        : "");
    await page.getByLabel("What would you like to change?").fill(base);
    await page.getByRole("button", { name: "Review edit contract" }).click();
    await expect(
      page.getByRole("heading", { name: "Three modification strategies" }),
    ).toBeVisible();
    await page.locator(".plan-details summary").first().click();
    await expect(
      page.getByText("Original instruction", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Strategy directive", { exact: true }).first(),
    ).toBeVisible();
    const session = await (await page.request.post("/api/browser-session", {headers: {Origin: "http://127.0.0.1:3000"}})).json();
    const plan = await (
      await page.request.post("/api/candidate-plans", {
        data: { instruction: base },
        headers: { Origin: "http://127.0.0.1:3000", "X-Vowedit-CSRF": session.csrf },
      })
    ).json();
    await page.getByRole("button", { name: "Interface language" }).click();
    await expect(
      page.getByRole("heading", { name: "三种修改幅度策略" }),
    ).toBeVisible();
    await expect(
      page.getByText("原始意图", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator(".plan-details dd").first()).toHaveText(base);
    const submitted = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/runs") && request.method() === "POST",
    );
    await page
      .getByRole("button", { name: "生成 3 张候选", exact: true })
      .click();
    const body = (await submitted).postDataJSON();
    expect(body.contract.change.instruction).toBe(base);
    expect(body.preview_fingerprint).toBe(plan.fingerprint);
    await expect(
      page.getByRole("heading", { name: "编辑结果与证据。" }),
    ).toBeVisible();
    const id = page.url().split("/").pop()!;
    const original = await (await page.request.get(`/api/runs/${id}`)).json();
    expect(original.candidate_plan).toEqual(plan);
    expect(original.user_selected_candidate_id).toBeNull();
    await page.getByRole("button", { name: "查看候选 A", exact: true }).click();
    expect(
      (await (await page.request.get(`/api/runs/${id}`)).json())
        .user_selected_candidate_id,
    ).toBeNull();
    await page.getByLabel("前后比较滑块").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("前后比较滑块")).toHaveValue("51");
    await page.getByRole("button", { name: "0%", exact: true }).click();
    await expect(page.getByLabel("前后比较滑块")).toHaveValue("0");
    await page.getByRole("button", { name: "50%", exact: true }).click();
    await page.getByRole("button", { name: "查看编辑收据" }).click();
    await page.getByLabel("你的判断").selectOption("fail");
    const notes = "离线 Mock 验证备注：像素模拟没有完成语义改色。";
    await page.getByLabel("人工备注").fill(notes);
    await page.getByRole("button", { name: "保存人工评审" }).click();
    await expect(page.getByRole("status")).toHaveText("人工评审已保存。");
    await expect(
      page.getByRole("heading", { name: "语义未通过" }),
    ).toBeVisible();
    await page.getByLabel("人工评审未通过", { exact: true }).check();
    const inspected = original.candidates.find(
      (candidate: { index: number }) => candidate.index === 0,
    );
    if (!inspected.evaluation.eligible)
      await page.getByLabel("像素约束不合格", { exact: true }).check();
    await page.getByRole("button", { name: "采用此候选", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "已采用此候选" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "已采用此候选" }),
    ).toBeVisible();
    const saved = await (await page.request.get(`/api/runs/${id}`)).json();
    const adopted = saved.candidates.find(
      (candidate: { id: string }) =>
        candidate.id === saved.user_selected_candidate_id,
    );
    expect(adopted.index).toBe(0);
    expect(adopted.manual_review).toEqual({ verdict: "fail", notes });
    expect(saved.selected_candidate_id).toBe(original.selected_candidate_id);
    if (width === 390) {
      await fs.mkdir(".local/v03-evidence/v02/390", { recursive: true });
      await page.screenshot({
        path: ".local/v03-evidence/v02/390/mock-report-zh.png",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "界面语言" }).click();
    await expect(
      page.getByRole("heading", { name: "Semantic review failed" }),
    ).toBeVisible();
    const receiptBefore = await (
      await page.request.get(`/api/runs/${id}/receipt`)
    ).json();
    await page.getByLabel("Human review failed", { exact: true }).check();
    if (!inspected.evaluation.eligible)
      await page
        .getByLabel("Pixel constraints are not met", { exact: true })
        .check();
    const dir = `.local/v03-evidence/v02/${width}`;
    await fs.mkdir(dir, { recursive: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `${dir}/mock-report.png`, fullPage: true });
    const callsBefore = await (
      await page.request.get("/api/test/provider-calls")
    ).json();
    await page
      .getByRole("button", { name: "Continue Editing", exact: true })
      .click();
    await expect(page).toHaveURL(/\/edit\/new\?draft=/);
    await expect(
      page.getByText("Continue from adopted final image", { exact: true }),
    ).toBeVisible();
    expect(
      await (await page.request.get("/api/test/provider-calls")).json(),
    ).toEqual(callsBefore);
    await expect(page.getByLabel("What would you like to change?")).toHaveValue(
      "",
    );
    await expect(page.locator(".change-dot").first()).toContainText(
      "CHANGE · 0 px",
    );
    await expect(page.locator(".keep-dot").first()).toContainText(
      "KEEP · 0 px",
    );
    const draftId = new URL(page.url()).searchParams.get("draft")!;
    const draft = await (
      await page.request.get(`/api/drafts/${draftId}`)
    ).json();
    expect(
      (
        await (
          await page.request.get(`/api/assets/${draft.source_image}`)
        ).body()
      ).equals(
        await (await page.request.get(`/api/assets/${adopted.image}`)).body(),
      ),
    ).toBe(true);
    expect(
      await (await page.request.get(`/api/runs/${id}/receipt`)).json(),
    ).toEqual(receiptBefore);
    await page.reload();
    await expect(
      page.getByText("Continue from adopted final image", { exact: true }),
    ).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Interface language" }).click();
      await expect(page.getByLabel("你想修改什么？")).toHaveValue("");
      await page.reload();
      await expect(page.getByLabel("你想修改什么？")).toHaveValue("");
      await page.getByRole("button", { name: "界面语言" }).click();
    }
    await page
      .getByLabel("What would you like to change?")
      .fill("Repair the collar only.");
    await page.getByText("Keyboard painting", { exact: true }).click();
    await page.getByRole("button", { name: "Add brush dab" }).click();
    await page.getByRole("button", { name: "Review edit contract" }).click();
    await page
      .getByRole("button", { name: "Generate 3 candidates", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "The edit. And the evidence." }),
    ).toBeVisible();
    const childId = page.url().split("/").pop()!;
    const child = await (await page.request.get(`/api/runs/${childId}`)).json();
    expect(child.parent_run_id).toBe(id);
    expect(child.parent_candidate_id).toBe(adopted.id);
    expect(child.derivation_kind).toBe("continuation");
    expect(child.contract.keep).toEqual([]);
    await expect(
      page.getByText("Not defined", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Your edits", exact: true }).click();
    await expect(page.locator(`a[href="/edit/${childId}"]`)).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Interface language" }).click();
      await expect(
        page.getByRole("link", { name: "编辑历史", exact: true }),
      ).toBeVisible();
      await expect(page.locator(`a[href="/edit/${childId}"]`)).toContainText(
        "Repair the collar only.",
      );
      await page.getByRole("button", { name: "界面语言" }).click();
    }
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll("body *"))
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          text: element.textContent?.slice(0, 90),
        })),
    }));
    expect(overflow.elements).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
}
