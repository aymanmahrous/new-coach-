import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarDays, ContactRound, Inbox, Library, Workflow } from "lucide-react";
import { z } from "zod";
import type { ContentBatchItem } from "./content-batch";
import { summarizePipeline } from "./content-growth";
import { buildDayNineReminder, buildNextBatchReadyNotice } from "./content-batch";
import { useLanguage } from "./i18n";
import type { Language } from "./i18n";
import "./today-view.css";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type StaffRole = "super_admin" | "admin" | "reception" | "coach" | "content_manager";
type TodaySession = { accessToken: string; role: StaffRole };
const AUTOMATION_STATUS_ROLES = new Set<StaffRole>(["super_admin", "admin", "content_manager"]);
type NavigateSection = "inbox" | "crm" | "planner" | "content" | "automations" | "analytics" | "archive";
type JobStatus = "queued" | "processing" | "completed" | "failed" | "retrying" | "dead";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const BookingSchema = z.object({
  id: z.string().uuid(), full_name: z.string(), status: z.enum(["pending", "contacted", "confirmed", "declined", "cancelled"]),
  created_at: z.string(), updated_at: z.string().nullable().optional(),
}).passthrough();
const LeadSchema = z.object({
  id: z.string().uuid(), name: z.string(), stage: z.enum(["new", "contacted", "qualified", "booking_intent", "booked", "follow_up", "lost", "customer"]),
  humanRequired: z.boolean(), nextFollowUpAt: z.string().nullable().optional(),
}).passthrough();
const ConversationSchema = z.object({
  id: z.string().uuid(), leadName: z.string(),
  mode: z.enum(["ai_active", "human_required", "human_takeover", "paused"]),
  humanRequired: z.boolean(),
}).passthrough();
const ContentItemSchema = z.object({
  id: z.string().uuid(), topic: z.string(), createdAt: z.string(),
  status: z.enum(["idea", "draft", "generated", "needs_review", "approved", "scheduled", "published", "failed", "cancelled"]),
}).passthrough();
const FollowUpJobSchema = z.object({
  id: z.string().uuid(), leadName: z.string(), scheduledFor: z.string(), status: z.enum(["queued", "processing", "completed", "failed", "retrying", "dead"]),
}).passthrough();
const BackgroundJobSchema = z.object({
  id: z.string().uuid(), jobType: z.string(), status: z.enum(["queued", "processing", "completed", "failed", "retrying", "dead"]),
}).passthrough();
const OperationsQueueSchema = z.object({
  followUps: z.array(FollowUpJobSchema), backgroundJobs: z.array(BackgroundJobSchema), generatedAt: z.string(),
}).passthrough();

