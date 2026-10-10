import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/customer-360-panel.tsx", import.meta.url), "utf8");

test("CRM exposes a selected-lead Customer 360 panel", () => {
  assert.match(panel, /Customer 360/);
  assert.match(source, /C360/);
  assert.match(panel, /selectedLead\.channel/);
  assert.match(panel, /selectedLead\.nextFollowUpAt/);
});

test("Customer 360 does not invent unavailable customer history", () => {
  assert.match(panel, /unavailable history is not shown/i);
  assert.match(panel, /Messages and bookings are not shown without a CRM contract link/i);
  assert.doesNotMatch(`${source}\n${panel}`, /mockCustomer|fakeCustomer|demoCustomer/);
});
