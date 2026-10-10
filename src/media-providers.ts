export type ProviderKey = "gemini" | "canva" | "runway" | "capcut" | "buffer" | "n8n";

export type ProviderStatus = {
  key: ProviderKey;
  connected: boolean;
  detail: string;
  optional?: boolean;
  manual?: boolean;
};

export const SERVER_PROVIDER_CREDENTIALS = {
  canvaClientId: "CANVA_CLIENT_ID",
  canvaClientSecret: "CANVA_CLIENT_SECRET",
  canvaRedirectUri: "CANVA_REDIRECT_URI",
  commandCenterReturnUrl: "COMMAND_CENTER_RETURN_URL",
  runway: "RUNWAY_API_KEY",
  buffer: "BUFFER_ACCESS_TOKEN",
  n8n: "N8N_WEBHOOK_URL",
} as const;

const DEFAULT_STATUSES: Record<ProviderKey, ProviderStatus> = {
  gemini: { key: "gemini", connected: false, detail: "Gemini — server-side media review via Edge Function" },
  canva: {
    key: "canva",
    connected: false,
    optional: true,
    detail: "Canva — OPTIONAL / NOT CONNECTED (OAuth via Connect API; manual canvaBrief always available)",
  },
  runway: {
    key: "runway",
    connected: false,
    detail: `Runway — NOT CONNECTED (future ${SERVER_PROVIDER_CREDENTIALS.runway} server-side only)`,
  },
  capcut: { key: "capcut", connected: false, manual: true, detail: "CapCut — MANUAL workflow via capcutBrief (no API)" },
  buffer: {
    key: "buffer",
    connected: false,
    detail: `Buffer — NOT CONNECTED (future ${SERVER_PROVIDER_CREDENTIALS.buffer} server-side only; publishing blocked)`,
  },
  n8n: {
    key: "n8n",
    connected: false,
    detail: `n8n — NOT CONNECTED (future ${SERVER_PROVIDER_CREDENTIALS.n8n} webhook-only; no polling)`,
  },
};

export function displayProviderStatus(
  provider: ProviderStatus,
  options?: {
    geminiIntegration?: "CONNECTED" | "NOT CONNECTED" | "NEEDS CREDENTIAL";
    canvaConnected?: boolean;
  },
): string {
  const geminiIntegration = options?.geminiIntegration;
  if (provider.key === "gemini") {
    if (geminiIntegration === "CONNECTED" || provider.connected) return "CONNECTED";
    if (geminiIntegration === "NEEDS CREDENTIAL") return "NEEDS CREDENTIAL";
    return "NOT CONNECTED";
  }
  if (provider.key === "canva") {
    if (options?.canvaConnected || provider.connected) return "CONNECTED";
    return "OPTIONAL / NOT CONNECTED";
  }
  if (provider.key === "capcut") return "MANUAL";
  return provider.connected ? "CONNECTED" : "NOT CONNECTED";
}

export function readMediaProviderStatuses(flags: Partial<Record<ProviderKey, boolean>> = {}): ProviderStatus[] {
  return (Object.keys(DEFAULT_STATUSES) as ProviderKey[]).map((key) => {
    if (flags[key] === true) return { ...DEFAULT_STATUSES[key], connected: true, detail: `${key} reported connected` };
    return DEFAULT_STATUSES[key];
  });
}

export type FallbackAssetPlan = {
  source: "pending";
  providers: ProviderKey[];
  status: "NOT_CONNECTED";
  canvaBrief: string;
  runwayBrief?: string;
  capcutBrief: string;
  geminiBrief?: string;
  note: string;
};

export function buildFallbackAssetPlan(contentType: string, topic: string): FallbackAssetPlan {
  const isVideo = /reel|video/i.test(contentType);
  return {
    source: "pending",
    providers: isVideo ? ["canva", "runway", "capcut"] : ["canva"],
    status: "NOT_CONNECTED",
    canvaBrief: `Design static or carousel frames for: ${topic}`,
    runwayBrief: isVideo ? `Optional b-roll generation for: ${topic}` : undefined,
    capcutBrief: isVideo ? `Vertical edit with hook in first 2 seconds for: ${topic}` : "Not required for static post",
    geminiBrief: "Gemini API NOT CONNECTED — use local analysis only",
    note: "No suitable Swimming Business media found. Manual Canva/CapCut briefs prepared; optional providers remain NOT CONNECTED and do not block batch creation.",
  };
}
