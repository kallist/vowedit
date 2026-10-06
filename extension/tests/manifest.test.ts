import { expect, it } from "vitest";
import fs from "node:fs";
import manifest from "../manifest.json";
it("freezes minimum permissions and packaged execution", () => {
  expect(manifest.permissions).toEqual([
    "sidePanel",
    "storage",
    "clipboardWrite",
  ]);
  expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.minimum_chrome_version).toBe("116");
  expect(manifest.side_panel.default_path).toBe("sidepanel.html");
  for (const key of [
    "content_scripts",
    "externally_connectable",
    "web_accessible_resources",
  ])
    expect(manifest).not.toHaveProperty(key);
  expect(manifest.action).not.toHaveProperty("default_popup");
  const csp = manifest.content_security_policy.extension_pages;
  expect(csp).toContain(
    "script-src 'self'; object-src 'none'; frame-src 'none'",
  );
  expect(csp).not.toMatch(
    /unsafe-eval|https:|wasm|script-src[^;]*unsafe-inline/,
  );
  const html = fs.readFileSync("extension/dist/sidepanel.html", "utf8");
  expect(html).toContain('src="sidepanel.js"');
  expect(html).not.toMatch(/https?:|onload=|<iframe/);
  const bundle = fs.readFileSync("extension/dist/sidepanel.js", "utf8");
  expect(bundle).not.toMatch(
    /next\/navigation|webpackHotUpdate|window\.postMessage|chrome\.(scripting|activeTab|contextMenus)|\.storage\.sync/,
  );
  for (const icon of Object.values(manifest.icons))
    expect(fs.existsSync(`extension/dist/${icon}`)).toBe(true);
});
