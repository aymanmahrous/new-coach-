import { useMemo, useState } from "react";
import { z } from "zod";
import { useLanguage } from "./i18n";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Role = "super_admin" | "admin" | "reception" | "coach" | "content_manager";
type Session = { accessToken: string; displayName: string; role: Role };
type JobStatus = "queued" | "processing" | "completed" | "failed" | "retrying" | "dead";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const FollowUpJobSchema = z.object({ id: z.string().uuid(), leadId: z.string().uuid(), leadName: z.string(), conversationId: z.string().uuid().nullable(), attemptNumber: z.number().int().nonnegative(), scheduledFor: z.string(), status: z.enum(["queued", "processing", "completed", "failed", "retrying", "dead"]), stoppedReason: z.string().nullable(), createdAt: z.string() }).passthrough();
const BackgroundJobSchema = z.object({ id: z.string().uuid(), jobType: z.string(), status: z.enum(["queued", "processing", "completed", "failed", "retrying", "dead"]), attemptCount: z.number().int().nonnegative(), nextRetryAt: z.string().nullable(), lastError: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() }).passthrough();
const OperationsQueueSchema = z.object({ followUps: z.array(FollowUpJobSchema), backgroundJobs: z.array(BackgroundJobSchema), generatedAt: z.string() }).passthrough();
const JobCommandSchema = z.object({ success: z.boolean(), code: z.string().optional() }).passthrough();

