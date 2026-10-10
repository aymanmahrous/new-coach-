import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260920130000_staff_integrations_center.sql", import.meta.url), "utf8");
const view = await readFile(new URL("../src/integrations-center.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("connected status reports a successful local configuration check, not external operation", () => {
  assert.match(view, /connected: "اجتاز اختبار الإعداد المحلي"/);
  assert.match(view, /connected: "Local config test passed"/);
  assert.match(migration, /result', 'configured'/);
  assert.match(view, /لم يتم استدعاء مزود خارجي بعد/);
});

test("first-batch integrations are in-app, masked, audited, and fail closed", () => {
  assert.match(migration, /staff_integration_secrets/);
  assert.match(migration, /revoke all on public\.staff_integration_secrets from public, anon, authenticated/i);
  assert.match(migration, /integration_connected/);
  assert.match(migration, /integration_disconnected/);
  assert.match(migration, /integration_tested/);
  assert.doesNotMatch(migration, /secret_value.*audit_logs/i);
  assert.match(view, /connect_staff_integration/);
  assert.match(view, /test_staff_integration/);
  assert.match(view, /disconnect_staff_integration/);
  assert.match(view, /type="password"/);
  assert.match(app, /get_staff_integrations/);
  assert.match(app, /active === "connections"/);
});
