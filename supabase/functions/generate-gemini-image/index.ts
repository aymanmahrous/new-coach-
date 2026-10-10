import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MEDIA_BUCKET = "relax-fix-media";
const ALLOWED_ROLES = new Set(["super_admin", "admin", "content_manager"]);
const ESTIMATED_IMAGE_COST_USD = 0.0336;
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

type JsonObject = Record<string, unknown>;

function json(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requireStaff(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: json({ success: false, code: "AUTH_REQUIRED" }, 401) };
  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("id, role, active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.active || !ALLOWED_ROLES.has(String(profile.role))) {
    return { error: json({ success: false, code: "STAFF_ACCESS_DENIED" }, 403) };
  }
  return { staffId: authData.user.id };
}

function findImageData(value: unknown, depth = 0): { data: string; mimeType: string } | null {
  if (depth > 12 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findImageData(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as JsonObject;
  const data = typeof record.data === "string" ? record.data : "";
  const mimeType = typeof record.mime_type === "string"
    ? record.mime_type
    : typeof record.mimeType === "string" ? record.mimeType : "";
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  if (data && (mimeType.startsWith("image/") || type === "image")) {
    return { data, mimeType: mimeType.startsWith("image/") ? mimeType : "image/png" };
  }
  for (const [key, child] of Object.entries(record)) {
    if (["input", "request", "usage", "metadata"].includes(key.toLowerCase())) continue;
    const found = findImageData(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function promptForImage(value: unknown) {
  const brief = typeof value === "string" ? value.trim().slice(0, 5000) : "";
  return [
    "Create one polished social-media marketing image for Coach Ayman Swimming Academy / Relax Fix UAE in Abu Dhabi.",
    "Visual direction: premium, modern aquatic brand; clean composition; confident, calm, safe swimming education; strong turquoise/navy/white palette with restrained warm accent.",
    "Make the image suitable for a vertical 4:5 social post. Keep key subjects away from the edges and leave a clean area for later brand/logo placement.",
    "Use original generic illustration or non-identifiable swimmers only; no recognizable real person, no invented logo, no fake phone number, no medical/safety guarantees, no misleading claims.",
    "Creative brief from the content item:",
    brief || "A welcoming swimming lesson atmosphere that builds confidence and encourages families to request a free initial assessment.",
  ].join("\n\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ success: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ success: false, code: "SERVER_MISCONFIGURED" }, 500);

  const token = bearerToken(request);
  if (!token) return json({ success: false, code: "AUTH_REQUIRED" }, 401);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const staff = await requireStaff(supabase, token);
  if ("error" in staff && staff.error) return staff.error;

  const body = await request.json().catch(() => ({})) as JsonObject;
  const mode = typeof body.mode === "string" ? body.mode : "";
  if (mode !== "estimate" && mode !== "generate") return json({ success: false, code: "INVALID_MODE" }, 400);
  if (!GEMINI_API_KEY) return json({ success: false, code: "GEMINI_CREDENTIAL_MISSING" }, 424);

  if (mode === "estimate") {
    return json({
      success: true,
      provider: "google_gemini",
      model: GEMINI_IMAGE_MODEL,
      estimatedCostUsd: ESTIMATED_IMAGE_COST_USD,
      imageSize: "1K",
      aspectRatio: "4:5",
      detail: "Estimate only; no image generation request was sent.",
    });
  }

  const contentItemId = typeof body.contentItemId === "string" ? body.contentItemId : "";
  if (!/^[0-9a-f-]{36}$/i.test(contentItemId)) return json({ success: false, code: "INVALID_CONTENT_ITEM_ID" }, 400);

  // Validate the target before any billable Google request.
  const { data: contentItem, error: contentItemError } = await supabase
    .from("content_items")
    .select("id, status")
    .eq("id", contentItemId)
    .maybeSingle();
  if (contentItemError) return json({ success: false, code: "CONTENT_ITEM_READ_FAILED" }, 500);
  if (!contentItem) return json({ success: false, code: "CONTENT_ITEM_NOT_FOUND" }, 404);
  if (String(contentItem.status ?? "").toLowerCase() === "published") {
    return json({ success: false, code: "PUBLISHED_CONTENT_IMMUTABLE" }, 409);
  }

  const prompt = promptForImage(body.prompt);
  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_IMAGE_MODEL,
      input: prompt,
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "4:5",
        image_size: "1K",
      },
    }),
  });
  const result = await response.json().catch(() => null) as JsonObject | null;
  if (!response.ok) {
    const error = result?.error && typeof result.error === "object" ? result.error as JsonObject : {};
    return json({
      success: false,
      code: "GEMINI_IMAGE_REQUEST_FAILED",
      providerStatus: response.status,
      detail: typeof error.message === "string" ? error.message.slice(0, 180) : "Google image generation request failed.",
    }, 502);
  }

  const image = findImageData(result);
  if (!image) return json({ success: false, code: "GEMINI_IMAGE_MISSING" }, 502);
  if (image.data.length > 30_000_000) return json({ success: false, code: "GEMINI_IMAGE_TOO_LARGE" }, 413);
  const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) ? image.mimeType : "image/png";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  let bytes: Uint8Array;
  try {
    const binary = atob(image.data);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return json({ success: false, code: "GEMINI_IMAGE_DATA_INVALID" }, 502);
  }

  const storagePath = `${staff.staffId}/${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (upload.error) return json({ success: false, code: "MEDIA_STORAGE_UPLOAD_FAILED" }, 500);

  const { data: asset, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      created_by: staff.staffId,
      asset_type: "image",
      source: "ai_generated",
      storage_path: storagePath,
      provider: "google_gemini",
      prompt,
      metadata: {
        source: "gemini_image_generation",
        model: GEMINI_IMAGE_MODEL,
        estimatedCostUsd: ESTIMATED_IMAGE_COST_USD,
        contentItemId,
        analysis: {
          synthetic: true,
          containsChildrenGuess: "no",
          containsPeopleGuess: "unknown",
          consentRequired: false,
          reviewRequired: true,
        },
        analysisProvider: "google_gemini",
      },
      category: "swimming_business",
      media_status: "unclassified",
      ai_analysis_status: "completed",
      publishability_status: "ready_for_review",
      consent_status: "consent_confirmed",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !asset?.id) {
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    return json({ success: false, code: "MEDIA_REGISTER_FAILED" }, 500);
  }

  return json({
    success: true,
    provider: "google_gemini",
    model: GEMINI_IMAGE_MODEL,
    estimatedCostUsd: ESTIMATED_IMAGE_COST_USD,
    mediaAssetId: String(asset.id),
    storagePath,
    mimeType,
  });
});
