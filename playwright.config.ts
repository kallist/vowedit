import { defineConfig } from "@playwright/test";
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
      command: `"${python}" -m uvicorn backend.tests.e2e_app:app --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/api/config",
      reuseExistingServer: false,
      timeout: 30000,
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