const todayCopy = {
  ar: {
    boundaryTitle: "إجراءات اليوم",
    boundaryBody: "افتح العنصر المطلوب مباشرة من Inbox أو العملاء أو الحجوزات أو المصنع أو التشغيل.",
    snapshotLabel: "اللقطة",
    loadError: "تعذر تحميل لوحة اليوم بأمان.",
    attentionEyebrow: "أولوية التنفيذ",
    attentionTitle: "يتطلب انتباهًا",
    allClear: "لا توجد عناصر تتطلب انتباهًا فوريًا في آخر لقطة.",
    attentionHumanConversations: "محادثات تتطلب تدخلًا بشريًا",
    attentionBookingActions: "إجراءات حجز معلّقة",
    attentionAutomation: "فشل / إعادة محاولة فعالة في الأتمتة",
    attentionCrmFollowUps: "متابعات CRM",
    attentionContentReview: "محتوى بانتظار المراجعة",
    numbersEyebrow: "أرقام أساسية",
    numbersTitle: "أرقام اليوم الأساسية",
    leadsLabel: "العملاء المحتملون",
    leadsHint: "إجمالي مسار CRM",
    bookingsLabel: "طلبات الحجز",
    bookingsHint: "طلبات أُنشئت اليوم",
    confirmedLabel: "حجوزات مؤكدة",
    confirmedHint: "مؤكدة اليوم",
    followUpsLabel: "المتابعات",
    followUpsHint: "CRM + طابور المتابعة",
    contentReviewLabel: "مراجعة المحتوى",
    contentReviewHint: "مسودة / مولّد / بانتظار المراجعة",
    contentPipelineEyebrow: "عمليات المحتوى",
    contentPipelineTitle: "مسار محتوى السباحة",
    contentApproved: "معتمد",
    contentScheduled: "مجدول",
    contentPublished: "منشور",
    contentFailed: "فشل",
    dayNineToday: "تذكير مراجعة اليوم 9 نشط — افتح Content Growth Hub لاعتماد الدفعة.",
    batchReadyToday: "دفعة الـ10 أيام التالية جاهزة للمراجعة.",
    openGrowthHubButton: "فتح Content Growth Hub",
    healthEyebrow: "صحة التشغيل",
    healthTitle: "صحة النظام",
    automationSnapshotTitle: "لقطة حالة الأتمتة",
    automationRecordsLabel: "سجل",
    terminalJobsNote: "السجلات المنتهية/المؤرشفة: لا تحتاج إجراءً الآن.",
    actionsEyebrow: "تنقل",
    actionsTitle: "إجراءات سريعة",
    refreshButton: "تحديث البيانات",
    refreshingButton: "جارٍ التحديث…",
  },
  en: {
    boundaryTitle: "Today actions",
    boundaryBody: "Open the relevant item directly in Inbox, customers, bookings, Factory or Operations.",
    snapshotLabel: "Snapshot",
    loadError: "Today dashboard could not be loaded securely.",
    attentionEyebrow: "Priority queue",
    attentionTitle: "Requires attention",
    allClear: "Nothing flagged for immediate attention in the latest snapshot.",
    attentionHumanConversations: "Human-required conversations",
    attentionBookingActions: "Booking actions pending",
    attentionAutomation: "Active automation failures / retries",
    attentionCrmFollowUps: "CRM follow-ups",
    attentionContentReview: "Content requiring review",
    numbersEyebrow: "Key counts",
    numbersTitle: "Today's key numbers",
    leadsLabel: "Leads",
    leadsHint: "CRM pipeline total",
    bookingsLabel: "Bookings",
    bookingsHint: "Requests created today",
    confirmedLabel: "Confirmed bookings",
    confirmedHint: "Confirmed today",
    followUpsLabel: "Follow-ups",
    followUpsHint: "Queued CRM + jobs",
    contentReviewLabel: "Content review",
    contentReviewHint: "Draft / generated / needs review",
    contentPipelineEyebrow: "Content operations",
    contentPipelineTitle: "Swimming content pipeline",
    contentApproved: "Approved",
    contentScheduled: "Scheduled",
    contentPublished: "Published",
    contentFailed: "Failed",
    dayNineToday: "Day-9 review reminder active — open Content Growth Hub to approve the batch.",
    batchReadyToday: "Next 10-Day Batch Ready for Review.",
    openGrowthHubButton: "Open Content Growth Hub",
    healthEyebrow: "Operations health",
    healthTitle: "System health",
    automationSnapshotTitle: "Automation status snapshot",
    automationRecordsLabel: "records",
    terminalJobsNote: "Closed/archived records are historical and need no action now.",
    actionsEyebrow: "Navigation",
    actionsTitle: "Quick actions",
    refreshButton: "Refresh data",
    refreshingButton: "Refreshing…",
  },
} as const;

const jobStatusLabels: Record<Language, Record<JobStatus, string>> = {
  ar: { queued: "في الانتظار", processing: "قيد التنفيذ", completed: "مكتملة", failed: "فشلت", retrying: "إعادة محاولة", dead: "منتهية/مؤرشفة" },
  en: { queued: "Queued", processing: "Processing", completed: "Completed", failed: "Failed", retrying: "Retrying", dead: "Closed/archived" },
};

