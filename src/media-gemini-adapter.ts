import { analyzeMediaLocally, type MediaAnalysisResult } from "./media-ai-analysis";
import type { MediaAssetRecord } from "./media-types";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
export const GEMINI_CREDENTIAL_ENV_VAR = "GEMINI_API_KEY";

export type GeminiIntegrationStatus = "CONNECTED" | "NOT CONNECTED" | "NEEDS CREDENTIAL";

export type MediaAnalysisProviderResult = {
  analysis: MediaAnalysisResult;
  provider: "local_heuristic" | "gemini";
  providerConnected: boolean;
  integrationStatus: GeminiIntegrationStatus;
  detail: string;
};

type GeminiSession = { accessToken: string };

type EdgeGeminiResponse = {
  success?: boolean;
  connected?: boolean;
  integrationStatus?: GeminiIntegrationStatus;
  detail?: string;
  code?: string;
  credentialEnvVar?: string;
  provider?: "gemini";
  analysis?: MediaAnalysisResult;
};

function normalizeGeminiAnalysis(analysis: MediaAnalysisResult): MediaAnalysisResult {
  return {
    ...analysis,
    provider: "gemini",
    providerConnected: true,
  };
}

async function callAnalyzeStaffMediaEdge(session: GeminiSession, body: Record<string, unknown>): Promise<EdgeGeminiResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-staff-media`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  return (await response.json().catch(() => ({}))) as EdgeGeminiResponse;
}

export async function fetchGeminiIntegrationStatus(session: GeminiSession): Promise<{ connected: boolean; integrationStatus: GeminiIntegrationStatus; detail: string }> {
  try {
    const result = await callAnalyzeStaffMediaEdge(session, { mode: "status" });
    if (result.integrationStatus === "NEEDS CREDENTIAL" || result.code === "NEEDS_CREDENTIAL") {
      return {
        connected: false,
        integrationStatus: "NEEDS CREDENTIAL",
        detail: `Gemini requires ${result.credentialEnvVar ?? GEMINI_CREDENTIAL_ENV_VAR} in Supabase Edge Function secrets.`,
      };
    }
    if (result.connected) {
      return { connected: true, integrationStatus: "CONNECTED", detail: result.detail ?? "Gemini server-side credentials detected." };
    }
    return {
      connected: false,
      integrationStatus: "NOT CONNECTED",
      detail: result.detail ?? "Gemini server-side endpoint not connected.",
    };
  } catch {
    return {
      connected: false,
      integrationStatus: "NOT CONNECTED",
      detail: "Gemini server-side status unavailable — using local heuristic analysis.",
    };
  }
}

export function geminiIntegrationStatus(): { connected: false; integrationStatus: "NOT CONNECTED"; detail: string } {
  return {
    connected: false,
    integrationStatus: "NOT CONNECTED",
    detail: "Gemini status is resolved server-side when staff run AI review.",
  };
}

export async function analyzeMediaWithProvider(
  asset: Pick<MediaAssetRecord, "id" | "assetType" | "category" | "metadata">,
  session?: GeminiSession,
): Promise<MediaAnalysisProviderResult> {
  const fallback = analyzeMediaLocally(asset);
  if (!session || asset.category !== "swimming_business") {
    return {
      analysis: fallback,
      provider: "local_heuristic",
      providerConnected: false,
      integrationStatus: "NOT CONNECTED",
      detail: asset.category !== "swimming_business"
        ? "AI review is limited to Swimming Business media."
        : "Gemini requires authenticated server-side review.",
    };
  }

  try {
    const result = await callAnalyzeStaffMediaEdge(session, { mediaAssetId: asset.id });
    if (result.code === "NEEDS_CREDENTIAL" || result.integrationStatus === "NEEDS CREDENTIAL") {
      return {
        analysis: fallback,
        provider: "local_heuristic",
        providerConnected: false,
        integrationStatus: "NEEDS CREDENTIAL",
        detail: `Add ${result.credentialEnvVar ?? GEMINI_CREDENTIAL_ENV_VAR} to Supabase Edge Function secrets (Project Settings → Edge Functions → Secrets).`,
      };
    }
    if (result.success && result.analysis) {
      return {
        analysis: normalizeGeminiAnalysis(result.analysis),
        provider: "gemini",
        providerConnected: true,
        integrationStatus: "CONNECTED",
        detail: result.detail ?? "Gemini server-side analysis completed.",
      };
    }
    return {
      analysis: fallback,
      provider: "local_heuristic",
      providerConnected: false,
      integrationStatus: result.integrationStatus ?? "NOT CONNECTED",
      detail: result.detail ?? result.code ?? "Gemini unavailable — local heuristic fallback used.",
    };
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
    return {
      analysis: fallback,
      provider: "local_heuristic",
      providerConnected: false,
      integrationStatus: "NOT CONNECTED",
      detail: "Gemini server-side request failed — local heuristic fallback used.",
    };
  }
}
