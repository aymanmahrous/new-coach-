import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../supabase/functions/facebook-oauth/index.ts", import.meta.url), "utf8");

test("Facebook OAuth verifies the configured page directly", () => {
  assert.match(source, /GRAPH_URL\}\/\$\{encodeURIComponent\(FACEBOOK_PAGE_ID\)\}/);
  assert.match(source, /fields\", \"id,name,access_token\"/);
  assert.match(source, /page_lookup_direct/);
  assert.doesNotMatch(source, /GRAPH_URL\}\/me\/accounts/);
});
