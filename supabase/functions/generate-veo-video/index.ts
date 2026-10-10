import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const MEDIA_BUCKET = "relax-fix-media";
const ALLOWED_ROLES = new Set(["super_admin", "admin", "content_manager"]);
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const POLL_MS = 10_000;
const POLL_ATTEMPTS = 36;
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

type VideoSpec = {
  model: "veo-3.1-lite-generate-preview" | "veo-3.1-fast-generate-preview" | "veo-3.1-generate-preview";
  duration: 4 | 6 | 8;
  resolution: "720p" | "1080p";
};

function normalizeSpec(body: JsonObject): VideoSpec | { error: string } {
  const modelInput = String(body.model ?? "veo-3.1-lite-generate-preview");
  const model = (
    modelInput === "veo-3.1-fast-generate-preview" ||
    modelInput === "veo-3.1-generate-preview"
  ) ? modelInput : "veo-3.1-lite-generate-preview";
  const duration = Number(body.duration ?? 8);
  const resolution = String(body.resolution ?? "720p") === "1080p" ? "1080p" : "720p";
  if (![4, 6, 8].includes(duration)) return { error: "INVALID_DURATION" };
  if (resolution === "1080p" && duration !== 8) return { error: "1080P_REQUIRES_8_SECONDS" };
  return { model, duration: duration as 4 | 6 | 8, resolution };
}

function costPerSecond(model: VideoSpec["model"], resolution: VideoSpec["resolution"]) {
  if (model === "veo-3.1-lite-generate-preview") return resolution === "1080p" ? 0.08 : 0.05;
  if (model === "veo-3.1-fast-generate-preview") return resolution === "1080p" ? 0.12 : 0.10;
  return resolution === "1080p" ? 0.40 : 0.40;
}

function modelLabel(model: VideoSpec["model"]) {
  if (model.includes("lite")) return "Veo 3.1 Lite";
  if (model.includes("fast")) return "Veo 3.1 Fast";
  return "Veo 3.1";
}

async function callVeo(prompt: string, spec: VideoSpec) {
  const response = await fetch(
    `${BASE_URL}/models/${spec.model}:predictLongRunning`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        instances: [{ prompt: prompt.slice(0, 8000) }],
        parameters: {
          aspectRatio: "9:16",
          resolution: spec.resolution,
          durationSeconds: spec.duration,
          numberOfVideos: 1,
        },
      }),
    },
  );
  const payload = await response.json().catch(() => null) as JsonObject | null;
  if (!response.ok) {
    const error = payload?.error;
    const detail = error && typeof error === "object"
      ? String((error as JsonObject).message ?? "").slice(0, 300)
      : "";
    return { error: "VEO_REQUEST_FAILED", providerStatus: response.status, detail };
  }
  const operationName = typeof payload?.name === "string" ? payload.name : "";
  if (!operationName) return { error: "VEO_OPERATION_MISSING" };
  return { operationName };
}

async function pollVeo(operationName: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}/${operationName}`, {
      headers: { "x-goog-api-key": GEMINI_API_KEY },
    });
    const payload = await response.json().catch(() => null) as JsonObject | null;
    if (!response.ok) return { error: "VEO_STATUS_FAILED", providerStatus: response.status };
    if (payload?.done === true) {
      if (payload.error) {
        const error = payload.error as JsonObject;
        return { error: "VEO_GENERATION_FAILED", detail: String(error.message ?? "").slice(0, 300) };
      }
      const responseBody = payload.response as JsonObject | undefined;
      const generated = responseBody?.generateVideoResponse as JsonObject | undefined;
      const samples = generated?.generatedSamples as JsonObject[] | undefined;
      const video = samples?.[0]?.video as JsonObject | undefined;
      const uri = typeof video?.uri === "string" ? video.uri : "";
      if (!uri) return { error: "VEO_VIDEO_URI_MISSING" };
      return { uri };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return { error: "VEO_TIMEOUT" };
}

async function storeVideo(
  supabase: ReturnType<typeof createClient>,
  staffId: string,
  videoUri: string,
  prompt: string,
  spec: VideoSpec,
  operationName: string,
) {
  const response = await fetch(videoUri, {
    headers: { "x-goog-api-key": GEMINI_API_KEY },
  });
  if (!response.ok) return { error: "VEO_DOWNLOAD_FAILED", providerStatus: response.status };
  const bytes = new Uint8Array(await response.arrayBuffer());
  const storagePath = `${staffId}/${crypto.randomUUID()}.mp4`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (upload.error) return { error: "STORAGE_UPLOAD_FAILED", detail: upload.error.message };

  const { data: asset, error: insertError } = await supabase
    .from("media_assets")
    .insert({
      created_by: staffId,
      asset_type: "video",
      source: "ai_generated",
      storage_path: storagePath,
      provider: "google_veo",
      provider_job_id: operationName,
      prompt,
      metadata: {
        source: "veo_3_1",
        model: spec.model,
        durationSeconds: spec.duration,
        resolution: spec.resolution,
        aspectRatio: "9:16",
        audio: true,
        estimatedCostUsd: Number((costPerSecond(spec.model, spec.resolution) * spec.duration).toFixed(4)),
        analysis: {
          synthetic: true,
          containsChildrenGuess: "no",
          containsPeopleGuess: "unknown",
          consentRequired: false,
          reviewRequired: true,
        },
        analysisProvider: "google_veo",
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
  if (insertError || !asset?.id) return { error: "MEDIA_REGISTER_FAILED" };
  return { mediaAssetId: String(asset.id), storagePath, bytes: bytes.byteLength };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ success: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ success: false, code: "SERVER_MISCONFIGURED" }, 500);
  if (!GEMINI_API_KEY) return json({ success: false, code: "GEMINI_CREDENTIAL_MISSING" }, 424);

  const token = bearerToken(request);
  if (!token) return json({ success: false, code: "AUTH_REQUIRED" }, 401);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const staff = await requireStaff(supabase, token);
  if ("error" in staff && staff.error) return staff.error;

  const body = await request.json().catch(() => ({})) as JsonObject;
  const spec = normalizeSpec(body);
  if ("error" in spec) return json({ success: false, code: spec.error }, 400);

  const estimatedCostUsd = Number((costPerSecond(spec.model, spec.resolution) * spec.duration).toFixed(4));
  if (body.mode === "estimate") {
    return json({
      success: true,
      provider: "google_veo",
      model: modelLabel(spec.model),
      modelId: spec.model,
      durationSeconds: spec.duration,
      resolution: spec.resolution,
      aspectRatio: "9:16",
      audio: true,
      estimatedCostUsd,
    });
  }

  if (body.mode !== "generate") return json({ success: false, code: "INVALID_MODE" }, 400);
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return json({ success: false, code: "PROMPT_REQUIRED" }, 400);
  if (prompt.length > 8000) return json({ success: false, code: "PROMPT_TOO_LONG" }, 400);

  const started = await callVeo(prompt, spec);
  if ("error" in started) return json({ success: false, ...started }, 502);

  const finished = await pollVeo(started.operationName);
  if ("error" in finished) return json({ success: false, ...finished }, 502);

  const stored = await storeVideo(
    supabase,
    staff.staffId,
    finished.uri,
    prompt,
    spec,
    started.operationName,
  );
  if ("error" in stored) return json({ success: false, ...stored }, 502);

  return json({
    success: true,
    provider: "google_veo",
    model: modelLabel(spec.model),
    modelId: spec.model,
    durationSeconds: spec.duration,
    resolution: spec.resolution,
    aspectRatio: "9:16",
    audio: true,
    estimatedCostUsd,
    ...stored,
  });
});
