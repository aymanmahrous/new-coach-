import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const MEDIA_BUCKET = "relax-fix-media";
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_INLINE_BYTES = 15 * 1024 * 1024;
const ALLOWED_ROLES = new Set(["super_admin", "admin", "content_manager"]);
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

function credentialStatus() {
  if (!GEMINI_API_KEY) {
    return {
      connected: false,
      integrationStatus: "NEEDS CREDENTIAL" as const,
      detail: "Set GEMINI_API_KEY in Supabase Edge Function secrets (server-side only).",
      code: "NEEDS_CREDENTIAL",
    };
  }
  return {
    connected: true,
    integrationStatus: "CONNECTED" as const,
    detail: "Gemini server-side credentials detected.",
    code: "READY",
  };
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

(supabase: ReturnType<typeof createClient>, storagePath: string) {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(storagePath);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > MAX_INLINE_BYTES) return null;
  return { bytes, mimeType: data.type || "application/octet-stream" };
}

function buildPrompt(asset: JsonObject, hasInlineMedia: boolean) {
  const assetType = String(asset.asset_type ?? asset.assetType ?? "other");
  const category = String(asset.category ?? "unclassified");
  const fileName = typeof asset.metadata === "object" && asset.metadata && "file_name" in (asset.metadata as JsonObject)
    ? String((asset.metadata as JsonObject).file_name ?? "")
    : "";
  return [
    "You review private staff media for Relax Fix UAE swimming academy marketing review only.",
    "Return strict JSON only with keys:",
    "suitabilityVerdict (good|needs_review|unsuitable), qualityScore, clarityScore, swimmingFitScore,",
    "containsChildrenGuess (unknown|possible|no), suggestedPlatforms (array), suggestedFormats (array),",
    "hook, onScreenText, captionIdea, cta, cropSuggestion, editSuggestion, notes,",
    "videoSegments (array of {startSec,endSec,label} or null), bestReelSegment ({startSec,endSec,reason} or null).",
    "Rules:",
    "- AI suitability is advisory only; never imply permission to publish.",
    "- If children may appear: notes must mention consent required before publishability.",
    "- Family/personal/other/unclassified must never be treated as marketing-ready.",
    `- Asset type: ${assetType}; category: ${category}; file name hint: ${fileName || "unknown"}.`,
    hasInlineMedia
      ? "Inline media bytes are attached; base your review on visible content."
      : "No inline media bytes were attached; infer conservatively from metadata and mark needs_review when uncertain.",
  ].join("\n");
}

function normalizeAnalysis(raw: JsonObject, providerConnected: boolean): JsonObject {
  const verdict = ["good", "needs_review", "unsuitable"].includes(String(raw.suitabilityVerdict))
    ? String(raw.suitabilityVerdict)
    : "needs_review";
  const childGuess = ["unknown", "possible", "no"].includes(String(raw.containsChildrenGuess))
    ? String(raw.containsChildrenGuess)
    : "unknown";
  const toScore = (value: unknown, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : fallback;
  };
  const toStringArray = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  const notes = String(raw.notes ?? "").trim();
  const safetyNotes = [
    notes,
    "AI suitability is advisory only and does not grant publish permission.",
    childGuess === "possible" ? "Consent required before any publish use if children appear." : "",
  ].filter(Boolean).join(" ");

  return {
    provider: providerConnected ? "gemini" : "local_heuristic",
    providerConnected,
    suitabilityVerdict: verdict,
    qualityScore: toScore(raw.qualityScore, 60),
    clarityScore: toScore(raw.clarityScore, 58),
    swimmingFitScore: toScore(raw.swimmingFitScore, 55),
    containsChildrenGuess: childGuess,
    suggestedPlatforms: toStringArray(raw.suggestedPlatforms),
    suggestedFormats: toStringArray(raw.suggestedFormats),
    hook: String(raw.hook ?? ""),
    onScreenText: String(raw.onScreenText ?? ""),
    captionIdea: String(raw.captionIdea ?? ""),
    cta: String(raw.cta ?? ""),
    cropSuggestion: String(raw.cropSuggestion ?? ""),
    editSuggestion: String(raw.editSuggestion ?? ""),
    videoSegments: Array.isArray(raw.videoSegments) ? raw.videoSegments : undefined,
    bestReelSegment: raw.bestReelSegment && typeof raw.bestReelSegment === "object" ? raw.bestReelSegment : undefined,
    notes: safetyNotes,
  };
}

async function callGemini(prompt: string, inlinePart?: { mimeType: string; base64: string }) {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{ text: prompt }];
  if (inlinePart) parts.unshift({ inline_data: { mime_type: inlinePart.mimeType, data: inlinePart.base64 } });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const providerStatus = response.status;
    return { error: json({ success: false, code: "GEMINI_REQUEST_FAILED", providerStatus }, 502) };
  }

  const payload = await response.json().catch(() => null) as JsonObject | null;
  const text = payload?.candidates && Array.isArray(payload.candidates)
    ? String(((payload.candidates[0] as JsonObject)?.content as JsonObject)?.parts &&
      Array.isArray(((payload.candidates[0] as JsonObject).content as JsonObject).parts)
      ? (((payload.candidates[0] as JsonObject).content as JsonObject).parts as JsonObject[])[0]?.text ?? ""
      : "")
    : "";
  if (!text) return { error: json({ success: false, code: "GEMINI_EMPTY_RESPONSE" }, 502) };

  try {
    return { analysis: JSON.parse(text) as JsonObject };
  } catch {
    return { error: json({ success: false, code: "GEMINI_INVALID_JSON" }, 502) };
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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
  const status = credentialStatus();

  if (body.mode === "status") {
    return json({
      success: true,
      connected: status.connected,
      integrationStatus: status.integrationStatus,
      detail: status.detail,
      code: status.code,
      credentialEnvVar: "GEMINI_API_KEY",
    });
  }

  if (!status.connected) {
    return json({
      success: false,
      connected: false,
      integrationStatus: status.integrationStatus,
      detail: status.detail,
      code: status.code,
      credentialEnvVar: "GEMINI_API_KEY",
    }, 424);
  }

  const mediaAssetId = typeof body.mediaAssetId === "string" ? body.mediaAssetId : "";
  if (!/^[0-9a-f-]{36}$/i.test(mediaAssetId)) {
    return json({ success: false, code: "INVALID_INPUT" }, 400);
  }

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("id, asset_type, category, metadata, storage_path, consent_status")
    .eq("id", mediaAssetId)
    .maybeSingle();
  if (assetError || !asset) return json({ success: false, code: "NOT_FOUND" }, 404);
  if (asset.category !== "swimming_business") return json({ success: false, code: "ANALYSIS_CATEGORY_BLOCKED" }, 403);

  let inlinePart: { mimeType: string; base64: string } | undefined;
  if (typeof asset.storage_path === "string" && asset.storage_path.length > 0) {
    const media = await loadMediaBytes(supabase, asset.storage_path);
    if (media) inlinePart = { mimeType: media.mimeType, base64: bytesToBase64(media.bytes) };
  }

  const gemini = await callGemini(buildPrompt(asset, Boolean(inlinePart)), inlinePart);
  if ("error" in gemini && gemini.error) return gemini.error;

  const analysis = normalizeAnalysis(gemini.analysis ?? {}, true);
  return json({
    success: true,
    connected: true,
    integrationStatus: "CONNECTED",
    provider: "gemini",
    analysis,
    detail: status.detail,
  });
});
