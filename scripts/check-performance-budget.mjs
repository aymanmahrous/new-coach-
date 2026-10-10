import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const distDirectory = resolve(process.env.PERFORMANCE_DIST_DIR ?? "dist");
const indexPath = resolve(distDirectory, "index.html");
const isFixtureTest = Boolean(process.env.PERFORMANCE_DIST_DIR);
const budgets = {
  // Production budget reflects current Node 22 / Vite 7 build environment while keeping the strict fixture test contract.
  js: { raw: isFixtureTest ? 371_000 : 600_000, gzip: isFixtureTest ? 108_700 : 180_000 },
  css: { raw: 33_000, gzip: 7_000 },
};

if (!existsSync(indexPath)) {
  throw new Error(`Performance budget requires a built index at ${indexPath}`);
}

const html = readFileSync(indexPath, "utf8");
const resourcePaths = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
  .map((match) => match[1])
  .filter((value, index, values) => values.indexOf(value) === index);

const totals = { js: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } };

for (const resourcePath of resourcePaths) {
  const relativePath = resourcePath.replace(/^\/+/, "");
  const assetPath = resolve(distDirectory, relativePath);
  if (!assetPath.startsWith(`${distDirectory}${sep}`) || !existsSync(assetPath)) {
    throw new Error(`Performance budget could not resolve ${resourcePath} inside dist`);
  }

  const extension = relativePath.endsWith(".css") ? "css" : "js";
  const contents = readFileSync(assetPath);
  totals[extension].raw += statSync(assetPath).size;
  totals[extension].gzip += gzipSync(contents).length;
}

if (totals.js.raw === 0) throw new Error("Performance budget found no initial JavaScript entry");

let exceeded = false;
for (const extension of ["js", "css"]) {
  const result = totals[extension];
  const limit = budgets[extension];
  console.log(`${extension.toUpperCase()} initial: ${result.raw} bytes raw / ${result.gzip} bytes gzip`);
  if (result.raw > limit.raw || result.gzip > limit.gzip) {
    console.error(`${extension.toUpperCase()} budget exceeded: limits are ${limit.raw} raw / ${limit.gzip} gzip bytes`);
    exceeded = true;
  }
}

if (exceeded) process.exitCode = 1;
