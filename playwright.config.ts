import { defineConfig } from "@playwright/test";
import path from "node:path";
const apiPort = Number(process.env.VOWEDIT_API_PORT || "8000");
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)
  throw new Error("VOWEDIT_API_PORT must be an unprivileged local port.");
const python =
  process.env.VOWEDIT_PYTHON ||
  (process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python");
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: [
    {
      command: `"${python}" -m uvicorn backend.tests.e2e_app:app --host 127.0.0.1 --port ${apiPort}`,
      url: `http://127.0.0.1:${apiPort}/api/config`,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        VOWEDIT_DATA_DIR: path.resolve(".local/v03-validation-data/browser"),
        VOWEDIT_PROVIDER: "mock",
        PYTHON_DOTENV_DISABLED: "1",
        COMFYUI_BASE_URL: "", COMFYUI_CHECKPOINT: "", RUNNINGHUB_API_KEY: "", RUNNINGHUB_WORKFLOW_ID: "",
      },
    },
    {
      command: "npm run start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 60000,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
