import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../src/canva-adapter.ts", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/canva-oauth/index.ts", import.meta.url), "utf8");
const providers = await readFile(new URL("../src/media-providers.ts", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/media-library-controls.tsx", import.meta.url), "utf8");

test("canva adapter stays server-side and never embeds client secrets", () => {
  assert.match(adapter, /functions\/v1\/canva-oauth/);
  assert.match(adapter, /startCanvaConnect/);
  assert.match(adapter, /fetchCanvaIntegrationStatus/);
  assert.doesNotMatch(adapter, /VITE_CANVA|CANVA_CLIENT_SECRET|localStorage/i);
});

test("canva oauth edge function uses server secrets and PKCE state", () => {
  assert.match(edge, /Deno\.env\.get\("CANVA_CLIENT_ID"\)/);
  assert.match(edge, /Deno\.env\.get\("CANVA_CLIENT_SECRET"\)/);
  assert.match(edge, /code_challenge_method/);
  assert.match(edge, /staff_canva_oauth_states/);
  assert.match(edge, /staff_canva_tokens/);
  assert.match(edge, /url\.searchParams\.has\("code"\)/);
  assert.match(edge, /redirectUriCandidates/);
  assert.match(edge, /section", "media"/);
  assert.doesNotMatch(edge, /console\.log\(.*CANVA_CLIENT_SECRET/i);
});

test("canva adapter exposes user-facing connect error messages", () => {
  assert.match(adapter, /canvaConnectErrorMessage/);
  assert.match(adapter, /METHOD_NOT_ALLOWED/);
  assert.match(adapter, /USE_CONNECT_BUTTON/);
});

test("canva remains optional and non-blocking in provider layer", () => {
  assert.match(providers, /optional: true/);
  assert.match(providers, /do not block batch creation/);
  assert.match(providers, /OPTIONAL \/ NOT CONNECTED/);
  assert.match(controls, /Connect Canva/);
  assert.match(controls, /Open Canva/);
  assert.match(controls, /Canva: \{canvaConnected \? "NEEDS ATTENTION"/);
});
