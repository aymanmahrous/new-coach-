export const BATCH_TARGET_SIZE = 10;

export const REVIEWABLE_FOR_APPROVAL = new Set(["draft", "generated", "needs_review"]);
export const POST_APPROVAL_STATUSES = new Set(["approved", "scheduled", "published"]);

export type ContentBatchItem = {
  id: string;
  status: string;
  createdAt: string;
  platform: string;
  contentType: string;
  caption: string;
  topic: string;
  hook?: string;
  cta?: string;
  hashtags?: string[];
  visualPrompt?: string;
  scheduledFor: string | null;
  [key: string]: unknown;
};

export type ContentBatch = {
  batchId: string;
  items: ContentBatchItem[];
  createdAt: string;
  reviewDeadline: string | null;
  isExplicitBatch: boolean;
};

export type BatchSummary = {
  total: number;
  needsReview: number;
  approved: number;
  scheduled: number;
  published: number;
  failed: number;
  other: number;
};

const BATCH_ID_KEYS = ["batchId", "batch_id", "batchID"] as const;
const DATABASE_BATCH_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDatabaseBatchId(batchId: string): boolean {
  return DATABASE_BATCH_ID_RE.test(batchId.trim());
}

export function sharedDatabaseBatchId(items: ContentBatchItem[]): string | null {
  const ids = new Set<string>();
  for (const item of items) {
    const batchId = readBatchId(item);
    if (batchId) ids.add(batchId);
  }
  if (ids.size !== 1) return null;
  const [batchId] = ids;
  return batchId && isDatabaseBatchId(batchId) ? batchId : null;
}
const REVIEW_DEADLINE_KEYS = ["reviewDeadline", "review_deadline", "reviewDate", "review_date"] as const;

