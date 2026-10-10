import type { MediaAssetRecord, MediaCategory, AiSuitabilityVerdict } from "./media-types";
import { derivePublishability } from "./media-types";

export type MediaAnalysisResult = {
  provider: "local_heuristic" | "gemini";
  providerConnected: boolean;
  suitabilityVerdict: AiSuitabilityVerdict;
  qualityScore: number;
  clarityScore: number;
  swimmingFitScore: number;
  containsChildrenGuess: "unknown" | "possible" | "no";
  suggestedPlatforms: string[];
  suggestedFormats: string[];
  hook: string;
  onScreenText: string;
  captionIdea: string;
  cta: string;
  cropSuggestion: string;
  editSuggestion: string;
  videoSegments?: Array<{ startSec: number; endSec: number; label: string }>;
  bestReelSegment?: { startSec: number; endSec: number; reason: string };
  notes: string;
};

function scoreFromType(assetType: MediaAssetRecord["assetType"], category: MediaCategory) {
  const base = assetType === "video" ? 72 : 68;
  const bonus = category === "swimming_business" ? 12 : category === "other_business" ? 4 : 0;
  return Math.min(95, base + bonus);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asVerdict(value: unknown): AiSuitabilityVerdict {
  return value === "good" || value === "needs_review" || value === "unsuitable" ? value : "needs_review";
}

function asChildrenGuess(value: unknown): MediaAnalysisResult["containsChildrenGuess"] {
  return value === "possible" || value === "no" ? value : "unknown";
}

export function readStoredMediaAnalysis(metadata: Record<string, unknown>): MediaAnalysisResult | null {
  const raw = metadata.analysis;
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<MediaAnalysisResult> & {
    recommendedPlatform?: unknown;
    suggestedCaption?: unknown;
    marketingNotes?: unknown;
  };
  const suggestedFormats = asStringArray(candidate.suggestedFormats);
  const suggestedPlatforms = asStringArray(candidate.suggestedPlatforms);
  const recommendedPlatform = typeof candidate.recommendedPlatform === "string" ? candidate.recommendedPlatform.trim() : "";
  const platforms = suggestedPlatforms.length > 0
    ? suggestedPlatforms
    : recommendedPlatform
      ? [recommendedPlatform]
      : [];
  const captionIdea = typeof candidate.captionIdea === "string"
    ? candidate.captionIdea
    : typeof candidate.suggestedCaption === "string"
      ? candidate.suggestedCaption
      : "";
  const notes = typeof candidate.notes === "string"
    ? candidate.notes
    : typeof candidate.marketingNotes === "string"
      ? candidate.marketingNotes
      : "";

  if (!candidate.suitabilityVerdict && platforms.length === 0 && suggestedFormats.length === 0 && !captionIdea && !notes) {
    return null;
  }

  return {
    provider: candidate.provider === "gemini" ? "gemini" : "local_heuristic",
    providerConnected: candidate.providerConnected === true,
    suitabilityVerdict: asVerdict(candidate.suitabilityVerdict),
    qualityScore: typeof candidate.qualityScore === "number" ? candidate.qualityScore : 0,
    clarityScore: typeof candidate.clarityScore === "number" ? candidate.clarityScore : 0,
    swimmingFitScore: typeof candidate.swimmingFitScore === "number" ? candidate.swimmingFitScore : 0,
    containsChildrenGuess: asChildrenGuess(candidate.containsChildrenGuess),
    suggestedPlatforms: platforms,
    suggestedFormats,
    hook: typeof candidate.hook === "string" ? candidate.hook : captionIdea,
    onScreenText: typeof candidate.onScreenText === "string" ? candidate.onScreenText : "",
    captionIdea,
    cta: typeof candidate.cta === "string" ? candidate.cta : "",
    cropSuggestion: typeof candidate.cropSuggestion === "string" ? candidate.cropSuggestion : "",
    editSuggestion: typeof candidate.editSuggestion === "string" ? candidate.editSuggestion : "",
    videoSegments: Array.isArray(candidate.videoSegments) ? candidate.videoSegments : undefined,
    bestReelSegment: candidate.bestReelSegment,
    notes,
  };
}

export function analyzeMediaLocally(asset: Pick<MediaAssetRecord, "assetType" | "category" | "metadata">): MediaAnalysisResult {
  const category = asset.category;
  const fileName = typeof asset.metadata.file_name === "string" ? asset.metadata.file_name.toLowerCase() : "";
  const containsChildrenGuess = /child|kid|son|daughter|baby|طفل|أطفال/.test(fileName) ? "possible" : "unknown";
  const isVideo = asset.assetType === "video";
  const qualityScore = scoreFromType(asset.assetType, category);
  const clarityScore = Math.min(90, qualityScore - 4);
  const swimmingFitScore = category === "swimming_business" ? Math.min(92, qualityScore + 6) : category === "other_business" ? 45 : 20;

  const suggestedPlatforms = swimmingFitScore >= 60
    ? (isVideo ? ["instagram_reel", "facebook_reel", "tiktok"] : ["instagram_post", "facebook_post"])
    : ["instagram_post"];

  const suggestedFormats = isVideo
    ? ["instagram_reel", "facebook_reel", "tiktok"]
    : ["instagram_post", "instagram_carousel", "facebook_post"];

  const suitabilityVerdict: AiSuitabilityVerdict = swimmingFitScore >= 75 && clarityScore >= 70
    ? "good"
    : swimmingFitScore < 45 || category !== "swimming_business"
      ? "unsuitable"
      : "needs_review";

  return {
    provider: "local_heuristic",
    providerConnected: false,
    suitabilityVerdict,
    qualityScore,
    clarityScore,
    swimmingFitScore,
    containsChildrenGuess,
    suggestedPlatforms,
    suggestedFormats,
    hook: isVideo ? "One calm pool habit parents can copy today." : "Simple swimming tip for Abu Dhabi parents.",
    onScreenText: isVideo ? "Calm breath · Small steps · Coach Ayman" : "Relax Fix UAE · Swimming Academy",
    captionIdea: "Educational swimming guidance — no guarantees, no fabricated results.",
    cta: "WhatsApp 058 821 9130 — messages & booking · Call 055 137 8660 — admin team (phone calls only) · Free initial assessment.",
    cropSuggestion: isVideo ? "Keep coach and learner visible; avoid tight face crops of children." : "Center subject with pool context; leave space for CTA overlay.",
    editSuggestion: isVideo ? "Trim to 15–20s vertical; add captions in first 2 seconds." : "Light contrast boost; keep logo clear; avoid heavy filters.",
    videoSegments: isVideo
      ? [{ startSec: 0, endSec: 3, label: "Hook" }, { startSec: 3, endSec: 12, label: "Teaching moment" }, { startSec: 12, endSec: 18, label: "CTA card" }]
      : undefined,
    bestReelSegment: isVideo ? { startSec: 3, endSec: 15, reason: "Stable action with clear teaching cue and minimal background noise." } : undefined,
    notes: containsChildrenGuess === "possible"
      ? "Possible child content detected from filename only. Consent Required before any publish use. Gemini API NOT CONNECTED."
      : "Local heuristic analysis only. Gemini API NOT CONNECTED — verify visually before approval.",
  };
}

export function analysisConsentHint(analysis: MediaAnalysisResult): "unknown" | "consent_required" | "consent_confirmed" | "no_consent" {
  if (analysis.containsChildrenGuess === "possible") return "consent_required";
  return "unknown";
}

export function analysisPublishability(
  category: MediaCategory,
  consentStatus: ReturnType<typeof analysisConsentHint>,
  mediaStatus: "unclassified" | "approved" | "rejected" | "unsuitable",
) {
  return derivePublishability(category, consentStatus, mediaStatus);
}
