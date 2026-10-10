import type { ContentBatchItem } from "./content-batch";
import { parseCanvaBrief } from "./content-batch-media-preview";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type CanvaDesignSession = { accessToken: string };

type CanvaDesignResponse = {
  success?: boolean;
  mediaAssetId?: string;
  canvaDesignUrl?: string;
  code?: string;
  detail?: string;
  integrationStatus?: string;
};

async function callCanvaDesignEdge(session: CanvaDesignSession, body: Record<string, unknown>): Promise<CanvaDesignResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/canva-design`, {
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
  return (await response.json().catch(() => ({}))) as CanvaDesignResponse;
}

export async function fetchCanvaDesignStatus(session: CanvaDesignSession): Promise<{ ready: boolean; detail: string }> {
  try {
    const result = await callCanvaDesignEdge(session, { mode: "status" });
    const ready = result.integrationStatus === "READY";
    return {
      ready,
      detail: result.detail ?? (ready ? "Canva design generation ready." : "Canva design generation not ready."),
    };
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
    return { ready: false, detail: "Canva design status unavailable." };
  }
}

export async function generateCanvaDesignForContentItem(
  session: CanvaDesignSession,
  item: ContentBatchItem,
): Promise<{ mediaAssetId: string; canvaDesignUrl?: string }> {
  const result = await callCanvaDesignEdge(session, {
    mode: "generate",
    contentItemId: item.id,
    topic: item.topic,
    hook: typeof item.hook === "string" ? item.hook : "",
    caption: item.caption,
    canvaBrief: parseCanvaBrief(typeof item.visualPrompt === "string" ? item.visualPrompt : undefined),
  });
  if (!result.success || !result.mediaAssetId) throw new Error(result.code ?? "CANVA_DESIGN_FAILED");
  return { mediaAssetId: result.mediaAssetId, canvaDesignUrl: result.canvaDesignUrl };
}

export function canvaDesignErrorMessage(code: string | undefined): string {
  switch (code) {
    case "CANVA_NOT_CONNECTED":
      return "Connect Canva in Media Library first, then try again.";
    case "NEEDS_CREDENTIAL":
      return "Canva design automation is not configured on the server yet.";
    case "AUTOFILL_FAILED":
    case "AUTOFILL_TIMEOUT":
    case "EXPORT_FAILED":
    case "EXPORT_TIMEOUT":
      return "Canva could not finish the design this time. Try again in a moment.";
    default:
      return code ? `Canva design failed (${code}).` : "Canva design could not be generated.";
  }
}
