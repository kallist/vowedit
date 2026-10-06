import { defineConfig } from "@playwright/test";
import path from "node:path";
const port = Number(process.env.VOWEDIT_API_PORT || "8000");
const python =
  process.env.VOWEDIT_PYTHON ||
  (process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python");
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { actionTimeout: 10000, navigationTimeout: 10000 },
  webServer: [
    {
      cwd: path.resolve("."),
      command: `"${python}" -m uvicorn backend.tests.e2e_app:app --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}/api/capabilities`,
      reuseExistingServer: false,
      env: {
        VOWEDIT_DATA_DIR: path.resolve(".local/v021-extension-data"),
        PYTHON_DOTENV_DISABLED: "1",
        VOWEDIT_PROVIDER: "mock",
      },
    },
    {
      cwd: path.resolve("."),
      command: "npm run start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
