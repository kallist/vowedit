import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["extension/tests/**/*.test.ts", "frontend/editingDrafts.test.ts"],
  },
});
