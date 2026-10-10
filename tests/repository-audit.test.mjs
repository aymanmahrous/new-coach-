import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const workflow = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");

test("dependency installation is locked and CI is reproducible", () => {
  assert.equal(packageLock.lockfileVersion, 3);
  assert.equal(packageLock.packages[""].name, packageJson.name);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /npm install/);
});

test("build tooling stays outside the runtime dependency surface", () => {
  for (const dependency of ["@vitejs/plugin-react", "typescript", "vite"]) {
    assert.equal(packageJson.dependencies[dependency], undefined);
    assert.equal(typeof packageJson.devDependencies[dependency], "string");
  }
  for (const dependency of ["react", "react-dom", "lucide-react", "zod"]) {
    assert.equal(typeof packageJson.dependencies[dependency], "string");
  }
});

test("dependency check mode reports drift and vulnerabilities without updating packages", async () => {
  const scanner = await readFile(new URL("../scripts/check-dependencies.mjs", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["deps:check"], "node scripts/check-dependencies.mjs");
  assert.match(scanner, /\["outdated", "--json", "--all"\]/);
  assert.match(scanner, /\["audit", "--json"\]/);
  assert.match(scanner, /typeof severityCounts\.total === "number"/);
  assert.match(scanner, /Array\.isArray\(result\)/);
  assert.match(scanner, /entries\.find\(\(entry\) => typeof entry\.current === "string"\)/);
  assert.match(scanner, /No packages or lockfiles were changed/);
  assert.doesNotMatch(scanner, /\["(?:install|update|audit fix)"/);
});
