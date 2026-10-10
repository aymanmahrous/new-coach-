import { buildFallbackAssetPlan } from "./media-providers";
import type { GeneratedBatchItem } from "./content-batch-generator";
import { buildCoachAyman2026BatchItems, type CoachKnowledgeContext } from "./content-batch-generator";
import { canUseInMarketingBatch, type MediaAssetRecord, type MediaSourceKind } from "./media-types";

export type BatchMediaAttachment = {
  mediaAssetId: string | null;
  mediaSource: MediaSourceKind;
  mediaPlan: Record<string, unknown> | null;
};

function platformFormatMatch(asset: MediaAssetRecord, item: GeneratedBatchItem): number {
  const formats = asset.suggestedFormats.length ? asset.suggestedFormats : (asset.metadata.analysis as { suggestedFormats?: string[] } | undefined)?.suggestedFormats ?? [];
  const platforms = asset.suggestedPlatforms.length ? asset.suggestedPlatforms : (asset.metadata.analysis as { suggestedPlatforms?: string[] } | undefined)?.suggestedPlatforms ?? [];
  let score = 0;
  if (platforms.some((p) => p.includes(item.platform))) score += 2;
  if (/reel|video/.test(item.contentType) && formats.some((f) => /reel|video|tiktok/.test(f))) score += 2;
  if (/carousel|post/.test(item.contentType) && formats.some((f) => /post|carousel/.test(f))) score += 1;
  if (asset.assetType === "video" && /reel|video/.test(item.contentType)) score += 1;
  if (asset.assetType === "image" && !/reel|video/.test(item.contentType)) score += 1;
  return score;
}

export function attachMediaToCoachAymanBatch(
  items: GeneratedBatchItem[],
  assets: MediaAssetRecord[],
): Array<GeneratedBatchItem & BatchMediaAttachment> {
  const eligible = assets
    .filter((asset) => asset.assetType === "image" || asset.assetType === "video")
    .filter(canUseInMarketingBatch)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const used = new Set<string>();

  return items.map((item) => {
    const ranked = eligible
      .filter((asset) => !used.has(asset.id))
      .map((asset) => ({ asset, score: platformFormatMatch(asset, item) }))
      .sort((left, right) => right.score - left.score);

    const top = ranked[0];
    if (top && top.score > 0) {
      const best = top.asset;
      used.add(best.id);
      return {
        ...item,
        mediaAssetId: best.id,
        mediaSource: "real" as const,
        mediaPlan: null,
      };
    }

    return {
      ...item,
      mediaAssetId: null,
      mediaSource: "pending" as const,
      mediaPlan: buildFallbackAssetPlan(item.contentType, item.topic),
    };
  });
}

export function batchReadyForReviewCount(items: Array<{ status?: string }>): number {
  return items.filter((item) => ["needs_review", "draft", "generated", "approved"].includes(String(item.status ?? ""))).length;
}

export async function buildCoachAyman2026BatchWithMedia(
  assets: MediaAssetRecord[],
  start = new Date(),
  batchNonce = start.toISOString(),
  knowledgeContext?: CoachKnowledgeContext,
) {
  const base = await buildCoachAyman2026BatchItems(start, batchNonce, knowledgeContext);
  return attachMediaToCoachAymanBatch(base, assets);
}

/**
 * Compatibility entry point used by the Content Factory UI.
 * The operating cycle is intentionally the 10-post batch, not the legacy
 * 30-day calendar. The legacy 30-day generator remains available separately.
 */
export async function buildCoachAyman30DayBatchWithMedia(
  assets: MediaAssetRecord[],
  start = new Date(),
  batchNonce = start.toISOString(),
  knowledgeContext?: CoachKnowledgeContext,
) {
  return buildCoachAyman2026BatchWithMedia(assets, start, batchNonce, knowledgeContext);
}
