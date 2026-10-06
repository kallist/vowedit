import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const destination = path.resolve(root, "dist");
if (path.dirname(destination) !== path.resolve(root))
  throw new Error("Invalid build target");
await fs.mkdir(destination, { recursive: true });
await build({
  entryPoints: {
    sidepanel: "extension/sidepanel.tsx",
    "service-worker": "extension/service-worker.ts",
  },
  outdir: destination,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  metafile: true,
}).then(async (result) => {
  if (
    Object.keys(result.metafile.inputs).some((name) =>
      /node_modules\/next\//.test(name),
    )
  )
    throw new Error("Next runtime in extension");
});
for (const file of ["manifest.json", "sidepanel.html"])
  await fs.copyFile(path.join(root, file), path.join(destination, file));
await fs.cp(path.join(root, "icons"), path.join(destination, "icons"), {
  recursive: true,
});
console.log("Built packaged VowEdit MV3 Side Panel in extension/dist");
