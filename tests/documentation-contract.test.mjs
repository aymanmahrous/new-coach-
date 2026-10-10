import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const readRepositoryFile = (path) => readFile(resolve(repositoryRoot, path), "utf8");

test("current documentation supersedes historical stage state", async () => {
  const [readme, handoff, aiInbox, bookings, standalone, connectivity, governance, manifest] = await Promise.all([
    readRepositoryFile("README.md"),
    readRepositoryFile("PROJECT_HANDOFF.md"),
    readRepositoryFile("docs/AI_INBOX_HANDOFF.md"),
    readRepositoryFile("docs/BOOKINGS_OPERATIONS_HANDOFF.md"),
    readRepositoryFile("docs/STANDALONE_MIGRATION_HANDOFF.md"),
    readRepositoryFile("docs/CONNECTIVITY_DECISION.md"),
    readRepositoryFile("BASELINE_GOVERNANCE.md"),
    readRepositoryFile("AUDITED_BASELINE_CONTENT_MANIFEST.md"),
  ]);

  assert.match(readme, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(readme, /update_staff_lead_workflow/);
  assert.match(readme, /npm ci --ignore-scripts/);
  assert.doesNotMatch(readme, /Application source candidates are not transferred/);
  assert.match(handoff, /Documentation Review/);
  assert.match(aiInbox, /Merge: completed/);
  assert.doesNotMatch(aiInbox, /Merge: blocked/);
  assert.match(bookings, /passed on PR #10/);
  assert.doesNotMatch(bookings, /CI: pending/);
  assert.match(standalone, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(standalone, /All other sections remain read-only/);
  assert.doesNotMatch(connectivity, /committed browser-safe defaults/);
  assert.match(governance, /Historical provenance record/);
  assert.match(manifest, /Historical provenance record/);
});

test("all relative Markdown links resolve inside the repository", async () => {
  const rootFiles = (await readdir(repositoryRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => resolve(repositoryRoot, entry.name));
  const docsDirectory = resolve(repositoryRoot, "docs");
  const docsFiles = (await readdir(docsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => resolve(docsDirectory, entry.name));

  for (const markdownPath of [...rootFiles, ...docsFiles]) {
    const markdown = await readFile(markdownPath, "utf8");
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
      const resolvedTarget = resolve(dirname(markdownPath), decodeURIComponent(target));
      const repositoryRelative = relative(repositoryRoot, resolvedTarget);
      assert.ok(!repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative), `${match[1]} escapes the repository from ${markdownPath}`);
      await access(resolvedTarget);
    }
  }
});
