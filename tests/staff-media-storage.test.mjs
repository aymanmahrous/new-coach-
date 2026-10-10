import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storage = await readFile(new URL("../src/staff-media-storage.ts", import.meta.url), "utf8");

test("staff media storage supports authenticated private upload and reads", () => {
  assert.match(storage, /STAFF_MEDIA_BUCKET = "relax-fix-media"/);
  assert.match(storage, /uploadStaffMediaFile/);
  assert.match(storage, /fetchStaffMediaBlob/);
  assert.match(storage, /fetchStaffMediaSignedUrl/);
  assert.match(storage, /\/storage\/v1\/object\/sign\/\$\{STAFF_MEDIA_BUCKET\}/);
  assert.match(storage, /Authorization: `Bearer \$\{session\.accessToken\}`/);
  assert.match(storage, /\/storage\/v1\/object\/\$\{STAFF_MEDIA_BUCKET\}/);
  assert.match(storage, /cache: "no-store"/);
  assert.doesNotMatch(storage, /service_role|SUPABASE_SERVICE/i);
  assert.doesNotMatch(storage, /getPublicUrl|publicUrl/i);
  assert.doesNotMatch(storage, /drive\.google\.com/i);
});

test("staff media storage opens documents with short-lived signed URLs", () => {
  assert.match(storage, /fetchStaffMediaSignedUrl/);
  assert.doesNotMatch(storage, /URL\.createObjectURL/);
});
