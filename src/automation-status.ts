export type AutomationState = "queued" | "processing" | "completed" | "failed" | "retrying" | "cancelled" | "dead" | "unknown";

export type AutomationAttention = {
  id: string;
  title: string;
  detail: string;
  action: "open_queue" | "open_content";
};

export type AutomationSnapshot = {
  recordCount: number;
  states: Record<AutomationState, number>;
  currentBatch: {
    id: string | null;
    state: AutomationState;
    itemCount: number | null;
    provider: string | null;
    createdAt: string | null;
  } | null;
  execution: {
    lastRun: string | null;
    nextRun: string | null;
    lastError: string | null;
    attempt: number | null;
  };
  publishingReadiness: string | null;
  attention: AutomationAttention[];
  sourceAvailable: boolean;
};

const STATUS_VALUES = new Set<AutomationState>(["queued", "processing", "completed", "failed", "retrying", "cancelled", "dead"]);
const STATE_KEYS = ["status", "state", "job_status", "execution_status", "batch_status"];
const BATCH_KEYS = ["batch_id", "batchid", "content_batch_id", "current_batch_id", "id"];
const COUNT_KEYS = ["item_count", "itemcount", "total_items", "totalitems", "count", "size"];
const PROVIDER_KEYS = ["provider", "provider_name", "provider_external_id", "providerexternalid"];
const CREATED_KEYS = ["created_at", "createdat", "started_at", "startedat"];
const LAST_RUN_KEYS = ["last_run_at", "last_run", "lastrunat", "completed_at", "updated_at"];
const NEXT_RUN_KEYS = ["next_run_at", "next_run", "nextrunat", "scheduled_for", "scheduledfor"];
const ERROR_KEYS = ["last_error", "error", "failure_reason", "failure_reason_text", "stopped_reason", "stoppedreason"];
const READINESS_KEYS = ["publishing_readiness", "publishingready", "publishing_ready", "readiness", "ready_for_publishing"];

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(record);
  for (const key of keys) {
    const match = entries.find(([rawKey]) => normalizeKey(rawKey) === normalizeKey(key));
    if (match && match[1] !== null && match[1] !== undefined && String(match[1]).trim()) return match[1];
  }
  return null;
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function stateValue(value: unknown): AutomationState {
  const normalized = textValue(value)?.toLowerCase().replace(/[-\s]/g, "_");
  return normalized && STATUS_VALUES.has(normalized as AutomationState) ? normalized as AutomationState : "unknown";
}

function collectRecords(value: unknown, records: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value === null || value === undefined) return records;
  const record = asRecord(value);
  if (record) {
    records.push(record);
    Object.values(record).forEach((child) => collectRecords(child, records, depth + 1));
  } else if (Array.isArray(value)) {
    value.forEach((child) => collectRecords(child, records, depth + 1));
  }
  return records;
}

function isBatchRecord(record: Record<string, unknown>) {
  return Boolean(firstValue(record, ["batch_id", "batchId", "content_batch_id", "current_batch_id"]));
}

function toCount(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeAutomationStatus(value: unknown): AutomationSnapshot {
  const records = collectRecords(value);
  const states: Record<AutomationState, number> = { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0, cancelled: 0, dead: 0, unknown: 0 };
  let currentBatch: AutomationSnapshot["currentBatch"] = null;
  let lastError: string | null = null;
  let lastRun: string | null = null;
  let nextRun: string | null = null;
  let attempt: number | null = null;
  let publishingReadiness: string | null = null;
  const attention: AutomationAttention[] = [];

  records.forEach((record, index) => {
    const state = stateValue(firstValue(record, STATE_KEYS));
    states[state] += 1;
    const error = textValue(firstValue(record, ERROR_KEYS));
    if (error && !lastError) lastError = error;
    const recordLastRun = textValue(firstValue(record, LAST_RUN_KEYS));
    const recordNextRun = textValue(firstValue(record, NEXT_RUN_KEYS));
    if (recordLastRun && !lastRun) lastRun = recordLastRun;
    if (recordNextRun && !nextRun) nextRun = recordNextRun;
    const recordAttempt = toCount(firstValue(record, ["attempt", "attempt_count", "attempt_number"]));
    if (recordAttempt !== null && attempt === null) attempt = recordAttempt;
    const readiness = textValue(firstValue(record, READINESS_KEYS));
    if (readiness && !publishingReadiness) publishingReadiness = readiness;

    if (isBatchRecord(record) && !currentBatch) {
      currentBatch = {
        id: textValue(firstValue(record, BATCH_KEYS)),
        state,
        itemCount: toCount(firstValue(record, COUNT_KEYS)),
        provider: textValue(firstValue(record, PROVIDER_KEYS)),
        createdAt: textValue(firstValue(record, CREATED_KEYS)),
      };
    }

    const activeIssue = ["failed", "retrying"].includes(state)
      || (Boolean(error) && !["completed", "dead", "cancelled"].includes(state));
    if (activeIssue) {
      attention.push({
        id: textValue(firstValue(record, ["id", "job_id", "batch_id"])) ?? `record-${index + 1}`,
        title: textValue(firstValue(record, ["job_type", "name", "operation", "type"])) ?? "Recorded automation issue",
        detail: error ?? `Recorded state: ${state}`,
        action: isBatchRecord(record) ? "open_content" : "open_queue",
      });
    }
  });

  return {
    recordCount: records.length,
    states,
    currentBatch,
    execution: { lastRun, nextRun, lastError, attempt },
    publishingReadiness,
    attention: attention.slice(0, 8),
    sourceAvailable: value !== null && value !== undefined,
  };
}

export function automationStateLabel(state: AutomationState, language: "ar" | "en") {
  const labels = language === "ar"
    ? { queued: "في الانتظار", processing: "قيد التنفيذ", completed: "مكتملة", failed: "فشلت", retrying: "إعادة محاولة", cancelled: "ملغاة", dead: "منتهية/مؤرشفة", unknown: "غير معروفة" }
    : { queued: "Queued", processing: "Processing", completed: "Completed", failed: "Failed", retrying: "Retrying", cancelled: "Cancelled", dead: "Closed/archived", unknown: "Unknown" };
  return labels[state];
}

export function automationAttentionLabel(action: AutomationAttention["action"], language: "ar" | "en") {
  return action === "open_content"
    ? (language === "ar" ? "فتح المحتوى" : "Open content")
    : (language === "ar" ? "فتح طابور العمليات" : "Open operations queue");
}

export function formatAutomationValue(value: string | null, language: "ar" | "en") {
  if (!value) return language === "ar" ? "غير متاح في آخر لقطة" : "Not available in latest snapshot";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "ar" ? "ar-AE" : "en-AE");
}

export function countActiveAutomationStates(snapshot: AutomationSnapshot) {
  return snapshot.states.queued + snapshot.states.processing + snapshot.states.retrying;
}
