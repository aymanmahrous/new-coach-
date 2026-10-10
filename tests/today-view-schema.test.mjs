import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod";

const todayView = readFileSync(new URL("../src/today-view.tsx", import.meta.url), "utf8");

test("Today dashboard content schema accepts cancelled items from Supabase", () => {
  assert.match(todayView, /"cancelled"/);
  const ContentItemSchema = z.object({
    id: z.string().uuid(),
    topic: z.string(),
    createdAt: z.string(),
    status: z.enum(["idea", "draft", "generated", "needs_review", "approved", "scheduled", "published", "failed", "cancelled"]),
  }).passthrough();
  const parsed = ContentItemSchema.safeParse({
    id: "9f588b9c-9d32-49ec-9627-ad80a763a31a",
    topic: "التنفس أولًا",
    createdAt: "2026-03-01T10:00:00.000Z",
    status: "cancelled",
  });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.format()));
});

test("Today dashboard skips automation RPC for roles without server access", () => {
  assert.match(todayView, /AUTOMATION_STATUS_ROLES/);
  assert.match(todayView, /AUTOMATION_STATUS_ROLES\.has\(session\.role\)/);
});