export function readBatchId(item: Record<string, unknown>): string | null {
  for (const key of BATCH_ID_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readReviewDeadline(item: ContentBatchItem | undefined): string | null {
  if (!item) return null;
  for (const key of REVIEW_DEADLINE_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function canApproveContentItem(item: ContentBatchItem): boolean {
  return REVIEWABLE_FOR_APPROVAL.has(item.status);
}

export function shouldSkipApprove(item: ContentBatchItem): boolean {
  return !canApproveContentItem(item) || POST_APPROVAL_STATUSES.has(item.status);
}

export function isDuplicateScheduleCandidate(item: ContentBatchItem): boolean {
  return item.status === "scheduled" || item.status === "published";
}

export function summarizeBatch(items: ContentBatchItem[]): BatchSummary {
  const summary: BatchSummary = {
    total: items.length,
    needsReview: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    other: 0,
  };
  for (const item of items) {
    if (item.status === "needs_review" || item.status === "draft" || item.status === "generated") summary.needsReview += 1;
    else if (item.status === "approved") summary.approved += 1;
    else if (item.status === "scheduled") summary.scheduled += 1;
    else if (item.status === "published") summary.published += 1;
    else if (item.status === "failed") summary.failed += 1;
    else summary.other += 1;
  }
  return summary;
}

export function overallBatchStatus(items: ContentBatchItem[]): "needs_review" | "approved" | "scheduled" | "published" | "failed" | "mixed" {
  if (items.length === 0) return "mixed";
  if (items.every((item) => item.status === "published")) return "published";
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.every((item) => POST_APPROVAL_STATUSES.has(item.status))) {
    if (items.some((item) => item.status === "scheduled")) return "scheduled";
    if (items.every((item) => item.status === "approved")) return "approved";
    return "mixed";
  }
  if (items.some((item) => canApproveContentItem(item))) return "needs_review";
  return "mixed";
}

function buildBatch(batchId: string, items: ContentBatchItem[], isExplicitBatch: boolean): ContentBatch {
  const sorted = [...items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const createdAt = sorted[0]?.createdAt ?? new Date(0).toISOString();
  return {
    batchId,
    items: sorted.slice(0, BATCH_TARGET_SIZE),
    createdAt,
    reviewDeadline: readReviewDeadline(sorted[0]),
    isExplicitBatch,
  };
}

function heuristicBatchItems(items: ContentBatchItem[]): ContentBatchItem[] {
  const sorted = [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const candidate = sorted.filter((item) =>
    canApproveContentItem(item) || POST_APPROVAL_STATUSES.has(item.status) || item.status === "failed",
  );
  return candidate.slice(0, BATCH_TARGET_SIZE);
}

export function groupContentBatches(items: ContentBatchItem[]): ContentBatch[] {
  const explicit = new Map<string, ContentBatchItem[]>();
  const unbatched: ContentBatchItem[] = [];

  for (const item of items) {
    const batchId = readBatchId(item);
    if (batchId) {
      const list = explicit.get(batchId) ?? [];
      list.push(item);
      explicit.set(batchId, list);
    } else {
      unbatched.push(item);
    }
  }

  const batches = [...explicit.entries()].map(([batchId, batchItems]) => buildBatch(batchId, batchItems, true));
  const heuristicItems = heuristicBatchItems(unbatched);
  if (heuristicItems.length > 0) {
    batches.push(buildBatch(`review-window-${heuristicItems[0]?.createdAt ?? "latest"}`, heuristicItems, false));
  }

  return batches.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function selectPrimaryBatch(batches: ContentBatch[]): ContentBatch | null {
  if (batches.length === 0) return null;
  return batches.reduce((best, current) => {
    const bestScore = best.items.filter((item) => item.status === "needs_review").length;
    const currentScore = current.items.filter((item) => item.status === "needs_review").length;
    if (currentScore > bestScore) return current;
    if (currentScore === bestScore && new Date(current.createdAt).getTime() > new Date(best.createdAt).getTime()) return current;
    return best;
  });
}

export function approveAllCandidates(items: ContentBatchItem[]): ContentBatchItem[] {
  return items.filter(canApproveContentItem);
}

export function approveAllWouldChange(items: ContentBatchItem[]): boolean {
  return approveAllCandidates(items).length > 0;
}

export const REVIEW_REMINDER_DAY = 9;

export type DayNineReminder = {
  show: boolean;
  batchId: string;
  cycleDay: number;
  reviewableCount: number;
};

export function buildDayNineReminder(items: ContentBatchItem[], now = new Date()): DayNineReminder | null {
  const batch = selectPrimaryBatch(groupContentBatches(items));
  if (!batch) return null;
  const diffMs = now.getTime() - new Date(batch.createdAt).getTime();
  const cycleDay = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
  const reviewableCount = batch.items.filter((item) => REVIEWABLE_FOR_APPROVAL.has(item.status)).length;
  if (cycleDay < REVIEW_REMINDER_DAY || reviewableCount === 0) return null;
  return { show: true, batchId: batch.batchId, cycleDay, reviewableCount };
}

export type NextBatchReadyNotice = {
  show: boolean;
  batchId: string;
  reviewableCount: number;
  pendingMediaCount: number;
  realMediaCount: number;
};

export function buildNextBatchReadyNotice(items: ContentBatchItem[]): NextBatchReadyNotice | null {
  const batch = selectPrimaryBatch(groupContentBatches(items));
  if (!batch || !batch.isExplicitBatch || batch.items.length < BATCH_TARGET_SIZE) return null;
  const reviewable = batch.items.filter((item) => REVIEWABLE_FOR_APPROVAL.has(item.status));
  if (reviewable.length === 0) return null;
  const pendingMediaCount = batch.items.filter((item) => item.mediaSource === "pending" || !item.mediaAssetId).length;
  const realMediaCount = batch.items.filter((item) => item.mediaSource === "real" && item.mediaAssetId).length;
  return {
    show: true,
    batchId: batch.batchId,
    reviewableCount: reviewable.length,
    pendingMediaCount,
    realMediaCount,
  };
}