function rpcHeaders(session: TodaySession) {
  return { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function callRpc(session: TodaySession, rpcName: string, signal?: AbortSignal): Promise<JsonValue> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: "POST", headers: rpcHeaders(session), body: "{}", signal,
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (response.status === 403) throw new Error("STAFF_ACCESS_DENIED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return (await response.json()) as JsonValue;
}

function formatDateTime(language: Language, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "ar" ? "ar-AE" : "en-AE");
}

function isSameLocalDay(value: string, reference: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}

function isDueNow(value: string | null | undefined, now: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

function quickActionIcon(section: NavigateSection) {
  if (section === "inbox") return Inbox;
  if (section === "crm") return ContactRound;
  if (section === "planner") return CalendarDays;
  if (section === "content") return Bot;
  if (section === "automations") return Workflow;
  if (section === "analytics") return BarChart3;
  return Library;
}

export default function TodayOperationsView({
  session,
  onNavigate,
  onSessionExpired,
}: {
  session: TodaySession;
  onNavigate: (section: NavigateSection) => void;
  onSessionExpired: () => void;
}) {
  const { language, t } = useLanguage();
  const copy = todayCopy[language];
  const nav = t("nav");
  const common = t("common");
  const statusLabels = jobStatusLabels[language];
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState("");
  const [snapshotAt, setSnapshotAt] = useState("");
  const [inbox, setInbox] = useState<z.infer<typeof ConversationSchema>[]>([]);
  const [bookings, setBookings] = useState<z.infer<typeof BookingSchema>[]>([]);
  const [leads, setLeads] = useState<z.infer<typeof LeadSchema>[]>([]);
  const [contentItems, setContentItems] = useState<z.infer<typeof ContentItemSchema>[]>([]);
  const [operations, setOperations] = useState<z.infer<typeof OperationsQueueSchema> | null>(null);
  const [automationStatus, setAutomationStatus] = useState<JsonValue>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus((current) => current === "ready" ? current : "loading");
    setRefreshing(true);
    setError("");
    const automationPromise = AUTOMATION_STATUS_ROLES.has(session.role)
      ? callRpc(session, "get_staff_content_automation_status", controller.signal)
      : Promise.resolve(null);
    Promise.all([
      callRpc(session, "get_staff_inbox", controller.signal),
      callRpc(session, "get_staff_bookings", controller.signal),
      callRpc(session, "get_staff_crm_leads", controller.signal),
      callRpc(session, "get_staff_content_items", controller.signal),
      callRpc(session, "get_staff_operations_queue", controller.signal),
      automationPromise,
    ]).then(([inboxRaw, bookingsRaw, leadsRaw, contentRaw, operationsRaw, automationRaw]) => {
      const inboxParsed = z.array(ConversationSchema).safeParse(inboxRaw);
      const bookingsParsed = z.array(BookingSchema).safeParse(bookingsRaw);
      const leadsParsed = z.array(LeadSchema).safeParse(leadsRaw);
      const contentParsed = z.array(ContentItemSchema).safeParse(contentRaw);
      const operationsParsed = OperationsQueueSchema.safeParse(operationsRaw);
      if (!inboxParsed.success || !bookingsParsed.success || !leadsParsed.success || !contentParsed.success || !operationsParsed.success) {
        throw new Error("INVALID_FORMAT");
      }
      setInbox(inboxParsed.data);
      setBookings(bookingsParsed.data);
      setLeads(leadsParsed.data);
      setContentItems(contentParsed.data);
      setOperations(operationsParsed.data);
      setAutomationStatus(automationRaw);
      setSnapshotAt(operationsParsed.data.generatedAt);
      setStatus("ready");
      setRefreshing(false);
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const message = cause instanceof Error ? cause.message : "LOAD_FAILED";
      if (message === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setError(copy.loadError);
      setStatus("error");
      setRefreshing(false);
    });
    return () => controller.abort();
  }, [copy.loadError, onSessionExpired, refreshToken, session]);

  const now = useMemo(() => new Date(), [status]);
  const nowMs = now.getTime();

  const metrics = useMemo(() => {
    const reviewContent = contentItems.filter((item) => ["needs_review", "generated", "draft"].includes(item.status));
    const pipeline = summarizePipeline(contentItems as ContentBatchItem[]);
    const dayNine = buildDayNineReminder(contentItems as ContentBatchItem[]);
    const batchReady = buildNextBatchReadyNotice(contentItems as ContentBatchItem[]);
    const pendingBookings = bookings.filter((booking) => ["pending", "contacted"].includes(booking.status));
    const humanConversations = inbox.filter((conversation) => conversation.mode === "human_required" || conversation.humanRequired);
    const crmFollowUps = leads.filter((lead) => lead.stage === "follow_up" || lead.humanRequired || isDueNow(lead.nextFollowUpAt, nowMs));
    const followUpJobs = operations?.followUps.filter((job) => ["queued", "retrying", "processing"].includes(job.status)) ?? [];
    const automationIssues = operations?.backgroundJobs.filter((job) => ["failed", "retrying"].includes(job.status)) ?? [];
    const bookingsToday = bookings.filter((booking) => isSameLocalDay(booking.created_at, now));
    const confirmedToday = bookings.filter((booking) => booking.status === "confirmed" && isSameLocalDay(booking.updated_at ?? booking.created_at, now));

    return {
      reviewContent,
      pipeline,
      dayNine,
      batchReady,
      pendingBookings,
      humanConversations,
      crmFollowUps,
      followUpJobs,
      automationIssues,
      bookingsToday,
      confirmedToday,
    };
  }, [bookings, contentItems, inbox, leads, now, nowMs, operations]);

  const healthCounts = useMemo(() => {
    const jobs = [...(operations?.followUps ?? []), ...(operations?.backgroundJobs ?? [])];
    return jobs.reduce<Record<JobStatus, number>>((result, job) => {
      result[job.status] += 1;
      return result;
    }, { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0, dead: 0 });
  }, [operations]);

  const attentionItems = useMemo(() => ([
    { key: "humanConversations", count: metrics.humanConversations.length, label: copy.attentionHumanConversations, section: "inbox" as const },
    { key: "bookingActions", count: metrics.pendingBookings.length, label: copy.attentionBookingActions, section: "planner" as const },
    { key: "automationIssues", count: metrics.automationIssues.length + metrics.followUpJobs.filter((job) => ["failed", "retrying"].includes(job.status)).length, label: copy.attentionAutomation, section: "automations" as const },
    { key: "crmFollowUps", count: metrics.crmFollowUps.length, label: copy.attentionCrmFollowUps, section: "crm" as const },
    { key: "contentReview", count: metrics.reviewContent.length, label: copy.attentionContentReview, section: "content" as const },
  ]), [copy, metrics]);

  const quickActions: Array<{ section: NavigateSection; label: string }> = [
    { section: "inbox", label: nav.inbox },
    { section: "crm", label: nav.crm },
    { section: "planner", label: nav.planner },
    { section: "content", label: nav.content },
    { section: "automations", label: nav.automations },
    { section: "analytics", label: nav.analytics },
    { section: "archive", label: nav.archive },
  ];

  if (status === "loading") return <p className="muted" role="status">{common.loading}</p>;
  if (status === "error") return <div className="error-box" role="alert">{error}</div>;

  const totalAttention = attentionItems.reduce((sum, item) => sum + item.count, 0);

  return <div className="today-operations" aria-busy={false}>
    <div className="operations-boundary">
      <div>
        <strong>{copy.boundaryTitle}</strong>
        <p>{copy.boundaryBody}</p>
      </div>
      {snapshotAt && <span>{copy.snapshotLabel}: {formatDateTime(language, snapshotAt)}</span>}
    </div>

    {metrics.batchReady?.show && (
      <div className="today-day-nine-banner batch-ready-banner" role="status">
        <strong>{copy.batchReadyToday}</strong>
        <button type="button" className="today-quick-action" onClick={() => onNavigate("content")}>{copy.openGrowthHubButton}</button>
      </div>
    )}

    {metrics.dayNine?.show && (
      <div className="today-day-nine-banner" role="status">
        <strong>{copy.dayNineToday}</strong>
        <button type="button" className="today-quick-action" onClick={() => onNavigate("content")}>{copy.openGrowthHubButton}</button>
      </div>
    )}

    <section className="today-section">
      <header>
        <div><p>{copy.attentionEyebrow}</p><h3>{copy.attentionTitle}</h3></div>
        <button type="button" className="today-quick-action" onClick={() => setRefreshToken((value) => value + 1)} disabled={refreshing} aria-busy={refreshing}>
          {refreshing ? copy.refreshingButton : copy.refreshButton}
        </button>
      </header>
      {totalAttention === 0 ? <p className="muted">{copy.allClear}</p> : (
        <ul className="today-attention-list">
          {attentionItems.filter((item) => item.count > 0).map((item) => (
            <li key={item.key}>
              <button type="button" className="today-attention-item" onClick={() => onNavigate(item.section)}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <small>{language === "ar" ? "فتح الإجراء" : "Open action"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="today-section">
      <header><p>{copy.numbersEyebrow}</p><h3>{copy.numbersTitle}</h3></header>
        <div className="operations-summary today-numbers" aria-label={copy.numbersTitle}>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("crm")}><span>{copy.leadsLabel}</span><strong>{leads.length}</strong><small>{copy.leadsHint}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("planner")}><span>{copy.bookingsLabel}</span><strong>{metrics.bookingsToday.length}</strong><small>{copy.bookingsHint}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("planner")}><span>{copy.confirmedLabel}</span><strong>{metrics.confirmedToday.length}</strong><small>{copy.confirmedHint}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("crm")}><span>{copy.followUpsLabel}</span><strong>{metrics.followUpJobs.length + metrics.crmFollowUps.length}</strong><small>{copy.followUpsHint}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("content")}><span>{copy.contentReviewLabel}</span><strong>{metrics.reviewContent.length}</strong><small>{copy.contentReviewHint}</small></button>
      </div>
    </section>

    <section className="today-section">
      <header><p>{copy.contentPipelineEyebrow}</p><h3>{copy.contentPipelineTitle}</h3></header>
      <div className="operations-summary today-numbers" aria-label={copy.contentPipelineTitle}>
        <button type="button" className="today-attention-item" onClick={() => onNavigate("content")}>
          <span>{copy.contentReviewLabel}</span><strong>{metrics.pipeline.needsReview}</strong>
        </button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("content")}><span>{copy.contentApproved}</span><strong>{metrics.pipeline.approved}</strong><small>{language === "ar" ? "فتح المحتوى" : "Open content"}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("content")}><span>{copy.contentScheduled}</span><strong>{metrics.pipeline.scheduled}</strong><small>{language === "ar" ? "فتح الجدولة" : "Open schedule"}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("content")}><span>{copy.contentPublished}</span><strong>{metrics.pipeline.published}</strong><small>{language === "ar" ? "فتح النتائج" : "Open results"}</small></button>
        <button type="button" className="summary-alert today-summary-action" onClick={() => onNavigate("content")}><span>{copy.contentFailed}</span><strong>{metrics.pipeline.failed}</strong><small>{language === "ar" ? "فتح الفشل" : "Open failures"}</small></button>
      </div>
    </section>

    <section className="today-section">
      <header><p>{copy.healthEyebrow}</p><h3>{copy.healthTitle}</h3></header>
      <div className="status-grid today-health">
        {(Object.keys(statusLabels) as JobStatus[]).map((jobStatus) => (
          <button type="button" className="summary-alert today-summary-action" key={jobStatus} onClick={() => onNavigate("automations")}><span>{statusLabels[jobStatus]}</span><strong>{healthCounts[jobStatus]}</strong><small>{language === "ar" ? "فتح الأتمتة" : "Open automation"}</small></button>
        ))}
      </div>
      {healthCounts.dead > 0 && <p className="today-automation-note">{copy.terminalJobsNote} ({healthCounts.dead})</p>}
      {automationStatus !== null && (
        <p className="today-automation-note">
          {copy.automationSnapshotTitle}: {Array.isArray(automationStatus) ? automationStatus.length : typeof automationStatus === "object" ? Object.keys(automationStatus).length : 1} {copy.automationRecordsLabel}
        </p>
      )}
    </section>

    <section className="today-section">
      <header><p>{copy.actionsEyebrow}</p><h3>{copy.actionsTitle}</h3></header>
      <div className="today-quick-actions">
        {quickActions.map(({ section, label }) => {
          const Icon = quickActionIcon(section);
          return <button type="button" key={section} className="today-quick-action" onClick={() => onNavigate(section)}><Icon size={18} aria-hidden="true" />{label}</button>;
        })}
      </div>
    </section>
  </div>;
}
