import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260913180000_fix_control_tower_orders_amount.sql", import.meta.url),
  "utf8",
);

test("control tower RPC fix avoids missing orders.amount column", () => {
  assert.match(migration, /select count\(\*\) into v_orders from public\.orders/);
  assert.match(migration, /v_order_amount := 0/);
  assert.doesNotMatch(migration, /from public\.orders[\s\S]*sum\(amount\)/);
});
