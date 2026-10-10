import assert from "node:assert/strict";
import test from "node:test";
import {
  approveAllCandidates,
  approveAllWouldChange,
  buildDayNineReminder,
  canApproveContentItem,
  groupContentBatches,
  isDuplicateScheduleCandidate,
  readBatchId,
  selectPrimaryBatch,
  shouldSkipApprove,
} from "../src/content-batch.ts";
import { computeCycleDay, readIntegrationStatuses, scheduleDuplicateBlocked } from "../src/content-growth.ts";
import { DEFAULT_BATCH_MIX, buildPerformanceInsights } from "../src/content-strategy.ts";

function item(overrides) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? "needs_review",
    createdAt: overrides.createdAt ?? "2026-09-01T10:00:00.000Z",
    platform: overrides.platform ?? "instagram",
    contentType: overrides.contentType ?? "post",
    caption: overrides.caption ?? "Swimming safety tip for parents in Abu Dhabi.",
    topic: overrides.topic ?? "Water confidence",
    scheduledFor: overrides.scheduledFor ?? null,
    ...overrides,
  };
}

test("readBatchId prefers explicit passthrough fields", () => {
  assert.equal(readBatchId({ batch_id: "batch-001" }), "batch-001");
  assert.equal(readBatchId({ batchId: "batch-002" }), "batch-002");
  assert.equal(readBatchId({ topic: "x" }), null);
});

test("approve helpers skip already approved or non-reviewable items", () => {
  const reviewable = item({ status: "needs_review" });
  const approved = item({ status: "approved" });
  assert.equal(canApproveContentItem(reviewable), true);
  assert.equal(shouldSkipApprove(approved), true);
  assert.equal(approveAllWouldChange([approved]), false);
  assert.equal(approveAllCandidates([reviewable, approved]).length, 1);
});

test("duplicate schedule guard blocks scheduled and published items", () => {
  assert.equal(isDuplicateScheduleCandidate(item({ status: "scheduled" })), true);
  assert.equal(isDuplicateScheduleCandidate(item({ status: "published" })), true);
  assert.equal(isDuplicateScheduleCandidate(item({ status: "approved" })), false);
});

test("groupContentBatches groups explicit batch ids and caps heuristic window to 10", () => {
  const explicit = [
    item({ id: "1", batch_id: "batch-a", createdAt: "2026-09-01T10:00:00.000Z" }),
    item({ id: "2", batch_id: "batch-a", createdAt: "2026-09-01T11:00:00.000Z" }),
    item({ id: "3", batch_id: "batch-b", createdAt: "2026-09-02T10:00:00.000Z" }),
  ];
  const batches = groupContentBatches(explicit);
  assert.equal(batches.length, 2);
  assert.equal(batches.find((batch) => batch.batchId === "batch-a")?.items.length, 2);

  const unbatched = Array.from({ length: 12 }, (_, index) =>
    item({ id: `u-${index}`, createdAt: `2026-09-10T${String(index).padStart(2, "0")}:00:00.000Z` }),
  );
  const heuristic = groupContentBatches(unbatched).find((batch) => batch.batchId.startsWith("review-window-"));
  assert.ok(heuristic);
  assert.equal(heuristic.items.length, 10);
});

test("selectPrimaryBatch prefers the batch with the most needs_review items", () => {
  const batches = groupContentBatches([
    item({ id: "a1", batch_id: "older", status: "approved", createdAt: "2026-09-01T10:00:00.000Z" }),
    item({ id: "a2", batch_id: "older", status: "approved", createdAt: "2026-09-01T11:00:00.000Z" }),
    item({ id: "b1", batch_id: "current", status: "needs_review", createdAt: "2026-09-08T10:00:00.000Z" }),
    item({ id: "b2", batch_id: "current", status: "needs_review", createdAt: "2026-09-08T11:00:00.000Z" }),
  ]);
  const primary = selectPrimaryBatch(batches);
  assert.equal(primary?.batchId, "current");
});

test("computeCycleDay tracks the 10-day content cycle", () => {
  const start = new Date("2026-09-01T10:00:00.000Z");
  assert.equal(computeCycleDay("2026-09-01T10:00:00.000Z", start), 1);
  assert.equal(computeCycleDay("2026-09-01T10:00:00.000Z", new Date("2026-09-09T10:00:00.000Z")), 9);
});

test("day nine reminder appears only when reviewable items remain", () => {
  const items = [
    item({
      id: "1",
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ];
  assert.ok(buildDayNineReminder(items, new Date())?.show);
});

test("integration status parser stays conservative without explicit flags", () => {
  const statuses = readIntegrationStatuses(null);
  assert.equal(statuses.length, 7);
  assert.ok(statuses.every((entry) => entry.connected === false));
});

test("default batch mix contains 10 strategy slots", () => {
  assert.equal(DEFAULT_BATCH_MIX.length, 10);
});

test("performance insights stay conservative with small samples", () => {
  const insights = buildPerformanceInsights([]);
  assert.equal(insights.length, 1);
  assert.match(insights[0].reason, /Not enough published performance data/i);
});
