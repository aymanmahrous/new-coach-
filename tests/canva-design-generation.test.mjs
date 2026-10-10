import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../src/canva-design-adapter.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/canva-design/index.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/content-batch-review-panel.tsx", import.meta.url), "utf8");

test("canva design adapter stays server-side", () => {
  assert.match(adapter, /functions\/v1\/canva-design/);
  assert.match(adapter, /generateCanvaDesignForContentItem/);
  assert.doesNotMatch(adapter, /CANVA_CLIENT_SECRET|VITE_CANVA/i);
});

test("canva design edge function uses brand template or source design autofill and export", () => {
  assert.match(edge, /CANVA_BRAND_TEMPLATE_ID/);
  assert.match(edge, /CANVA_SOURCE_DESIGN_ID/);
  assert.match(edge, /create_from_design/);
  assert.match(edge, /\/autofills/);
  assert.match(edge, /\/exports/);
  assert.match(edge, /media_asset_id/);
});

test("batch review panel exposes generate Canva design action", () => {
  assert.match(panel, /generateCanvaDesignForContentItem/);
  assert.match(panel, /generateDesignButton/);
});

test("Canva status path does not generate or export, but refreshes and stores OAuth credentials", () => {
  const statusStart = edge.indexOf('if (body.mode === "status")');
  const generateStart = edge.indexOf('if (body.mode !== "generate")', statusStart);
  assert.ok(statusStart >= 0 && generateStart > statusStart, "status branch must remain before generation");
  const statusBranch = edge.slice(statusStart, generateStart);
  assert.match(edge, /staffId = staff\.staffId/);
  assert.doesNotMatch(edge, /staffId = staffId/);
  assert.match(statusBranch, /refreshCanvaAccessToken/);
  assert.doesNotMatch(statusBranch, /createAutofillDesign|exportDesignPng|storeDesignForContentItem/);
  assert.match(edge, /from\("staff_canva_tokens"\)\.upsert/);
});
