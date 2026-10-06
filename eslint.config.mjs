import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".venv/**",
      "node_modules/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
      ".local/**",
      "extension/dist/**",
    ],
  },
  js.configs.recommended,
  { files: ["extension/build.mjs"], languageOptions: { globals: { console: "readonly" } } },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: { ...hooks.configs.recommended.rules },
  },
);
