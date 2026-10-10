import type { CoachBrainFactoryContext, CoachKnowledgeContext, GeneratedBatchItem } from "./content-batch-generator";
import type { BRAND, PLATFORM_GUIDANCE, PerformanceInsight, StrategySummary } from "./content-strategy";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type GeminiBatchSession = { accessToken: string };
export type GeneratedContentSample = GeneratedBatchItem;

export type GeminiBatchPromptContext = {
  academyKnowledge: CoachKnowledgeContext["entries"];
  coachBrainResearch: CoachBrainFactoryContext | null;
  businessStrategy: {
    brand: typeof BRAND;
    platformGuidance: typeof PLATFORM_GUIDANCE;
    strategySummary: StrategySummary;
  };
  performanceGuidance: PerformanceInsight[];
};

export type BatchAiProvider = "auto" | "gemini" | "openai";

type GeminiBatchEdgeResponse = {
  success?: boolean;
  connected?: boolean;
  integrationStatus?: string;
  items?: GeneratedBatchItem[];
  code?: string;
  detail?: string;
};

async function callGenerateContentBatchEdge(session: GeminiBatchSession, body: Record<string, unknown>): Promise<GeminiBatchEdgeResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-content-batch`, {
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
  return (await response.json().catch(() => ({}))) as GeminiBatchEdgeResponse;
}

export async function fetchGeminiBatchGenerationStatus(session: GeminiBatchSession): Promise<{ connected: boolean; detail: string }> {
  try {
    const result = await callGenerateContentBatchEdge(session, { mode: "status" });
    const connected = result.connected === true;
    return {
      connected,
      detail: result.detail ?? (connected ? "Gemini batch generation ready." : "Gemini batch generation unavailable."),
    };
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
    return { connected: false, detail: "Gemini batch generation status unavailable." };
  }
}

export async function generateCoachAymanBatchWithProvider(
  session: GeminiBatchSession,
  provider: BatchAiProvider,
  batchNonce: string,
  start = new Date(),
  promptContext?: GeminiBatchPromptContext,
): Promise<GeneratedBatchItem[] | null> {
  const result = await callGenerateContentBatchEdge(session, {
    mode: "generate",
    provider,
    batchNonce,
    startIso: start.toISOString(),
    promptContext: promptContext ?? null,
  });
  if (result.code === "NEEDS_CREDENTIAL" || result.code === "GEMINI_UNAVAILABLE") return null;
  if (!result.success || !Array.isArray(result.items) || result.items.length === 0) {
    throw new Error(result.code ?? "GEMINI_BATCH_FAILED");
  }
  return result.items;
}

export async function generateCoachAymanSampleWithProvider(
  session: GeminiBatchSession,
  provider: BatchAiProvider,
  sampleSlot = 0,
  batchNonce = crypto.randomUUID(),
  start = new Date(),
  promptContext?: GeminiBatchPromptContext,
): Promise<GeneratedContentSample | null> {
  const result = await callGenerateContentBatchEdge(session, {
    mode: "sample",
    provider,
    sampleSlot,
    batchNonce,
    startIso: start.toISOString(),
    promptContext: promptContext ?? null,
  });
  if (result.code === "NEEDS_CREDENTIAL" || result.code === "GEMINI_UNAVAILABLE") return null;
  if (!result.success || !Array.isArray(result.items) || result.items.length !== 1) {
    throw new Error(result.code ?? "CONTENT_SAMPLE_FAILED");
  }
  return result.items[0] ?? null;
}

export async function generateCoachAymanBatchWithGemini(
  session: GeminiBatchSession,
  batchNonce: string,
  start = new Date(),
  promptContext?: GeminiBatchPromptContext,
): Promise<GeneratedBatchItem[] | null> {
  return generateCoachAymanBatchWithProvider(session, "gemini", batchNonce, start, promptContext);
}
