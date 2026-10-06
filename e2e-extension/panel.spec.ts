import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Credential } from "../extension/storage";
const apiPort = Number(process.env.VOWEDIT_API_PORT || "8000");
async function overflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const width of [360, 400, 480, 520]) {
  test(`loaded packaged extension paired Mock, shared draft and export at ${width}`, async () => {
    const profile = await fs.mkdtemp(path.resolve(".local/extension-profile-"));
    const extension = path.resolve("extension/dist");
    const options = {
      channel: "chromium",
      headless: true,
      viewport: { width, height: 1000 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    };
    let context = await chromium.launchPersistentContext(profile, options);
    try {
      let worker = context.serviceWorkers()[0];
      if (!worker) worker = await context.waitForEvent("serviceworker");
      const id = new URL(worker.url()).hostname;
      expect(id).toMatch(/^[a-p]{32}$/);
      const errors: string[] = [];
      const milestone = (name: string) =>
        console.log(`extension ${width}: ${name}`);
      const panel = await context.newPage();
      panel.on("pageerror", (e) => errors.push(e.message));
      await panel.goto(`chrome-extension://${id}/sidepanel.html`);
      await panel.getByRole("button", { name: "Interface language" }).click();
      // Explicit English for deterministic commands; Chinese is tested after persistence.
      if (await panel.getByText("需要配对", { exact: true }).count())
        await panel.getByRole("button", { name: "界面语言" }).click();
      if (apiPort !== 8000) {
        await panel
          .getByText("Advanced connection settings", { exact: true })
          .click();
        await panel
          .getByLabel("Local API port", { exact: true })
          .fill(String(apiPort));
        await panel
          .getByRole("button", { name: "Change port and pair again" })
          .click();
      }
      await expect(
        panel.getByText("Pairing required", { exact: true }),
      ).toBeVisible();
      const anonymous = await panel.evaluate(async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
          credentials: "omit",
        });
        return response.status;
      }, apiPort);
      expect(anonymous).toBe(403);
      milestone("paired setup");
      const settings = await context.newPage();
      let approved = 0;
      settings.on("request", (request) => {
        if (request.url().endsWith("/browser-pairing/bootstrap")) approved++;
      });
      if (width === 480) {
        for (const query of [
          "z".repeat(32),
          `${id}%0A`,
          `${id}&extension_id=${id}`,
          `${id}&unexpected=1`,
        ]) {
          await settings.goto(
            `http://127.0.0.1:3000/settings/browser?extension_id=${query}`,
          );
          await expect(
            settings.getByText(
              "Invalid extension ID. Open the pairing page from the extension.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            settings.getByRole("button", {
              name: "Approve extension",
              exact: true,
            }),
          ).toHaveCount(0);
        }
        expect(approved).toBe(0);
      }
      await settings.goto(
        `http://127.0.0.1:3000/settings/browser?extension_id=${id}`,
      );
      await expect(
        settings.getByLabel("Extension ID", { exact: true }),
      ).toHaveValue(id);
      expect(approved).toBe(0);
      await settings.getByRole("button", { name: "Approve extension" }).click();
      const code = settings.locator("section code");
      await expect(code).toBeVisible();
      const once = (await code.textContent())!;
      await settings.getByRole("button", { name: "Hide code" }).click();
      milestone("panel foreground");
      await panel.bringToFront();
      await panel
        .getByLabel("One-time pairing code", { exact: true })
        .fill(once);
      await panel.getByRole("button", { name: "Pair extension" }).click();
      await expect(panel.getByText("Connected", { exact: true })).toBeVisible();
      let network:
        | {
            path: string;
            origin: string | null;
            hasAuth: boolean;
            site: string | null;
          }
        | undefined;
      panel.on("request", (r) => {
        const u = new URL(r.url());
        if (u.pathname === "/api/config" && r.method() === "GET") {
          const h = r.headers();
          network = {
            path: u.pathname,
            origin: h.origin || null,
            hasAuth: !!h.authorization,
            site: h["sec-fetch-site"] || null,
          };
        }
      });
      await panel
        .getByRole("button", { name: "Reconnect", exact: true })
        .click();
      await expect(panel.getByText("Connected", { exact: true })).toBeVisible();
      expect(network?.hasAuth).toBe(true);
      milestone("connected");
      if (width === 480) {
        const endpoint = `http://127.0.0.1:${apiPort}/api/capabilities`;
        await panel.route(endpoint, (route) =>
          route.fulfill({ json: { api_version: "old", features: [] } }),
        );
        await panel
          .getByRole("button", { name: "Reconnect", exact: true })
          .click();
        await expect(
          panel.getByText("Update local VowEdit", { exact: true }),
        ).toBeVisible();
        await expect(
          panel.getByLabel("Upload original image", { exact: true }),
        ).toHaveCount(0);
        await panel.unroute(endpoint);
        await panel.route(endpoint, (route) => route.abort("failed"));
        await panel
          .getByRole("button", { name: "Reconnect", exact: true })
          .click();
        await expect(
          panel.getByText("Local API offline or blocked", { exact: true }),
        ).toBeVisible();
        await panel.unroute(endpoint);
        await panel
          .getByRole("button", { name: "Reconnect", exact: true })
          .click();
        await expect(
          panel.getByText("Connected", { exact: true }),
        ).toBeVisible();
      }
      const remoteRequests: string[] = [];
      panel.on("request", (request) => {
        if (request.url().startsWith("https://handoff.invalid"))
          remoteRequests.push(request.url());
      });
      await panel.locator(".handoff").evaluate((element) => {
        const data = new DataTransfer();
        data.setData("text/uri-list", "https://handoff.invalid/image.png");
        data.setData(
          "text/html",
          '<img src="https://handoff.invalid/image.png">',
        );
        element.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
        );
        element.dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: data }),
        );
      });
      await expect(panel.getByRole("alert")).toContainText(
        "URLs and HTML are not fetched",
      );
      expect(remoteRequests).toEqual([]);
      const createResponse = panel.waitForResponse(
        (r) =>
          r.url().endsWith("/editing-drafts") &&
          r.request().method() === "POST",
      );
      if (width === 360 || width === 400) {
        const fixture = await fs.readFile("public/fixtures/original.png");
        await panel.locator(".handoff").evaluate(
          (element, input) => {
            const data = new DataTransfer();
            data.items.add(
              new File([new Uint8Array(input.bytes)], "original.png", {
                type: "image/png",
              }),
            );
            element.dispatchEvent(
              input.paste
                ? new ClipboardEvent("paste", {
                    bubbles: true,
                    clipboardData: data,
                  })
                : new DragEvent("drop", { bubbles: true, dataTransfer: data }),
            );
          },
          { bytes: [...fixture], paste: width === 360 },
        );
      } else
        await panel
          .getByLabel("Upload original image", { exact: true })
          .setInputFiles("public/fixtures/original.png");
      const draft = await (await createResponse).json();
      await panel
        .getByLabel("What would you like to change?", { exact: true })
        .fill(
          width === 360
            ? "  Change the jacket to blue  "
            : "Change the jacket to blue",
        );
      await panel.getByText("Keyboard painting", { exact: true }).click();
      await panel
        .getByRole("button", { name: "Add brush dab", exact: true })
        .click();
      const surface = panel.getByTestId("mask-surface");
      const box = (await surface.boundingBox())!;
      await surface.click({
        position: { x: box.width * 0.75, y: box.height * 0.5 },
      });
      await panel
        .getByRole("button", { name: "02 / KEEP", exact: true })
        .click();
      await panel.getByLabel("X %", { exact: true }).fill("10");
      await panel.getByLabel("Y %", { exact: true }).fill("10");
      await panel
        .getByRole("button", { name: "Add brush dab", exact: true })
        .click();
      await expect(
        panel.getByRole("status").filter({ hasText: /^Saved ·/ }),
      ).toBeVisible();
      await overflow(panel);
      milestone("draft saved");
      await panel
        .getByLabel("Upload another source", { exact: true })
        .setInputFiles({
          name: "invalid.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("fixture"),
        });
      await expect(panel.getByRole("alert")).toContainText(
        "Upload PNG or JPEG bytes",
      );
      await expect(
        panel.getByLabel("What would you like to change?", { exact: true }),
      ).toHaveValue("Change the jacket to blue");
      if (width === 480) {
        const draftEndpoint = `http://127.0.0.1:${apiPort}/api/editing-drafts/${draft.id}`;
        await panel.route(draftEndpoint, async (route) => {
          if (route.request().method() === "PUT") await route.abort("failed");
          else await route.continue();
        });
        const failedWrite = panel.waitForEvent("requestfailed", {
          predicate: (request) =>
            request.url() === draftEndpoint && request.method() === "PUT",
        });
        const intent = panel.getByLabel("What would you like to change?", {
          exact: true,
        });
        await intent.fill("Reconnect retains unacknowledged local input");
        await failedWrite;
        const capabilities = `http://127.0.0.1:${apiPort}/api/capabilities`;
        await panel.route(capabilities, (route) => route.abort("failed"));
        await panel
          .getByRole("button", { name: "Reconnect", exact: true })
          .click();
        await expect(
          panel.getByText("Local API offline or blocked", { exact: true }),
        ).toBeVisible();
        await expect(intent).toHaveValue(
          "Reconnect retains unacknowledged local input",
        );
        await expect(intent).toBeDisabled();
        await panel.unroute(capabilities);
        await panel.unroute(draftEndpoint);
        await panel
          .getByRole("button", { name: "Reconnect", exact: true })
          .click();
        await expect(
          panel.getByText("Connected", { exact: true }),
        ).toBeVisible();
        await expect(intent).toHaveValue(
          "Reconnect retains unacknowledged local input",
        );
        await intent.fill("Change the jacket to blue");
        await expect(
          panel.getByRole("status").filter({ hasText: /^Saved ·/ }),
        ).toBeVisible();
      }
      const full = await context.newPage();
      const fullErrors: string[] = [];
      full.on("pageerror", (e) => fullErrors.push(e.message));
      await full.goto(
        `http://127.0.0.1:3000/edit/new?editing_draft=${draft.id}`,
      );
      try {
        await expect(
          full.getByLabel("What would you like to change?", { exact: true }),
        ).toHaveValue("Change the jacket to blue");
      } catch (error) {
        await fs.writeFile(
          ".local/v021-full-debug.json",
          JSON.stringify(
            {
              url: full.url(),
              fullErrors,
              body: await full.locator("body").innerText(),
            },
            null,
            2,
          ),
        );
        throw error;
      }
      await full
        .getByLabel("What would you like to change?", { exact: true })
        .fill("Change the jacket to white");
      await expect(
        full.getByRole("status").filter({ hasText: /^Saved ·/ }),
      ).toBeVisible();
      milestone("panel foreground");
      await panel.bringToFront();
      await panel
        .getByLabel("What would you like to change?", { exact: true })
        .fill("Unsaved conflict intent");
      await expect(
        panel.getByRole("alert").filter({ hasText: "Another view" }),
      ).toBeVisible();
      milestone("conflict observed");
      await expect(
        panel.getByLabel("What would you like to change?", { exact: true }),
      ).toHaveValue("Unsaved conflict intent");
      await panel.getByRole("button", { name: "Reload saved state" }).click();
      milestone("reload requested");
      await expect(
        panel.getByLabel("What would you like to change?", { exact: true }),
      ).toHaveValue("Change the jacket to white");
      milestone("reload restored");
      if (width === 400) {
        await panel
          .getByLabel("Choose candidate source", { exact: true })
          .selectOption("import");
        await panel
          .getByLabel("Source label", { exact: true })
          .fill("Offline panel fixture import");
      }
      await panel
        .getByRole("button", { name: "Review edit contract", exact: true })
        .click();
      await expect(
        panel.getByText("Three modification strategies", { exact: true }),
      ).toBeVisible();
      milestone("checkpoint saved");
      const pixels = await panel.evaluate(
        async ({ port, draftId }) => {
          const credential = (await chrome.storage.local.get("credential"))
            .credential as Credential;
          const headers = {
            Authorization: `Bearer ${credential.token}`,
            "X-VowEdit-Extension-Origin": credential.origin,
          };
          const draft = await (
            await fetch(
              `http://127.0.0.1:${port}/api/editing-drafts/${draftId}`,
              { headers },
            )
          ).json();
          const image = await createImageBitmap(
            await (
              await fetch(
                `http://127.0.0.1:${port}/api/assets/${draft.data.checkpoint.change}`,
                { headers },
              )
            ).blob(),
          );
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return {
            point: draft.data.strokes[1].points[0],
            pixel: [...context.getImageData(480, 352, 1, 1).data],
            size: [image.width, image.height],
          };
        },
        { port: apiPort, draftId: draft.id },
      );
      expect(pixels.size).toEqual([640, 704]);
      expect(pixels.point.x).toBeCloseTo(480, 0);
      expect(pixels.point.y).toBeCloseTo(352, 0);
      expect(pixels.pixel).toEqual([255, 255, 255, 255]);
      if (width === 400) {
        for (const letter of ["A", "B", "C"]) {
          const input = panel.getByLabel(`Upload Candidate ${letter}`, {
            exact: true,
          });
          // setInputFiles can bypass disabled controls; real file picking cannot.
          await expect(input).toBeEnabled();
          await input.setInputFiles("public/fixtures/imported/mismatch.png");
          await expect(
            panel.getByAltText(`Candidate ${letter}`, { exact: true }),
          ).toBeVisible();
          await expect(
            panel.getByRole("status").filter({ hasText: /^Saved ·/ }),
          ).toBeVisible();
          await expect(input).toBeEnabled();
        }
        await expect(
          panel.getByRole("button", {
            name: "Evaluate imported candidates",
            exact: true,
          }),
        ).toBeDisabled();
        await panel
          .getByRole("button", {
            name: "Apply VowEdit Boundary Lock",
            exact: true,
          })
          .click();
        await expect(
          panel.getByRole("button", {
            name: "Evaluate imported candidates",
            exact: true,
          }),
        ).toBeEnabled();
      }
      let acceptLost!: (value: { id: string }) => void;
      const lost =
        width === 360
          ? new Promise<{ id: string }>((resolve) => {
              acceptLost = resolve;
            })
          : undefined;
      if (lost)
        await panel.route(
          `http://127.0.0.1:${apiPort}/api/runs`,
          async (route) => {
            if (route.request().method() !== "POST") {
              await route.continue();
              return;
            }
            const response = await route.fetch();
            acceptLost(await response.json());
            await route.abort("failed");
          },
        );
      const submitted = !lost
        ? panel.waitForResponse(
            (r) =>
              r
                .url()
                .endsWith(width === 400 ? "/api/imported-runs" : "/api/runs") &&
              r.request().method() === "POST",
          )
        : undefined;
      await panel
        .getByRole("button", {
          name:
            width === 400
              ? "Evaluate imported candidates"
              : "Generate 3 candidates",
          exact: true,
        })
        .click();
      milestone("run submitted");
      const run = lost ? await lost : await (await submitted!).json();
      if (lost) {
        await expect(panel.getByRole("alert")).toContainText(
          "Connection failed. Reconnect to local VowEdit.",
        );
        await panel.unroute(`http://127.0.0.1:${apiPort}/api/runs`);
        await panel.reload();
      }
      await expect(
        panel.getByText("The edit. And the evidence.", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      const onlyOne = await panel.evaluate(
        async ({ port, source }) => {
          const credential = (await chrome.storage.local.get("credential"))
            .credential as Credential;
          const headers = {
            Authorization: `Bearer ${credential.token}`,
            "X-VowEdit-Extension-Origin": credential.origin,
          };
          const history = await (
            await fetch(`http://127.0.0.1:${port}/api/runs`, { headers })
          ).json();
          return history.filter(
            (entry: { source_image: string }) => entry.source_image === source,
          ).length;
        },
        { port: apiPort, source: draft.source_image },
      );
      expect(onlyOne).toBe(1);
      await overflow(panel);
      await panel.getByLabel("Before after slider", { exact: true }).focus();
      await panel.keyboard.press("ArrowRight");
      await panel
        .getByRole("button", { name: "Ghost View", exact: true })
        .click();
      if (width === 400) {
        await expect(
          panel.getByText(
            "Boundary Lock preservation comes from compositing.",
            { exact: true },
          ),
        ).toBeVisible();
        await panel
          .getByRole("button", { name: "View Edit Receipt", exact: true })
          .click();
        await panel
          .getByLabel("Your verdict", { exact: true })
          .selectOption("fail");
        await panel
          .getByLabel("Human notes", { exact: true })
          .fill(
            "Controlled fixture review; semantic FAIL is retained after adoption.",
          );
        await panel
          .getByRole("button", { name: "Save human review", exact: true })
          .click();
        await expect(
          panel.getByText("Human review saved.", { exact: true }),
        ).toBeVisible();
      }
      for (const checkbox of await panel
        .locator(".decisions input[type=checkbox]")
        .all())
        await checkbox.check();
      await panel
        .getByRole("button", { name: "Adopt this candidate", exact: true })
        .click();
      await expect(
        panel.getByRole("button", { name: "Adopted candidate", exact: true }),
      ).toBeVisible();
      milestone("adopted");
      if (width === 400)
        await expect(
          panel.getByText("Human FAIL remains FAIL after adoption.", {
            exact: true,
          }),
        ).toBeVisible();
      const download = panel.waitForEvent("download");
      await expect(
        panel.getByRole("button", {
          name: "Download adopted final PNG",
          exact: true,
        }),
      ).toBeEnabled({ timeout: 10000 });
      await panel
        .getByRole("button", {
          name: "Download adopted final PNG",
          exact: true,
        })
        .click();
      milestone("downloaded");
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^vowedit-final-.*\.png$/);
      const bytes = await fs.readFile((await file.path())!);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      const adoptedHash = await panel.evaluate(
        async ({ port, runId }) => {
          const credential = (await chrome.storage.local.get("credential"))
            .credential as Credential;
          const headers = {
            Authorization: `Bearer ${credential.token}`,
            "X-VowEdit-Extension-Origin": credential.origin,
          };
          const run = await (
            await fetch(`http://127.0.0.1:${port}/api/runs/${runId}`, {
              headers,
            })
          ).json();
          const image = run.candidates.find(
            (c: { id: string }) => c.id === run.user_selected_candidate_id,
          ).image;
          const blob = await (
            await fetch(`http://127.0.0.1:${port}/api/assets/${image}`, {
              headers,
            })
          ).arrayBuffer();
          return [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", blob)),
          ]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
        },
        { port: apiPort, runId: run.id },
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        adoptedHash,
      );
      await panel
        .getByRole("button", { name: "Copy adopted final PNG", exact: true })
        .click();
      await expect(panel.getByRole("alert")).toContainText(
        /Adopted final PNG copied|Copy failed/,
      );
      const copyOutcome = await panel.getByRole("alert").textContent();
      milestone("copied");
      await panel.reload();
      await expect(
        panel.getByRole("button", { name: "Adopted candidate", exact: true }),
      ).toBeVisible();
      await panel.getByRole("button", { name: "Interface language" }).click();
      await overflow(panel);
      const dir = "docs/screenshots/v021";
      await fs.mkdir(dir, { recursive: true });
      await panel.screenshot({
        path: `${dir}/extension-${width}.png`,
        fullPage: true,
      });
      for (const checkbox of await panel
        .locator(".decisions input[type=checkbox]")
        .all())
        await checkbox.check();
      await panel
        .getByRole("button", { name: "继续编辑", exact: true })
        .click();
      await expect(
        panel.getByLabel("你想修改什么？", { exact: true }),
      ).toHaveValue("");
      if (width === 360) {
        await panel
          .getByLabel("你想修改什么？", { exact: true })
          .fill("Browser restart retains acknowledged intent");
        await expect(
          panel.getByRole("status").filter({ hasText: /^已保存 ·/ }),
        ).toBeVisible();
        await context.close();
        context = await chromium.launchPersistentContext(profile, options);
        const restored = await context.newPage();
        await restored.goto(`chrome-extension://${id}/sidepanel.html`);
        await expect(
          restored.getByLabel("你想修改什么？", { exact: true }),
        ).toHaveValue("Browser restart retains acknowledged intent");
        await expect(
          restored.getByText("已连接", { exact: true }),
        ).toBeVisible();
      }
      await fs.mkdir(".local/v021-evidence", { recursive: true });
      await fs.writeFile(
        `.local/v021-evidence/network-${width}.json`,
        JSON.stringify(
          {
            environment: "automated bundled Chromium extension page",
            network,
            draft: draft.id,
            run: run.id,
            copy: copyOutcome,
            download: "PNG bytes SHA-256 equals adopted final asset",
            browser_restart:
              width === 360
                ? "same isolated bundled Chromium profile restored paired draft"
                : "not tested at this width",
          },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await fs.rm(profile, { recursive: true, force: true });
    }
  });
}
