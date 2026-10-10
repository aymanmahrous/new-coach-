export const MEDIA_CATEGORIES = [
  "swimming_business",
  "family_personal",
  "other_business",
  "other",
  "unclassified",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const MARKETING_BLOCKED_CATEGORIES = new Set<MediaCategory>([
  "family_personal",
  "other",
  "unclassified",
]);

export type ConsentStatus = "unknown" | "consent_required" | "consent_confirmed" | "no_consent";
export type AiSuitabilityVerdict = "good" | "needs_review" | "unsuitable";
export type AiAnalysisStatus = "not_started" | "pending" | "completed" | "failed";
export type PublishabilityStatus = "blocked" | "consent_required" | "ready_for_review" | "unsuitable";
export type MediaWorkflowStatus = "unclassified" | "approved" | "rejected" | "unsuitable";
export type MediaSourceKind = "real" | "ai_generated" | "pending";

export type MediaAssetRecord = {
  id: string;
  assetType: "image" | "video" | "logo" | "other";
  source: "upload" | "ai_generated" | "external";
  storagePath: string | null;
  category: MediaCategory;
  mediaStatus: MediaWorkflowStatus;
  aiAnalysisStatus: AiAnalysisStatus;
  publishabilityStatus: PublishabilityStatus;
  consentStatus: ConsentStatus;
  suggestedPlatforms: string[];
  suggestedFormats: string[];
  aiNotes: string;
  metadata: Record<string, unknown>;
  contentItemId: string | null;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
};

export function normalizeMediaCategory(value: unknown): MediaCategory {
  if (typeof value === "string" && MEDIA_CATEGORIES.includes(value as MediaCategory)) {
    return value as MediaCategory;
  }
  return "unclassified";
}

export function isMarketingEligibleCategory(category: MediaCategory): boolean {
  return category === "swimming_business" || category === "other_business";
}

export function displayMediaWorkflowStatus(
  asset: Pick<MediaAssetRecord, "mediaStatus" | "aiAnalysisStatus">,
): "pending_review" | "reviewed" | "approved" | "rejected" | "unsuitable" {
  if (asset.mediaStatus === "approved") return "approved";
  if (asset.mediaStatus === "rejected") return "rejected";
  if (asset.mediaStatus === "unsuitable") return "unsuitable";
  if (asset.aiAnalysisStatus === "completed") return "reviewed";
  return "pending_review";
}

export function canUseInMarketingBatch(asset: Pick<MediaAssetRecord, "category" | "consentStatus" | "publishabilityStatus" | "mediaStatus">): boolean {
  if (!isMarketingEligibleCategory(asset.category)) return false;
  if (asset.category === "swimming_business" && asset.consentStatus !== "consent_confirmed") return false;
  if (asset.mediaStatus === "unsuitable" || asset.mediaStatus === "rejected") return false;
  if (asset.publishabilityStatus === "blocked" || asset.publishabilityStatus === "consent_required" || asset.publishabilityStatus === "unsuitable") {
    return false;
  }
  return asset.publishabilityStatus === "ready_for_review";
}

export function derivePublishability(
  category: MediaCategory,
  consentStatus: ConsentStatus,
  mediaStatus: MediaWorkflowStatus,
): PublishabilityStatus {
  if (MARKETING_BLOCKED_CATEGORIES.has(category)) return "blocked";
  if (mediaStatus === "unsuitable" || mediaStatus === "rejected") return "unsuitable";
  if (category === "swimming_business") {
    if (consentStatus === "consent_required" || consentStatus === "unknown") return "consent_required";
    if (consentStatus === "no_consent") return "blocked";
  }
  return "ready_for_review";
}
