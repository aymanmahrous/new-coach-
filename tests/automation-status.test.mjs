import assert from "node:assert/strict";
import test from "node:test";
import { countActiveAutomationStates, summarizeAutomationStatus } from "../src/automation-status.ts";

test("automation status derives batch, execution, readiness, and attention from source records", () => {
  const snapshot = summarizeAutomationStatus({
    current_batch: { batch_id: "batch-123", status: "retrying", item_count: 10, provider: "coach-ayman", created_at: "2026-09-21T08:00:00Z" },
    execution: { status: "failed", last_run_at: "2026-09-21T09:00:00Z", last_error: "Provider timeout", attempt_count: 2, publishing_readiness: "review_required" },
  });
  assert.equal(snapshot.currentBatch?.id, "batch-123");
  assert.equal(snapshot.currentBatch?.itemCount, 10);
  assert.equal(snapshot.states.retrying, 1);
  assert.equal(snapshot.states.failed, 1);
  assert.equal(countActiveAutomationStates(snapshot), 1);
  assert.equal(snapshot.publishingReadiness, "review_required");
  assert.equal(snapshot.attention.length, 2);
  assert.ok(snapshot.attention.some((item) => item.action === "open_queue"));
});

test("automation status does not invent attention when the snapshot has no issue", () => {
  const snapshot = summarizeAutomationStatus({ status: "completed", batch_id: "batch-456", item_count: 10 });
  assert.equal(snapshot.states.completed, 1);
  assert.equal(snapshot.attention.length, 0);
});

test("terminal automation records remain historical instead of becoming active alerts", () => {
  const snapshot = summarizeAutomationStatus({
    archived: { status: "dead", last_error: "STALE_ORPHAN_QUEUE_ARCHIVED" },
    cancelled: { status: "cancelled", stopped_reason: "CANCELLED_BY_OWNER" },
  });
  assert.equal(snapshot.states.dead, 1);
  assert.equal(snapshot.states.cancelled, 1);
  assert.equal(snapshot.attention.length, 0);
});

test("empty automation source remains explicitly unavailable", () => {
  const snapshot = summarizeAutomationStatus(null);
  assert.equal(snapshot.sourceAvailable, false);
  assert.equal(snapshot.recordCount, 0);
  assert.equal(snapshot.attention.length, 0);
});