async function callRpc(session: Session, rpcName: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, { method: "POST", headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (response.status === 403) throw new Error("STAFF_ACCESS_DENIED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return response.json();
}
async function runJobCommand(session: Session, rpcName: "retry_staff_publish_job" | "cancel_staff_background_job", jobId: string) {
  const result = JobCommandSchema.parse(await callRpc(session, rpcName, { p_job_id: jobId }));
  if (!result.success) throw new Error(result.code ?? "JOB_COMMAND_REJECTED");
}
function formatDate(language: "ar" | "en", value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "ar" ? "ar-AE" : "en-AE"); }
function bounded(value: string, maximum = 240) { const normalized = value.trim(); return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized; }
function isPast(value: string, reference: number) { const timestamp = new Date(value).getTime(); return Number.isFinite(timestamp) && timestamp < reference; }

export default function OperationsQueueView({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  const { language, t } = useLanguage();
  const copy = t("integrations");
  const statusLabels: Record<JobStatus, string> = language === "ar" ? { queued: "في الانتظار", processing: "قيد التنفيذ", completed: "مكتملة", failed: "فشلت", retrying: "إعادة محاولة", dead: "منتهية/مؤرشفة" } : { queued: "Queued", processing: "Processing", completed: "Completed", failed: "Failed", retrying: "Retrying", dead: "Closed/archived" };
  const parsed = useMemo(() => OperationsQueueSchema.safeParse(value), [value]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const canWrite = ["super_admin", "admin", "content_manager"].includes(session.role);
  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;
  const operations = parsed.data;
  const now = Date.now();
  const allJobs = [...operations.followUps, ...operations.backgroundJobs];
  const counts = allJobs.reduce<Record<JobStatus, number>>((result, job) => { result[job.status] += 1; return result; }, { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0, dead: 0 });
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  const matches = (status: JobStatus, fields: Array<string | null>) => (statusFilter === "all" || status === statusFilter) && (!normalizedQuery || fields.some((field) => field?.toLocaleLowerCase("ar").includes(normalizedQuery)));
  const followUps = operations.followUps.filter((job) => matches(job.status, [job.leadName, job.id, job.leadId, job.conversationId, job.stoppedReason]));
  const backgroundJobs = operations.backgroundJobs.filter((job) => matches(job.status, [job.jobType, job.id, job.lastError]));
  const attentionCount = counts.failed;
  const overdueFollowUps = operations.followUps.filter((job) => ["queued", "retrying"].includes(job.status) && isPast(job.scheduledFor, now)).length;
  async function command(job: z.infer<typeof BackgroundJobSchema>, action: "retry" | "cancel") {
    if (!canWrite || busyJobId) return;
    const title = job.jobType || (language === "ar" ? "المهمة" : "job");
    const message = action === "retry" ? (language === "ar" ? `إعادة محاولة «${title}»؟ سيتم التحقق من عدم وجود نشر مؤكد أو مهمة نشطة.` : `Retry "${title}"? The server verifies no confirmed receipt or active job.`) : (language === "ar" ? `إلغاء «${title}»؟ لن تُحذف المهمة وسيُسجل الإلغاء.` : `Cancel "${title}"? The job is retained and the cancellation is audited.`);
    if (!window.confirm(message)) return;
    setBusyJobId(job.id); setNotice("");
    try { await runJobCommand(session, action === "retry" ? "retry_staff_publish_job" : "cancel_staff_background_job", job.id); setNotice(action === "retry" ? (language === "ar" ? "تمت إعادة المحاولة بأمان وتسجيل العملية." : "Safe retry queued and recorded.") : (language === "ar" ? "تم إلغاء المهمة وتسجيل العملية." : "Job cancelled and recorded.")); onChanged(); }
    catch (cause) { const code = cause instanceof Error ? cause.message : "JOB_COMMAND_FAILED"; if (code === "SESSION_EXPIRED") { onSessionExpired(); return; } setNotice(language === "ar" ? `لم يُنفذ الإجراء بأمان: ${code}` : `Action was not applied safely: ${code}`); }
    finally { setBusyJobId(null); }
  }
  return <>
    <div className="operations-boundary"><div><strong>{copy.boundaryTitle}</strong><p>{language === "ar" ? "تعكس طوابير المتابعة والمهام الداخلية المسجلة في آخر لقطة، ولا تثبت اتصال مزود خارجي لحظيًا." : "Reflects internal queues from the latest snapshot; it does not prove a live external provider connection."}</p></div><span>{language === "ar" ? "المهام المنتهية/المؤرشفة للعرض فقط" : "Closed/archived jobs are view-only"}</span></div>
    {notice && <div className="notice-box" role="status" aria-live="polite">{notice}</div>}
    <div className="operations-summary" aria-label={language === "ar" ? "ملخص صحة العمليات" : "Operations health summary"}><button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}><span>{copy.totalRecords}</span><strong>{allJobs.length}</strong></button><button type="button" className={statusFilter === "processing" ? "active" : ""} onClick={() => setStatusFilter("processing")}><span>{copy.processing}</span><strong>{counts.processing}</strong></button><button type="button" className={statusFilter === "retrying" ? "active" : ""} onClick={() => setStatusFilter("retrying")}><span>{copy.retrying}</span><strong>{counts.retrying}</strong></button><button type="button" className={statusFilter === "failed" ? "active danger" : ""} onClick={() => setStatusFilter("failed")}><span>{copy.failedInspectable}</span><strong>{counts.failed}</strong></button><button type="button" className={attentionCount > 0 ? "summary-alert danger" : "summary-alert"} onClick={() => setStatusFilter("failed")}><span>{copy.attentionNeeded}</span><strong>{attentionCount}</strong><small>{language === "ar" ? "اضغط لعرض الأخطاء" : "Open failures"}</small></button><button type="button" className={overdueFollowUps > 0 ? "summary-alert warning" : "summary-alert"} onClick={() => setStatusFilter("retrying")}><span>{language === "ar" ? "متابعات متأخرة" : "Overdue follow-ups"}</span><strong>{overdueFollowUps}</strong><small>{language === "ar" ? "اضغط لعرض الطابور" : "Open queue"}</small></button></div>
    <div className="operations-toolbar"><label htmlFor="operations-search">{copy.searchLabel}<input id="operations-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label><label htmlFor="operations-status">{copy.statusLabel}<select id="operations-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as JobStatus | "all")}><option value="all">{copy.allStatuses}</option>{(Object.keys(statusLabels) as JobStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label></div>
    <div className="operations-columns"><section><header><div><p>{copy.followUpQueueEyebrow}</p><h3>{copy.followUpQueueTitle}</h3></div><span>{followUps.length} {t("common").of} {operations.followUps.length}</span></header>{followUps.length === 0 && <p className="muted">{copy.noFollowUps}</p>}<div className="operations-list">{followUps.map((job) => { const overdue = ["queued", "retrying"].includes(job.status) && isPast(job.scheduledFor, now); return <article key={job.id}><header><div><h4>{job.leadName}</h4><small>{copy.attemptLabel} {job.attemptNumber}</small></div><span className={`job-status job-${job.status}`}>{statusLabels[job.status]}</span></header><dl><div><dt>{copy.scheduledForLabel}</dt><dd>{formatDate(language, job.scheduledFor)}</dd></div><div><dt>{copy.conversationLabel}</dt><dd>{job.conversationId ?? t("common").unlinked}</dd></div><div><dt>{copy.createdLabel}</dt><dd>{formatDate(language, job.createdAt)}</dd></div></dl>{overdue && <p className="operation-warning">{copy.overdueWarning}</p>}{job.stoppedReason && <p className="operation-error"><strong>{copy.stoppedReasonLabel}</strong> {bounded(job.stoppedReason)}</p>}</article>; })}</div></section><section><header><div><p>{copy.backgroundJobsEyebrow}</p><h3>{copy.backgroundJobsTitle}</h3></div><span>{backgroundJobs.length} {t("common").of} {operations.backgroundJobs.length}</span></header>{backgroundJobs.length === 0 && <p className="muted">{copy.noBackgroundJobs}</p>}<div className="operations-list">{backgroundJobs.map((job) => <article key={job.id}><header><div><h4>{job.jobType || copy.unspecifiedType}</h4><small>{job.attemptCount} {copy.attemptsLabel}</small></div><span className={`job-status job-${job.status}`}>{statusLabels[job.status]}</span></header><dl><div><dt>{copy.lastUpdatedLabel}</dt><dd>{formatDate(language, job.updatedAt)}</dd></div><div><dt>{copy.nextRetryLabel}</dt><dd>{job.nextRetryAt ? formatDate(language, job.nextRetryAt) : copy.notScheduled}</dd></div><div><dt>{copy.createdLabel}</dt><dd>{formatDate(language, job.createdAt)}</dd></div></dl>{job.lastError && <p className="operation-error"><strong>{copy.lastErrorLabel}</strong> {bounded(job.lastError)}</p>}<div className="operations-actions">{canWrite && job.status === "failed" && <button type="button" disabled={busyJobId !== null} onClick={() => void command(job, "retry")}>{busyJobId === job.id ? (language === "ar" ? "جاري التحقق" : "Checking") : (language === "ar" ? "إعادة محاولة آمنة" : "Safe retry")}</button>}{canWrite && ["queued", "retrying"].includes(job.status) && <button type="button" className="danger" disabled={busyJobId !== null} onClick={() => void command(job, "cancel")}>{language === "ar" ? "إلغاء المهمة" : "Cancel job"}</button>}</div></article>)}</div></section></div><p className="operations-generated">{language === "ar" ? <>آخر لقطة من RPC: {formatDate(language, operations.generatedAt)} · حد المصدر 250 سجلًا لكل طابور.</> : <>Latest RPC snapshot: {formatDate(language, operations.generatedAt)} · source limit 250 records per queue.</>}</p>
  </>;
}
