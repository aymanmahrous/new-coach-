import assert from "node:assert/strict";
import test from "node:test";
import { dedupeWorkflowActions, deriveWorkflowActions } from "../src/workflow-intelligence.ts";

const summary = { leads: { total: 4, hot: 1 }, conversations: { humanRequired: 2 }, bookings: { pending: 3 }, content: { review: 2, published: 5 }, radar: { hot: 1 } };

test('workflow intelligence derives actionable priorities from current summary data', () => {
  const actions = deriveWorkflowActions(summary, "en");
  assert.equal(actions.find((action) => action.id === "content-owner-review")?.status, "Needs Approval");
  assert.equal(actions.find((action) => action.id === "inbox-human-review")?.status, "Ready");
  assert.equal(actions.find((action) => action.id === "content-published")?.status, "Completed");
  assert.equal(actions.find((action) => action.id === "content-owner-review")?.requiresOwnerApproval, true);
});

test('workflow intelligence deduplicates action ids', () => {
  const action = { id: "same", area: "content", status: "Ready", title: "A", detail: "1", next: "Open", requiresOwnerApproval: false };
  assert.equal(dedupeWorkflowActions([action, action]).length, 1);
});

test('workflow intelligence reports no data instead of inventing a task', () => {
  const actions = deriveWorkflowActions({ leads: { total: 0, hot: 0 }, conversations: { humanRequired: 0 }, bookings: { pending: 0 }, content: { review: 0, published: 0 }, radar: { hot: 0 } }, "ar");
  assert.deepEqual(actions.map((action) => action.status), ["No Data"]);
});
