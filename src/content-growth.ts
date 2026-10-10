import type { ContentBatchItem } from "./content-batch";

export const CONTENT_CYCLE_DAYS = 10;

export type PipelineStats = {
  total: number;
  needsReview: number;
  approved: number;
  scheduled: number;
  published: number;
  failed: number;
  other: number;
};

export type IntegrationKey = "buffer" | "canva" | "runway" | "facebook" | "instagram" | "tiktok" | "n8n";
export type CapabilityState = "AVAILABLE" | "LIMITED" | "BLOCKED" | "NOT_CONFIGURED";

export type IntegrationStatus = {
  key: IntegrationKey;
  connected: boolean;
  capabilityState: CapabilityState;
  detail: string;
};

const REVIEWABLE = new Set(["draft", "generated", "needs_review"]);

export function summarizePipeline(items: ContentBatchItem[]): PipelineStats {
  const stats: PipelineStats = {
    total: items.length,
    needsReview: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    other: 0,
  };
  for (const item of items) {
    if (REVIEWABLE.has(item.status)) stats.needsReview += 1;
    else if (item.status === "approved") stats.approved += 1;
    else if (item.status === "scheduled") stats.scheduled += 1;
    else if (item.status === "published") stats.published += 1;
    else if (item.status === "failed") stats.failed += 1;
    else stats.other += 1;
  }
  return stats;
}

export function computeCycleDay(createdAt: string, now = new Date()): number {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start)) return 1;
  const diffMs = now.getTime() - start;
  const day = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(day, CONTENT_CYCLE_DAYS));
}

export function readIntegrationStatuses(automationStatus: unknown): IntegrationStatus[] {
  const flags = parseAutomationFlags(automationStatus);
  return [
    statusFromFlag("buffer", flags.buffer, "Buffer scheduling"),
    statusFromFlag("canva", flags.canva, "Canva design automation"),
    statusFromFlag("runway", flags.runway, "Runway video generation"),
    statusFromFlag("facebook", flags.facebook, "Facebook publishing"),
    statusFromFlag("instagram", flags.instagram, "Instagram publishing"),
    statusFromFlag("tiktok", flags.tiktok, "TikTok publishing"),
    statusFromFlag("n8n", flags.n8n, "n8n content automation"),
  ];
}

export function displayIntegrationStatus(integration: IntegrationStatus): string {
  if (integration.key === "canva" && !integration.connected) return "OPTIONAL / NOT CONNECTED";
  return integration.connected ? "CONNECTED (UNVERIFIED)" : "NOT CONNECTED";
}

export function displayCapabilityState(state: CapabilityState, language: "ar" | "en"): string {
  const labels = {
    ar: { AVAILABLE: "متاح", LIMITED: "محدود", BLOCKED: "متوقف", NOT_CONFIGURED: "غير مهيأ" },
    en: { AVAILABLE: "AVAILABLE", LIMITED: "LIMITED", BLOCKED: "BLOCKED", NOT_CONFIGURED: "NOT CONFIGURED" },
  } as const;
  return labels[language][state];
}

function statusFromFlag(key: IntegrationKey, connected: boolean | null | undefined, label: string): IntegrationStatus {
  if (key === "canva" && connected !== true) {
    return {
      key,
      connected: false,
      capabilityState: "NOT_CONFIGURED",
      detail: "Canva — OPTIONAL / NOT CONNECTED (manual design via canvaBrief; not required for batch creation)",
    };
  }
  if (connected === true) return { key, connected: true, capabilityState: "LIMITED", detail: `${label} reported connected; capability not verified in app` };
  if (connected === false) return { key, connected: false, capabilityState: "NOT_CONFIGURED", detail: `${label} not connected` };
  return { key, connected: false, capabilityState: "LIMITED", detail: `${label} — connection not verified in app` };
}

function parseAutomationFlags(value: unknown): Partial<Record<IntegrationKey, boolean>> {
  const result: Partial<Record<IntegrationKey, boolean>> = {};
  if (!value || typeof value !== "object") return result;
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    for (const [rawKey, rawValue] of Object.entries(entry as Record<string, unknown>)) {
      const key = normalizeIntegrationKey(rawKey);
      if (!key) continue;
      if (typeof rawValue === "boolean") result[key] = rawValue;
      else if (typeof rawValue === "string") {
        const normalized = rawValue.toLowerCase();
        if (["connected", "ready", "active", "ok", "true"].includes(normalized)) result[key] = true;
        if (["disconnected", "missing", "inactive", "false", "blocked"].includes(normalized)) result[key] = false;
      } else if (rawValue && typeof rawValue === "object") {
        const nested = rawValue as Record<string, unknown>;
        if (typeof nested.connected === "boolean") result[key] = nested.connected;
        if (typeof nested.status === "string") {
          const normalized = nested.status.toLowerCase();
          if (["connected", "ready", "active", "ok"].includes(normalized)) result[key] = true;
          if (["disconnected", "missing", "inactive", "blocked"].includes(normalized)) result[key] = false;
        }
      }
    }
  }
  return result;
}

function normalizeIntegrationKey(rawKey: string): IntegrationKey | null {
  const key = rawKey.toLowerCase();
  if (key.includes("buffer")) return "buffer";
  if (key.includes("canva")) return "canva";
  if (key.includes("runway")) return "runway";
  if (key.includes("facebook")) return "facebook";
  if (key.includes("instagram")) return "instagram";
  if (key.includes("tiktok")) return "tiktok";
  if (key.includes("n8n") || key.includes("automation")) return "n8n";
  return null;
}

export function canScheduleSafely(item: ContentBatchItem): boolean {
  return item.status === "approved" && !item.scheduledFor;
}

export function scheduleDuplicateBlocked(item: ContentBatchItem): boolean {
  return item.status === "scheduled" || item.status === "published";
}

export type ChangeRequestKind =
  | "caption"
  | "cta"
  | "hook"
  | "visual"
  | "schedule"
  | "regenerate";

export function buildChangeRequestNote(kind: ChangeRequestKind, note: string): string {
  const trimmed = note.trim();
  const prefix = `[CHANGE REQUEST:${kind.toUpperCase()}]`;
  return trimmed ? `${prefix} ${trimmed}` : prefix;
}

export function appendChangeRequest(existing: string, note: string): string {
  const combined = `${existing.trim()}\n\n${note}`.trim();
  return combined.length > 2000 ? combined.slice(-2000) : combined;
}
