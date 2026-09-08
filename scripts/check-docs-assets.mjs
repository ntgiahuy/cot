#!/usr/bin/env node
/**
 * Fail the build if docs/index.html references hashed files that are missing.
 * GitHub Pages goes blank when index.html is published without matching docs/assets.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];
const docsDir = arg
  ? isAbsolute(arg)
    ? arg
    : join(process.cwd(), arg)
  : join(root, "docs");
const htmlPath = join(docsDir, "index.html");
const html = readFileSync(htmlPath, "utf8");
const refs = [...html.matchAll(/\/cot\/assets\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
if (refs.length === 0) {
  console.error(`check-docs-assets: no /cot/assets/ references in ${htmlPath}`);
  process.exit(1);
}
const missing = refs.filter((name) => !existsSync(join(docsDir, "assets", name)));
if (missing.length) {
  console.error("check-docs-assets: index.html points at missing files:");
  for (const name of missing) console.error(`  ${join(docsDir, "assets", name)}`);
  process.exit(1);
}
console.log(`check-docs-assets: ${refs.length} asset(s) present`);
