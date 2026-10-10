import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const budgetScript = fileURLToPath(new URL("../scripts/check-performance-budget.mjs", import.meta.url));

test("production build enforces the initial-load performance budget", () => {
  assert.match(packageJson.scripts.build, /vite build && node scripts\/check-performance-budget\.mjs/);
});

test("performance budget accepts bounded assets and rejects an oversized entry", async (context) => {
  const fixture = await mkdtemp(join(tmpdir(), "command-center-performance-"));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, "assets"));
  await writeFile(join(fixture, "index.html"), '<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">');
  await writeFile(join(fixture, "assets", "app.js"), "console.log('bounded');");
  await writeFile(join(fixture, "assets", "app.css"), "body{margin:0}");

  const bounded = spawnSync(process.execPath, [budgetScript], {
    encoding: "utf8",
    env: { ...process.env, PERFORMANCE_DIST_DIR: fixture },
  });
  assert.equal(bounded.status, 0, bounded.stderr);

  await writeFile(join(fixture, "assets", "app.js"), Buffer.alloc(371_001, "x"));
  const oversized = spawnSync(process.execPath, [budgetScript], {
    encoding: "utf8",
    env: { ...process.env, PERFORMANCE_DIST_DIR: fixture },
  });
  assert.equal(oversized.status, 1);
  assert.match(oversized.stderr, /JS budget exceeded/i);
});
