import { Fragment, FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Bot, CalendarDays, ContactRound, Inbox, LayoutDashboard, Library, LogOut, Settings2, ShieldAlert, Workflow } from "lucide-react";
import { z } from "zod";
import { canApproveContentItem, sharedDatabaseBatchId, type ContentBatchItem } from "./content-batch";
import { appendChangeRequest, buildChangeRequestNote, type ChangeRequestKind } from "./content-growth";
import { formatLocalDateTimeInput } from "./date-utils";
import { LanguageProvider, useLanguage } from "./i18n";
import type { Language } from "./i18n";
import { registerServiceWorker } from "./push";
import "./styles.css";
import "./bookings.css";
import "./content-studio.css";
import "./analytics.css";
import "./integrations.css";
import "./system-polish.css";

const MediaLibraryView = lazy(() => import("./media-library-view"));
const TodayView = lazy(() => import("./today-view"));
const ControlTowerV2 = lazy(() => import("./control-tower-v2"));
const ContentGrowthHub = lazy(() => import("./content-growth-hub"));
const M = lazy(() => import("./massive-archive-view"));
const CoachBrain = lazy(() => import("./coach-brain"));
const RealProductFoundation = lazy(() => import("./real-product-foundation"));
const C360 = lazy(() => import("./customer-360-panel"));
const OperationsQueueView = lazy(() => import("./operations-queue-view"));
const IntegrationsCenter = lazy(() => import("./integrations-center"));
const AutomationsView = lazy(() => import("./automations-view"));
const MarketingCompanyView = lazy(() => import("./marketing-company-view"));

const sections = [
  ["dashboard", LayoutDashboard, "get_staff_command_center"],
  ["today", CalendarDays, "x"],
  ["command", Bot, "x"],
  ["inbox", Inbox, "get_staff_inbox"],
  ["crm", ContactRound, "get_staff_crm_leads"],
  ["automations", Workflow, "get_staff_content_automation_status"],
  ["content", Bot, "get_staff_content_items"],
  ["planner", CalendarDays, "get_staff_bookings"],
  ["media", Library, "get_staff_media_assets"],
  ["archive", Library, "x"],
  ["analytics", BarChart3, "get_staff_growth_analytics"],
  ["integrations", Settings2, "get_staff_operations_queue"],
  ["connections", Settings2, "get_staff_integrations"],
  ["radar", ShieldAlert, "get_staff_radar_opportunities"],
  ["brain", Bot, "x"],
  ["workspace", Library, "x"],
] as const;

type SectionId = (typeof sections)[number][0];
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Role = "super_admin" | "admin" | "reception" | "coach" | "content_manager";
type Session = { accessToken: string; displayName: string; role: Role };
type RadarPriority = "HOT" | "WARM" | "LOW";
type RadarStatus = "NEW" | "REVIEWED" | "ACTIONED" | "DISMISSED"
  | "CONTACTED" | "CUSTOMER_REPLIED" | "BOOKING_REQUEST" | "BOOKED" | "PAID_CUSTOMER"
  | "NOT_RELEVANT" | "UNREACHABLE" | "LOST";
type BookingStatus = "pending" | "contacted" | "confirmed" | "declined" | "cancelled";
type LeadStage = "new" | "contacted" | "qualified" | "booking_intent" | "booked" | "follow_up" | "lost" | "customer";
type ConversationMode = "ai_active" | "human_required" | "human_takeover" | "paused";
type ContentStatus = "idea" | "draft" | "generated" | "needs_review" | "approved" | "scheduled" | "published" | "failed" | "cancelled";
type ContentFactoryTab = "overview" | "strategy" | "factory" | "content" | "designs" | "reels" | "campaigns" | "review" | "connections";
type ContentAction = "approve" | "return_to_review" | "schedule" | "unschedule";
type MediaAssetType = "image" | "video" | "logo" | "other";
type MediaSource = "upload" | "ai_generated" | "external";
type JobStatus = "queued" | "processing" | "completed" | "failed" | "retrying" | "dead";

// `command` is a historical URL alias. ControlTowerV2 is the single owner decision gateway.
function normalizeOwnerSection(section: SectionId): SectionId {
  return section === "command" ? "dashboard" : section;
}

function sectionFromLocation(): SectionId {
  const requested = new URLSearchParams(window.location.search).get("section") as SectionId | null;
  return requested && sections.some(([id]) => id === requested) ? normalizeOwnerSection(requested) : "dashboard";
}

function sectionUrl(section: SectionId) {
  const url = new URL(window.location.href);
  url.searchParams.set("section", section);
  return `${url.pathname}${url.search}${url.hash}`;
}

const ProfileSchema = z.object({ display_name: z.string().min(1), role: z.enum(["super_admin", "admin", "reception", "coach", "content_manager"]), active: z.literal(true) });
const BookingSchema = z.object({
  id: z.string().uuid(), full_name: z.string(), phone: z.string().nullable().optional(), normalized_phone: z.string().nullable().optional(),
  gender: z.string().nullable().optional(), category: z.string().nullable().optional(), location: z.string().nullable().optional(), other_location: z.string().nullable().optional(),
  swam_before: z.boolean().nullable().optional(), fear_of_water: z.boolean().nullable().optional(), training_type: z.string().nullable().optional(),
  requested_date: z.string().nullable().optional(), requested_time: z.string().nullable().optional(),
  status: z.enum(["pending", "contacted", "confirmed", "declined", "cancelled"]), created_at: z.string(), updated_at: z.string().nullable().optional(),
}).passthrough();
const LeadSchema = z.object({
  id: z.string().uuid(), name: z.string(), phone: z.string().nullable().optional(), channel: z.string().nullable().optional(),
  stage: z.enum(["new", "contacted", "qualified", "booking_intent", "booked", "follow_up", "lost", "customer"]),
  score: z.number().nullable().optional(), language: z.string().nullable().optional(), intent: z.string().nullable().optional(),
  fearOfWater: z.boolean().nullable().optional(), lastActivityAt: z.string().nullable().optional(), nextFollowUpAt: z.string().nullable().optional(),
  humanRequired: z.boolean(), doNotContact: z.boolean(),
}).passthrough();
const BookingUpdateSchema = z.object({ success: z.boolean(), code: z.string().optional(), bookingRequestId: z.string().uuid().optional(), status: z.enum(["pending", "contacted", "confirmed", "declined", "cancelled"]).optional() });
const LeadUpdateSchema = z.object({
  success: z.boolean(), code: z.string().optional(), leadId: z.string().uuid().optional(),
  stage: z.enum(["new", "contacted", "qualified", "booking_intent", "booked", "follow_up", "lost", "customer"]).optional(),
  humanRequired: z.boolean().optional(), doNotContact: z.boolean().optional(), nextFollowUpAt: z.string().nullable().optional(),
  followUpAttempt: z.number().nullable().optional(), updatedAt: z.string().optional(),
});
const RadarOpportunitySchema = z.object({
  id: z.string().uuid(), source: z.string(), sourceType: z.string(), sourceUrl: z.string().nullable().optional(),
  discoveredAt: z.string(), textExcerpt: z.string(), language: z.string(),
  locationHint: z.string().nullable().optional(), areaHint: z.string().nullable().optional(), serviceIntent: z.string().nullable().optional(),
  buyerIntentScore: z.number().int(), priority: z.enum(["HOT", "WARM", "LOW"]), reason: z.string().nullable().optional(),
  status: z.enum(["NEW", "REVIEWED", "ACTIONED", "DISMISSED", "CONTACTED", "CUSTOMER_REPLIED", "BOOKING_REQUEST", "BOOKED", "PAID_CUSTOMER", "NOT_RELEVANT", "UNREACHABLE", "LOST"]), duplicateCount: z.number().int(),
  recommendedAction: z.string().nullable().optional(),
}).passthrough();
const RadarStatusUpdateSchema = z.object({ success: z.boolean(), code: z.string().optional() });
const RadarSourcePerformanceSchema = z.object({
  source: z.string(), total: z.number().int(), qualified_leads: z.number().int(),
  booking_requests: z.number().int(), paid_customers: z.number().int(), conversion_rate_pct: z.number(),
}).passthrough();
const ConversationSchema = z.object({
  id: z.string().uuid(), leadId: z.string().uuid(), leadName: z.string(),
  channel: z.enum(["instagram", "facebook", "whatsapp", "website"]),
  mode: z.enum(["ai_active", "human_required", "human_takeover", "paused"]),
  unread: z.number().int().nonnegative(), lastMessage: z.string(), updatedAt: z.string(),
  leadScore: z.number().int(), intent: z.string(), humanRequired: z.boolean(),
  needsAttention: z.boolean().optional(), handoffReason: z.string().nullable().optional(),
}).passthrough();
const MessageSchema = z.object({
  id: z.string().uuid(), conversationId: z.string().uuid(), direction: z.string(),
  authorType: z.string(), body: z.string(), safetyClassification: z.string().nullable().optional(),
  createdAt: z.string(),
}).passthrough();
const ConversationModeUpdateSchema = z.object({
  success: z.boolean(), code: z.string().optional(), conversationId: z.string().uuid().optional(),
  mode: z.enum(["ai_active", "human_required", "human_takeover", "paused"]).optional(),
});
const StaffWhatsappSendSchema = z.object({
  success: z.boolean(), code: z.string().optional(), conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(), dryRun: z.boolean().optional(),
});
const ContentItemSchema = z.object({
  id: z.string().uuid(), scheduledFor: z.string().nullable(), platform: z.string(), contentType: z.string(),
  topic: z.string(), hook: z.string(), caption: z.string(), cta: z.string(), hashtags: z.array(z.string()),
  visualPrompt: z.string(), status: z.enum(["idea", "draft", "generated", "needs_review", "approved", "scheduled", "published", "failed", "cancelled"]),
  providerExternalId: z.string().nullable(), publishedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
}).passthrough();
const ContentMutationSchema = z.object({
  success: z.boolean(), code: z.string().optional(), contentItemId: z.string().uuid().optional(),
  status: z.enum(["idea", "draft", "generated", "needs_review", "approved", "scheduled", "published", "failed", "cancelled"]).optional(),
  scheduledFor: z.string().nullable().optional(), updatedAt: z.string().optional(),
});
const ContentBatchApprovalSchema = z.object({
  success: z.boolean(),
  code: z.string().optional(),
  batchId: z.string().uuid().optional(),
  approvedCount: z.number().int().nonnegative().optional(),
  alreadyApprovedCount: z.number().int().nonnegative().optional(),
  skippedCount: z.number().int().nonnegative().optional(),
}).passthrough();
const MediaAssetSchema = z.object({
  id: z.string().uuid(), createdBy: z.string().uuid(), contentItemId: z.string().uuid().nullable(),
  assetType: z.enum(["image", "video", "logo", "other"]), source: z.enum(["upload", "ai_generated", "external"]),
  storagePath: z.string().nullable(), provider: z.string().nullable(), providerJobId: z.string().nullable(),
  prompt: z.string().nullable(), metadata: z.record(z.unknown()), createdAt: z.string(),
}).passthrough();
const AnalyticsSchema = z.object({
  views: z.number().int().nonnegative(), dms: z.number().int().nonnegative(), qualifiedLeads: z.number().int().nonnegative(),
  bookingRequests: z.number().int().nonnegative(), publishedItems: z.number().int().nonnegative(), contentItems: z.number().int().nonnegative(),
  attributionReady: z.boolean(), note: z.string(),
}).passthrough();
const StoredSessionSchema = z.object({ accessToken: z.string().min(1) }).passthrough();

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const STAFF_TABLE = (import.meta.env.VITE_STAFF_PROFILE_TABLE ?? "staff_profiles").trim();
const PASSWORD_RESET_PATH = (import.meta.env.VITE_PASSWORD_RESET_PATH ?? "").trim();

const AUTH_MESSAGES = {
  CONFIGURATION_REQUIRED: "إعدادات الاتصال غير مكتملة أو غير آمنة. التطبيق مغلق بأمان.\nConnection settings are incomplete or unsafe. The application is securely locked.",
  INVALID_LOGIN: "البريد الإلكتروني أو كلمة المرور غير صحيحة.\nThe email or password is incorrect.",
  STAFF_ACCESS_DENIED: "هذا الحساب غير مفعّل للوصول إلى لوحة التحكم.\nThis account is not active for Command Center access.",
  SERVICE_UNAVAILABLE: "تعذر الاتصال بالخدمة. تحقق من الإنترنت ثم حاول لاحقًا.\nUnable to reach the service. Check your connection and try again later.",
  LOGIN_FAILED: "تعذر تسجيل الدخول. حاول مرة أخرى.\nSign-in failed. Please try again.",
  RESET_SUCCESS: "إذا كان البريد مسجلاً، فستصلك رسالة لإعادة تعيين كلمة المرور.\nIf the email is registered, a password reset message will be sent.",
} as const;

function legacyKeyRole(key: string) {
  try {
    const encodedPayload = key.split(".")[1];
    if (!encodedPayload) return null;
    const normalized = encodedPayload.replaceAll("-", "+").replaceAll("_", "/").padEnd(encodedPayload.length + 3 & -4, "=");
    return z.object({ role: z.string() }).parse(JSON.parse(atob(normalized))).role;
  } catch { return null; }
}

function browserSafeApiKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  if (key.startsWith("sb_secret_")) return false;
  return legacyKeyRole(key) === "anon";
}

function configurationReady() {
  try {
    const url = new URL(SUPABASE_URL);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") && browserSafeApiKey(SUPABASE_PUBLIC_KEY) && STAFF_TABLE.length > 0;
  } catch { return false; }
}
function passwordResetRedirect() {
  if (!PASSWORD_RESET_PATH) return null;
  if (!PASSWORD_RESET_PATH.startsWith("/")) throw new Error("CONFIGURATION_REQUIRED");
  return new URL(PASSWORD_RESET_PATH, window.location.origin).toString();
}

function authErrorCode(cause: unknown) {
  return cause instanceof Error ? cause.message : "LOGIN_FAILED";
}

function authMessage(code: string) {
  if (code === "CONFIGURATION_REQUIRED") return AUTH_MESSAGES.CONFIGURATION_REQUIRED;
  if (code === "INVALID_LOGIN") return AUTH_MESSAGES.INVALID_LOGIN;
  if (code === "STAFF_ACCESS_DENIED") return AUTH_MESSAGES.STAFF_ACCESS_DENIED;
  if (code === "NETWORK_UNAVAILABLE" || code === "SERVICE_UNAVAILABLE" || code === "TOO_MANY_ATTEMPTS") return AUTH_MESSAGES.SERVICE_UNAVAILABLE;
  return AUTH_MESSAGES.LOGIN_FAILED;
}
function rpcHeaders(session: Session) { return { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }

async function loadStaffProfile(accessToken: string, userId: string, signal?: AbortSignal) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(STAFF_TABLE)}?id=eq.${encodeURIComponent(userId)}&select=display_name,role,active&limit=1`, {
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store", signal,
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error("PROFILE_CHECK_FAILED");
  const rows = z.array(ProfileSchema).parse(await response.json());
  if (rows.length !== 1) throw new Error("STAFF_ACCESS_DENIED");
  return { accessToken, displayName: rows[0].display_name, role: rows[0].role } satisfies Session;
}

async function signIn(email: string, password: string): Promise<Session> {
  if (!configurationReady()) throw new Error("CONFIGURATION_REQUIRED");
  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLIC_KEY }, body: JSON.stringify({ email, password }) });
  } catch {
    throw new Error("NETWORK_UNAVAILABLE");
  }
  if (authResponse.status === 429) throw new Error("TOO_MANY_ATTEMPTS");
  if (authResponse.status === 401 || authResponse.status === 403) throw new Error("INVALID_LOGIN");
  if (authResponse.status >= 500) throw new Error("SERVICE_UNAVAILABLE");
  if (!authResponse.ok) throw new Error("INVALID_LOGIN");
  const auth = z.object({ access_token: z.string(), user: z.object({ id: z.string().uuid() }) }).parse(await authResponse.json());
  return loadStaffProfile(auth.access_token, auth.user.id);
}

async function requestPasswordReset(email: string): Promise<void> {
  if (!configurationReady()) throw new Error("CONFIGURATION_REQUIRED");
  const redirectTo = passwordResetRedirect();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLIC_KEY },
      body: JSON.stringify({ email, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
    });
  } catch {
    throw new Error("NETWORK_UNAVAILABLE");
  }
  if (response.status === 429) throw new Error("TOO_MANY_ATTEMPTS");
  if (response.status === 401 || response.status === 403) throw new Error("SERVICE_UNAVAILABLE");
  if (response.status >= 500) throw new Error("SERVICE_UNAVAILABLE");
  if (!response.ok) throw new Error("LOGIN_FAILED");
}

async function restoreSession(accessToken: string, signal: AbortSignal): Promise<Session> {
  if (!configurationReady()) throw new Error("CONFIGURATION_REQUIRED");
  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store", signal,
  });
  if (!authResponse.ok) throw new Error("SESSION_EXPIRED");
  const user = z.object({ id: z.string().uuid() }).parse(await authResponse.json());
  return loadStaffProfile(accessToken, user.id, signal);
}

async function callRpc(session: Session, rpcName: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<JsonValue> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, { method: "POST", headers: rpcHeaders(session), body: JSON.stringify(body), signal });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (response.status === 403) throw new Error("STAFF_ACCESS_DENIED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return (await response.json()) as JsonValue;
}

async function updateBookingStatus(session: Session, bookingId: string, status: BookingStatus) {
  const result = BookingUpdateSchema.parse(await callRpc(session, "update_booking_request_status", { p_booking_request_id: bookingId, p_status: status }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function updateLeadWorkflow(session: Session, leadId: string, stage: LeadStage, humanRequired: boolean, doNotContact: boolean, nextFollowUpAt: string | null) {
  const result = LeadUpdateSchema.parse(await callRpc(session, "update_staff_lead_workflow", {
    p_lead_id: leadId, p_stage: stage, p_human_required: humanRequired, p_do_not_contact: doNotContact, p_next_follow_up_at: nextFollowUpAt,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function getConversationMessages(session: Session, conversationId: string, signal?: AbortSignal) {
  return z.array(MessageSchema).parse(await callRpc(session, "get_staff_conversation_messages", { p_conversation_id: conversationId }, signal));
}

async function setConversationMode(session: Session, conversationId: string, mode: ConversationMode) {
  const result = ConversationModeUpdateSchema.parse(await callRpc(session, "set_staff_conversation_mode", {
    p_conversation_id: conversationId, p_mode: mode,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function takeOverConversation(session: Session, conversationId: string) {
  const result = ConversationModeUpdateSchema.parse(await callRpc(session, "take_over_staff_conversation", {
    p_conversation_id: conversationId,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function returnConversationToAi(session: Session, conversationId: string) {
  const result = ConversationModeUpdateSchema.parse(await callRpc(session, "return_staff_conversation_to_ai", {
    p_conversation_id: conversationId,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function sendStaffWhatsappMessage(session: Session, conversationId: string, body: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-message`, {
    method: "POST",
    headers: rpcHeaders(session),
    body: JSON.stringify({ conversationId, body }),
  });
  const result = StaffWhatsappSendSchema.parse(await response.json());
  if (!response.ok || !result.success) throw new Error(result.code ?? `SEND_FAILED_${response.status}`);
  return result;
}

async function setRadarOpportunityStatus(session: Session, opportunityId: string, status: RadarStatus) {
  const result = RadarStatusUpdateSchema.parse(await callRpc(session, "set_staff_radar_opportunity_status", {
    p_opportunity_id: opportunityId, p_status: status,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function getRadarSourcePerformance(session: Session, signal?: AbortSignal) {
  return z.array(RadarSourcePerformanceSchema).parse(await callRpc(session, "get_staff_radar_source_performance", {}, signal));
}

async function updateContentItem(session: Session, contentItemId: string, fields: { topic: string; hook: string; caption: string; cta: string; hashtags: string[]; visualPrompt: string }) {
  const result = ContentMutationSchema.parse(await callRpc(session, "update_staff_content_item", {
    p_content_item_id: contentItemId, p_topic: fields.topic, p_hook: fields.hook, p_caption: fields.caption,
    p_cta: fields.cta, p_hashtags: fields.hashtags, p_visual_prompt: fields.visualPrompt,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function transitionContentItem(session: Session, contentItemId: string, action: ContentAction, scheduledFor: string | null = null) {
  const result = ContentMutationSchema.parse(await callRpc(session, "transition_staff_content_item", {
    p_content_item_id: contentItemId, p_action: action, p_scheduled_for: scheduledFor,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}

async function approveStaffContentBatch(session: Session, batchId: string) {
  const result = ContentBatchApprovalSchema.parse(await callRpc(session, "approve_staff_content_batch", {
    p_batch_id: batchId,
  }));
  if (!result.success) throw new Error(result.code ?? "UPDATE_REJECTED");
  return result;
}
function LanguageSwitcher({ onDark = false }: { onDark?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const labels = t("language");
  return <div className={onDark ? "language-switcher on-dark" : "language-switcher"} role="group" aria-label={labels.switchLabel}>
    <button type="button" className={language === "ar" ? "active" : ""} aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}>{labels.ar}</button>
    <button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>{labels.en}</button>
  </div>;
}

function Login({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const { language, t } = useLanguage();
  const copy = t("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResetError("");
    setResetNotice("");
    try {
      const session = await signIn(email.trim(), password);
      sessionStorage.setItem("relaxfix-command-session", JSON.stringify({ accessToken: session.accessToken }));
      onAuthenticated(session);
    } catch (cause) {
      setError(authMessage(authErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setResetBusy(true);
    setResetError("");
    setResetNotice("");
    try {
      await requestPasswordReset(email.trim());
      setResetNotice(AUTH_MESSAGES.RESET_SUCCESS);
    } catch (cause) {
      setResetError(authMessage(authErrorCode(cause)));
    } finally {
      setResetBusy(false);
    }
  }

  return <main className="login-page"><section className="login-card" aria-busy={busy || resetBusy}><div className="login-card-top"><div className="brand-mark"><ShieldAlert size={28} /></div><LanguageSwitcher /></div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="muted">{copy.subtitle}</p><form onSubmit={submit}><label>{copy.emailLabel}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>{copy.passwordLabel}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><button type="button" className="text-button forgot-password" disabled={busy || resetBusy} onClick={() => void forgotPassword()}>{language === "ar" ? <span lang="ar" dir="rtl">نسيت كلمة المرور؟</span> : <span lang="en" dir="ltr">Forgot password?</span>}</button>{resetNotice && <div className="notice-box" role="status">{resetNotice}</div>}{resetError && <div className="error-box" role="alert">{resetError}</div>}{error && <div className="error-box" role="alert">{error}</div>}<button disabled={busy || resetBusy}>{busy ? copy.submitting : copy.submit}</button></form><p className="security-note">{copy.securityNote}</p></section></main>;
}

const ID_LIKE_PATTERN = /^[0-9a-fA-F-]{16,}$/;

function DataLeaf({ value }: { value: JsonValue }) {
  const text = String(value ?? "—");
  if (typeof value === "string" && (ID_LIKE_PATTERN.test(value) || value.length > 40)) return <span className="id-text" title={text}>{text}</span>;
  return <span>{text}</span>;
}

function DataView({ value }: { value: JsonValue }) {
  const { t } = useLanguage();
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="muted">{t("common").noData}</p>;
    if (value.every((item) => item === null || typeof item !== "object")) return <div className="chip-list">{value.map((item, index) => <span className="chip" key={index}><DataLeaf value={item} /></span>)}</div>;
    return <div className="data-grid">{value.map((item, index) => <article className="data-card" key={index}><DataView value={item} /></article>)}</div>;
  }
  if (value && typeof value === "object") return <dl className="record">{Object.entries(value).map(([key, item]) => <Fragment key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof item === "object" && item !== null ? <DataView value={item} /> : <DataLeaf value={item} />}</dd></Fragment>)}</dl>;
  return <DataLeaf value={value} />;
}

const conversationModeLabels: Record<Language, Record<ConversationMode, string>> = {
  ar: { ai_active: "الذكاء الاصطناعي نشط", human_required: "مراجعة بشرية مطلوبة", human_takeover: "استلام بشري", paused: "متوقفة مؤقتًا" },
  en: { ai_active: "AI active", human_required: "Human review required", human_takeover: "Human takeover", paused: "Paused" },
};

type InboxConversation = z.infer<typeof ConversationSchema>;

function AIInboxView({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  useEffect(() => { void import("./ai-inbox.css"); }, []);
  const { language, t } = useLanguage();
  const copy = t("inbox");
  const modeLabels = conversationModeLabels[language];
  const parsed = useMemo(() => z.array(ConversationSchema).safeParse(value), [value]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<z.infer<typeof MessageSchema>[]>([]);
  const [messageStatus, setMessageStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [conversationPatches, setConversationPatches] = useState<Record<string, Partial<InboxConversation>>>({});
  const [inboxFilter, setInboxFilter] = useState<"all" | "attention" | "unread" | "ai_active">("all");
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const canWriteMode = ["super_admin", "admin", "reception", "coach"].includes(session.role);
  const canSendReply = ["super_admin", "admin", "reception", "content_manager"].includes(session.role);
  const conversations = parsed.success
    ? parsed.data.map((conversation) => ({ ...conversation, ...conversationPatches[conversation.id] }))
    : [];
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const priorityScore = (conversation: InboxConversation) => (conversation.needsAttention || conversation.humanRequired || conversation.mode === "human_required" || conversation.mode === "human_takeover" ? 3 : conversation.unread > 0 ? 2 : conversation.mode === "ai_active" ? 1 : 0);
  const prioritizedConversations = [...conversations].sort((left, right) => priorityScore(right) - priorityScore(left));
  const visibleConversations = prioritizedConversations.filter((conversation) => inboxFilter === "all" || (inboxFilter === "attention" ? priorityScore(conversation) === 3 : inboxFilter === "unread" ? conversation.unread > 0 : conversation.mode === "ai_active" && conversation.unread > 0));
  const attentionCount = conversations.filter((conversation) => conversation.needsAttention || conversation.humanRequired || conversation.mode === "human_required" || conversation.mode === "human_takeover").length;
  const unreadCount = conversations.reduce((total, conversation) => total + conversation.unread, 0);
  const aiActiveUnreadCount = conversations.filter((conversation) => conversation.mode === "ai_active" && conversation.unread > 0).length;

  useEffect(() => {
    if (!parsed.success) return;
    const firstActionable = conversations.find((conversation) => conversation.needsAttention || conversation.humanRequired || conversation.mode === "human_required" || conversation.mode === "human_takeover") ?? conversations[0];
    if (!selectedId && firstActionable) setSelectedId(firstActionable.id);
    if (selectedId && !conversations.some((conversation) => conversation.id === selectedId)) setSelectedId(firstActionable?.id ?? null);
  }, [conversations, parsed.success, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedId) { setMessages([]); setMessageStatus("idle"); return; }
    setMessageStatus("loading"); setMessages([]);
    getConversationMessages(session, selectedId, controller.signal).then((result) => {
      setMessages(result); setMessageStatus("ready");
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const code = cause instanceof Error ? cause.message : "LOAD_FAILED";
      if (code === "SESSION_EXPIRED") onSessionExpired();
      else setMessageStatus("error");
    });
    return () => controller.abort();
  }, [onSessionExpired, selectedId, session]);

  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;
  if (conversations.length === 0) return <p className="muted">{copy.noConversations}</p>;

  async function changeMode(conversation: z.infer<typeof ConversationSchema>, next: ConversationMode) {
    if (!canWriteMode || busyId || conversation.mode === next) return;
    const confirmMessage = language === "ar"
      ? `تأكيد تغيير وضع محادثة ${conversation.leadName} من «${modeLabels[conversation.mode]}» إلى «${modeLabels[next]}»؟ سيتم تسجيل العملية في Audit Log.`
      : `Change ${conversation.leadName}'s mode from "${modeLabels[conversation.mode]}" to "${modeLabels[next]}"? Recorded in the Audit Log.`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(conversation.id); setNotice("");
    try {
      await setConversationMode(session, conversation.id, next);
      setConversationPatches((current) => ({
        ...current,
        [conversation.id]: { ...current[conversation.id], mode: next },
      }));
      setNotice(language === "ar" ? "تم تحديث وضع المحادثة وتسجيل العملية بنجاح." : "Mode updated and recorded.");
    } catch (cause) {
      handleInboxError(cause);
    } finally { setBusyId(null); }
  }

  async function handleTakeOver(conversation: InboxConversation) {
    if (!canSendReply || busyId) return;
    const confirmMessage = language === "ar"
      ? `تأكيد استلام محادثة ${conversation.leadName} يدويًا؟ سيتوقف AI عن الرد حتى تعيده.`
      : `Take over ${conversation.leadName}'s conversation? AI replies pause until you return control.`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(conversation.id); setNotice("");
    try {
      const result = await takeOverConversation(session, conversation.id);
      setConversationPatches((current) => ({
        ...current,
        [conversation.id]: { ...current[conversation.id], mode: result.mode ?? "human_takeover" },
      }));
      setNotice(copy.takeOverSuccess);
    } catch (cause) {
      handleInboxError(cause);
    } finally { setBusyId(null); }
  }

  async function handleReturnToAi(conversation: InboxConversation) {
    if (!canSendReply || busyId) return;
    const confirmMessage = language === "ar"
      ? `تأكيد إعادة محادثة ${conversation.leadName} إلى AI؟`
      : `Return ${conversation.leadName}'s conversation to AI?`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(conversation.id); setNotice(""); setReplyBody("");
    try {
      const result = await returnConversationToAi(session, conversation.id);
      setConversationPatches((current) => ({
        ...current,
        [conversation.id]: { ...current[conversation.id], mode: result.mode ?? "ai_active" },
      }));
      setNotice(copy.returnToAiSuccess);
    } catch (cause) {
      handleInboxError(cause);
    } finally { setBusyId(null); }
  }

  async function handleSendReply(conversation: InboxConversation) {
    if (!canSendReply || busyId || !replyBody.trim()) return;
    const body = replyBody.trim();
    setBusyId(conversation.id); setNotice("");
    try {
      const result = await sendStaffWhatsappMessage(session, conversation.id, body);
      setReplyBody("");
      setNotice(result.dryRun ? copy.sendDryRunSuccess : copy.sendSuccess);
      setConversationPatches((current) => ({
        ...current,
        [conversation.id]: { ...current[conversation.id], lastMessage: body, mode: "human_takeover" },
      }));
      const refreshed = await getConversationMessages(session, conversation.id);
      setMessages(refreshed);
      setMessageStatus("ready");
    } catch (cause) {
      handleInboxError(cause);
    } finally { setBusyId(null); }
  }

  function handleInboxError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
    const messagesByCode: Record<string, string> = language === "ar" ? {
      INVALID_MODE: "وضع المحادثة المطلوب غير مسموح.",
      NOT_FOUND: "المحادثة لم تعد موجودة.",
      STAFF_ACCESS_DENIED: "ليست لديك صلاحية تنفيذ هذا التغيير.",
      HUMAN_MODE_REQUIRED: "يجب استلام المحادثة يدويًا قبل الإرسال.",
      CHANNEL_NOT_WHATSAPP: "الرد اليدوي متاح لمحادثات WhatsApp فقط.",
      INVALID_BODY: "نص الرسالة غير صالح.",
      SEND_FAILED: "تعذر إرسال الرسالة بأمان.",
    } : {
      INVALID_MODE: "That mode isn't allowed.",
      NOT_FOUND: "This conversation no longer exists.",
      STAFF_ACCESS_DENIED: "You don't have permission for this.",
      HUMAN_MODE_REQUIRED: "Take over the conversation before sending a reply.",
      CHANNEL_NOT_WHATSAPP: "Manual replies are WhatsApp-only.",
      INVALID_BODY: "The message text isn't valid.",
      SEND_FAILED: "The message could not be sent safely.",
    };
    if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
    setNotice(messagesByCode[code] ?? (language === "ar" ? "تعذر التحديث بأمان؛ لم يتم اعتماد أي تغيير غير مؤكد." : "Update failed safely; no change was made."));
  }

  return <>
    <div className="write-banner"><strong>{copy.writeBannerTitle}</strong><span>{copy.writeBannerSubtitle}</span></div>
    {notice && <div className="notice-box" aria-live="polite">{notice}</div>}
    <div className="inbox-workspace-head"><div><span className="inbox-eyebrow">{language === "ar" ? "صندوق المالك" : "OWNER INBOX"}</span><h3>{language === "ar" ? "ما يحتاج قرارك أولًا" : "Your decisions first"}</h3><p>{language === "ar" ? "رتّب النظام المحادثات حسب حاجتها لتدخلك، بينما تبقى المحادثات التي يتولاها AI في الخلفية." : "The system prioritizes conversations that need your decision while AI-managed conversations stay in the background."}</p></div><div className="inbox-filters" role="group" aria-label={language === "ar" ? "تصفية المحادثات" : "Conversation filters"}><button type="button" className={inboxFilter === "all" ? "active" : ""} onClick={() => setInboxFilter("all")}>{language === "ar" ? "الكل" : "All"} <b>{conversations.length}</b></button><button type="button" className={inboxFilter === "attention" ? "active" : ""} onClick={() => setInboxFilter("attention")}>{language === "ar" ? "يحتاج قرارك" : "Needs your decision"} <b>{attentionCount}</b></button><button type="button" className={inboxFilter === "ai_active" ? "active" : ""} onClick={() => setInboxFilter("ai_active")}>{language === "ar" ? "يتولاه AI" : "AI handling"} <b>{aiActiveUnreadCount}</b></button><button type="button" className={inboxFilter === "unread" ? "active" : ""} onClick={() => setInboxFilter("unread")}>{language === "ar" ? "غير مقروء" : "Unread"} <b>{unreadCount}</b></button></div></div>
    <div className={`inbox-layout ${mobileListOpen ? "mobile-list-open" : "mobile-conversation-open"}`}>
      <div className="conversation-list" aria-label={copy.listAriaLabel}>
        {visibleConversations.length === 0 && <p className="inbox-filter-empty">{language === "ar" ? "لا توجد محادثات في هذا التصنيف." : "No conversations in this filter."}</p>}
        {visibleConversations.map((conversation) => <button type="button" key={conversation.id} className={selectedId === conversation.id ? "selected" : ""} onClick={() => { setSelectedId(conversation.id); setMobileListOpen(false); setNotice(""); setReplyBody(""); }}>
          <span><strong>{conversation.leadName}</strong><span className="conversation-badges">{conversation.unread > 0 && <b className="unread-count">{conversation.unread}</b>}{(conversation.needsAttention || conversation.humanRequired || conversation.mode === "human_required" || conversation.mode === "human_takeover") && <b className="attention-badge" title={copy.needsAttention}>{copy.attentionBadge}</b>}</span></span>
          <small>{conversation.lastMessage || copy.noMessages}</small>
          <em>{conversation.channel} · {modeLabels[conversation.mode]}</em>
        </button>)}
      </div>
      <section className="conversation-panel">
        <header>
          <div><button type="button" className="inbox-mobile-back" onClick={() => setMobileListOpen(true)}>{language === "ar" ? "← كل المحادثات" : "← All conversations"}</button><h3>{selected?.leadName ?? copy.selectConversation}</h3>{selected && <p>Score {selected.leadScore}/100 · {selected.intent}{selected.handoffReason ? ` · ${selected.handoffReason}` : ""}</p>}</div>
          {selected && <label>{copy.modeLabel}<select value={selected.mode} disabled={!canWriteMode || busyId !== null} onChange={(event) => void changeMode(selected, event.target.value as ConversationMode)}>{(Object.keys(modeLabels) as ConversationMode[]).map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>}
        </header>
        {selected && canSendReply && <div className="inbox-action-bar">
          <button type="button" className="primary-action" disabled={busyId !== null || selected.mode === "human_takeover"} onClick={() => void handleTakeOver(selected)}>{copy.takeOverButton}</button>
          <button type="button" className="secondary" disabled={busyId !== null || selected.mode === "ai_active"} onClick={() => void handleReturnToAi(selected)}>{copy.returnToAiButton}</button>
        </div>}
        {(selected?.humanRequired || selected?.needsAttention) && <div className="human-alert">{selected.handoffReason ? `${copy.humanRequiredAlert} (${selected.handoffReason})` : copy.humanRequiredAlert}</div>}
        <div className="message-stream">
          {messageStatus === "loading" && <p className="muted">{copy.loadingMessages}</p>}
          {messageStatus === "error" && <div className="error-box">{copy.loadMessagesError}</div>}
          {messageStatus === "ready" && messages.length === 0 && <p className="muted">{copy.noMessagesInConversation}</p>}
          {messages.map((message) => <article key={message.id} className={`message-bubble ${message.direction === "outbound" ? "outbound" : "inbound"}${message.authorType === "staff" ? " staff-reply" : ""}${message.authorType === "ai_draft" ? " ai-draft" : ""}`}>
            <p>{message.body}</p><small>{message.authorType}{message.safetyClassification ? ` · ${message.safetyClassification}` : ""} · {new Date(message.createdAt).toLocaleString(language === "ar" ? "ar-AE" : "en-AE")}</small>
          </article>)}
        </div>
        {selected && canSendReply && selected.channel === "whatsapp" && selected.mode === "human_takeover" && <form className="inbox-compose" onSubmit={(event) => { event.preventDefault(); void handleSendReply(selected); }}>
          <label htmlFor="inbox-reply">{copy.replyLabel}<textarea id="inbox-reply" rows={3} value={replyBody} disabled={busyId !== null} onChange={(event) => setReplyBody(event.target.value)} placeholder={copy.replyPlaceholder} /></label>
          <button type="submit" disabled={busyId !== null || !replyBody.trim()}>{busyId === selected.id ? copy.sendingReply : copy.sendButton}</button>
        </form>}
        {!canSendReply && canWriteMode && <p className="read-only-note">{copy.replyReadOnlyNote}</p>}
        {!canWriteMode && !canSendReply && <p className="read-only-note">{copy.readOnlyNote}</p>}
        {busyId === selected?.id && <p className="muted">{copy.savingChange}</p>}
      </section>
    </div>
  </>;
}

const leadStageLabels: Record<Language, Record<LeadStage, string>> = {
  ar: { new: "جديد", contacted: "تم التواصل", qualified: "مؤهل", booking_intent: "نية حجز", booked: "محجوز", follow_up: "متابعة", lost: "فاقد", customer: "عميل" },
  en: { new: "New", contacted: "Contacted", qualified: "Qualified", booking_intent: "Booking intent", booked: "Booked", follow_up: "Follow-up", lost: "Lost", customer: "Customer" },
};

function CRMView({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  const { language, t } = useLanguage();
  const copy = t("crm");
  const stageLabels = leadStageLabels[language];
  const parsed = z.array(LeadSchema).safeParse(value);
  const [busyId, setBusyId] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const canWrite = ["super_admin", "admin", "reception", "coach"].includes(session.role);
  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;
  if (parsed.data.length === 0) return <p className="muted">{copy.noLeads}</p>;
  async function save(lead: z.infer<typeof LeadSchema>, form: HTMLFormElement) {
    if (!canWrite || busyId) return;
    const data = new FormData(form); const stage = String(data.get("stage")) as LeadStage;
    const humanRequired = data.get("humanRequired") === "on"; const doNotContact = data.get("doNotContact") === "on";
    const localFollowUp = String(data.get("nextFollowUpAt") ?? "").trim();
    const followUpDate = localFollowUp ? new Date(localFollowUp) : null;
    if (followUpDate && Number.isNaN(followUpDate.getTime())) { setNotice(copy.invalidFollowUp); return; }
    const nextFollowUpAt = followUpDate?.toISOString() ?? null;
    const confirmMessage = language === "ar"
      ? `تأكيد تحديث مسار ${lead.name}؟ سيتم تطبيق قواعد المتابعة وتسجيل العملية في Audit Log.`
      : `Update ${lead.name}'s stage? Follow-up rules apply. Recorded in the Audit Log.`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(lead.id); setNotice("");
    try { await updateLeadWorkflow(session, lead.id, stage, humanRequired, doNotContact, nextFollowUpAt); setNotice(language === "ar" ? "تم تحديث مسار العميل وتسجيل العملية بنجاح." : "Stage updated and recorded."); onChanged(); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      const messages: Record<string, string> = language === "ar" ? {
        INVALID_FOLLOW_UP_TIME: "موعد المتابعة يجب أن يكون في المستقبل.", FOLLOW_UP_TOO_FAR: "موعد المتابعة يتجاوز الحد المسموح.",
        FOLLOW_UP_LIMIT_REACHED: "تم بلوغ الحد الأقصى لمحاولات المتابعة.", STAFF_ACCESS_DENIED: "ليست لديك صلاحية تنفيذ هذا التغيير.",
      } : {
        INVALID_FOLLOW_UP_TIME: "Follow-up time must be in the future.", FOLLOW_UP_TOO_FAR: "Follow-up time exceeds the allowed limit.",
        FOLLOW_UP_LIMIT_REACHED: "Max follow-up attempts reached.", STAFF_ACCESS_DENIED: "You don't have permission for this.",
      };
      setNotice(messages[code] ?? (language === "ar" ? "تعذر التحديث بأمان؛ لم يتم اعتماد أي تغيير غير مؤكد." : "Update failed safely; no change was made."));
    } finally { setBusyId(null); }
  }
  return <><div className="write-banner"><strong>{copy.writeBannerTitle}</strong><span>{copy.writeBannerSubtitle}</span></div>{notice && <div className="notice-box" aria-live="polite">{notice}</div>}<Suspense fallback={null}><C360 leads={parsed.data} language={language} stageLabels={stageLabels} /></Suspense><div className="data-grid">{parsed.data.map((lead) => {
    const followUpLocal = formatLocalDateTimeInput(lead.nextFollowUpAt ?? null);
    return <article className="data-card booking-card" key={lead.id}><h3>{lead.name}</h3><p>{lead.phone ?? copy.noPhone} · {lead.channel ?? copy.unknownChannel}</p><p>{lead.intent ?? copy.unclassified} · Score: {lead.score ?? "—"}</p><form aria-busy={busyId === lead.id} onSubmit={(event) => { event.preventDefault(); void save(lead, event.currentTarget); }}><label>{copy.stageLabel}<select name="stage" defaultValue={lead.stage} disabled={!canWrite || busyId !== null}>{(["new", "contacted", "qualified", "booking_intent", "booked", "follow_up", "lost", "customer"] as const).map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label><label>{copy.nextFollowUpLabel}<input name="nextFollowUpAt" type="datetime-local" defaultValue={followUpLocal} disabled={!canWrite || busyId !== null} /></label><label><input name="humanRequired" type="checkbox" defaultChecked={lead.humanRequired} disabled={!canWrite || busyId !== null} /> {copy.humanRequiredLabel}</label><label><input name="doNotContact" type="checkbox" defaultChecked={lead.doNotContact} disabled={!canWrite || busyId !== null} /> {copy.doNotContactLabel}</label><button disabled={!canWrite || busyId !== null}>{busyId === lead.id ? t("common").saving : copy.saveButton}</button></form>{!canWrite && <small>{t("common").readOnlyNote}</small>}</article>;
  })}</div></>;
}

const contentStatusLabels: Record<Language, Record<ContentStatus, string>> = {
  ar: { idea: "فكرة", draft: "مسودة", generated: "مولّد", needs_review: "بانتظار المراجعة", approved: "معتمد", scheduled: "مجدول", published: "منشور", failed: "فشل", cancelled: "ملغي" },
  en: { idea: "Idea", draft: "Draft", generated: "Generated", needs_review: "Needs review", approved: "Approved", scheduled: "Scheduled", published: "Published", failed: "Failed", cancelled: "Cancelled" },
};

const contentActionLabels: Record<ContentAction, string> = {
  approve: "اعتماد المحتوى", return_to_review: "إعادة للمراجعة", schedule: "جدولة", unschedule: "إلغاء الجدولة",
};
const contentActionLabelsEn: Record<ContentAction, string> = {
  approve: "Approve content", return_to_review: "Return to review", schedule: "Schedule", unschedule: "Unschedule",
};

function contentErrorMessage(language: Language, code: string) {
  const messages: Record<string, string> = language === "ar" ? {
    STAFF_ACCESS_DENIED: "ليست لديك صلاحية تنفيذ هذا التغيير.", NOT_FOUND: "عنصر المحتوى لم يعد موجودًا.",
    PUBLISHED_CONTENT_IMMUTABLE: "المحتوى المنشور غير قابل للتحرير.", INVALID_CAPTION: "النص مطلوب ويجب ألا يتجاوز 5000 حرف.",
    CONTENT_FIELD_TOO_LONG: "أحد الحقول يتجاوز الحد المسموح.", TOO_MANY_HASHTAGS: "الحد الأقصى 30 وسمًا.",
    INVALID_HASHTAG: "أحد الوسوم غير صالح أو يتجاوز 100 حرف.", INVALID_TRANSITION: "هذا الانتقال غير مسموح للحالة الحالية.",
    APPROVAL_REQUIRED: "يجب اعتماد المحتوى قبل الجدولة.", INVALID_SCHEDULE_TIME: "وقت الجدولة يجب أن يكون في المستقبل.",
    SCHEDULE_TOO_FAR: "لا يمكن الجدولة لأكثر من 366 يومًا.", INVALID_ACTION: "الإجراء المطلوب غير مسموح.",
  } : {
    STAFF_ACCESS_DENIED: "You don't have permission for this.", NOT_FOUND: "This content item no longer exists.",
    PUBLISHED_CONTENT_IMMUTABLE: "Published content can't be edited.", INVALID_CAPTION: "Caption is required, max 5000 characters.",
    CONTENT_FIELD_TOO_LONG: "One field exceeds the allowed length.", TOO_MANY_HASHTAGS: "Max 30 hashtags.",
    INVALID_HASHTAG: "A hashtag is invalid or over 100 characters.", INVALID_TRANSITION: "Not allowed for the current status.",
    APPROVAL_REQUIRED: "Content must be approved before scheduling.", INVALID_SCHEDULE_TIME: "Scheduled time must be in the future.",
    SCHEDULE_TOO_FAR: "Can't schedule more than 366 days ahead.", INVALID_ACTION: "This action isn't allowed.",
  };
  return messages[code] ?? (language === "ar" ? "تعذر تنفيذ التغيير بأمان؛ لم يتم اعتماد أي تغيير غير مؤكد." : "Update failed safely; no change was made.");
}

function ContentStudioView({ value, session, onChanged, onSessionExpired, onOpenMedia, onOpenBrain }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void; onOpenMedia?: () => void; onOpenBrain?: () => void }) {
  const { language, t } = useLanguage();
  const copy = t("content");
  const statusLabels = contentStatusLabels[language];
  const parsed = useMemo(() => z.array(ContentItemSchema).safeParse(value), [value]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [undoAction, setUndoAction] = useState<{ itemId: string; action: "return_to_review" | "unschedule"; label: string } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [factoryTab, setFactoryTab] = useState<ContentFactoryTab>("overview");
  const [contentPage, setContentPage] = useState(1);
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const canWrite = ["super_admin", "admin", "content_manager"].includes(session.role);
  const items = parsed.success ? parsed.data : [];
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalized) return true;
      return [item.topic, item.hook, item.caption, item.cta, item.platform, item.contentType, ...item.hashtags]
        .some((field) => field.toLocaleLowerCase("ar").includes(normalized));
    });
  }, [items, query, statusFilter]);
  const contentPageSize = 10;
  const contentPageCount = Math.max(1, Math.ceil(filteredItems.length / contentPageSize));
  const visibleContentItems = filteredItems.slice((contentPage - 1) * contentPageSize, contentPage * contentPageSize);
  useEffect(() => { setContentPage(1); }, [query, statusFilter]);
  useEffect(() => { if (contentPage > contentPageCount) setContentPage(contentPageCount); }, [contentPage, contentPageCount]);

  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;

  async function runMutation(itemId: string, operation: () => Promise<unknown>, successMessage: string, undo?: { action: "return_to_review" | "unschedule"; label: string }) {
    if (!canWrite || busyId || batchBusy) return;
    setBusyId(itemId); setNotice("");
    try { await operation(); setUndoAction(undo ? { itemId, ...undo } : null); setNotice(successMessage); onChanged(); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(contentErrorMessage(language, code));
    } finally { setBusyId(null); }
  }

  async function undoLastAction() {
    if (!undoAction || !canWrite || busyId || batchBusy) return;
    const action = undoAction;
    setBusyId(action.itemId); setNotice("");
    try {
      await transitionContentItem(session, action.itemId, action.action);
      setUndoAction(null);
      setNotice(language === "ar" ? "تم التراجع عن آخر تغيير فقط." : "The last change was undone.");
      onChanged();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(contentErrorMessage(language, code));
    } finally { setBusyId(null); }
  }

  async function save(item: z.infer<typeof ContentItemSchema>, form: HTMLFormElement) {
    if (!canWrite || busyId || batchBusy || item.status === "published") return;
    const data = new FormData(form);
    const fields = {
      topic: String(data.get("topic") ?? "").trim(), hook: String(data.get("hook") ?? "").trim(),
      caption: String(data.get("caption") ?? "").trim(), cta: String(data.get("cta") ?? "").trim(),
      hashtags: [...new Set(String(data.get("hashtags") ?? "").split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))],
      visualPrompt: String(data.get("visualPrompt") ?? "").trim(),
    };
    const unchanged = fields.topic === item.topic && fields.hook === item.hook && fields.caption === item.caption && fields.cta === item.cta
      && fields.visualPrompt === item.visualPrompt && JSON.stringify(fields.hashtags) === JSON.stringify(item.hashtags);
    if (unchanged) { setNotice(copy.noChanges); return; }
    if (fields.caption.length < 2 || fields.caption.length > 5000 || fields.hashtags.length > 30) { setNotice(copy.checkFieldLengths); return; }
    const confirmMessage = language === "ar"
      ? `تأكيد حفظ تعديلات «${item.topic || "محتوى بدون عنوان"}»؟${item.status === "scheduled" ? " سيؤدي التحرير إلى إلغاء الجدولة وإعادة العنصر للمراجعة." : " سيعود العنصر إلى المراجعة."} سيتم تسجيل العملية في Audit Log.`
      : `Save changes to "${item.topic || copy.untitled}"?${item.status === "scheduled" ? " Unschedules and returns to review." : " Returns to review."} Recorded in the Audit Log.`;
    if (!window.confirm(confirmMessage)) return;
    await runMutation(item.id, () => updateContentItem(session, item.id, fields), language === "ar" ? "تم حفظ المحتوى وإعادته للمراجعة مع تسجيل العملية." : "Saved, returned to review, and recorded.");
  }

  async function transition(item: z.infer<typeof ContentItemSchema>, action: ContentAction, form: HTMLFormElement) {
    if (!canWrite || busyId || batchBusy) return;
    let scheduledFor: string | null = null;
    if (action === "schedule") {
      const localValue = String(new FormData(form).get("scheduledFor") ?? "").trim();
      if (!localValue) { setNotice(copy.pickScheduleTime); return; }
      const date = new Date(localValue);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { setNotice(copy.scheduleMustBeFuture); return; }
      scheduledFor = date.toISOString();
    }
    if ((action === "approve" && item.status === "approved") || (action === "return_to_review" && item.status === "needs_review")) return;
    const confirmMessage = language === "ar"
      ? `تأكيد «${contentActionLabels[action]}» للعنصر «${item.topic || "محتوى بدون عنوان"}»؟ سيتم تسجيل العملية في Audit Log.`
      : `"${contentActionLabelsEn[action]}" for "${item.topic || copy.untitled}"? Recorded in the Audit Log.`;
    if (!window.confirm(confirmMessage)) return;
    const undo = action === "approve" && item.status !== "published"
      ? { action: "return_to_review" as const, label: language === "ar" ? "تراجع عن الاعتماد" : "Undo approval" }
      : action === "schedule" ? { action: "unschedule" as const, label: language === "ar" ? "تراجع عن الجدولة" : "Undo scheduling" } : undefined;
    await runMutation(item.id, () => transitionContentItem(session, item.id, action, scheduledFor), language === "ar" ? `تم تنفيذ «${contentActionLabels[action]}» وتسجيل العملية بنجاح.` : `"${contentActionLabelsEn[action]}" completed and recorded.`, undo);
  }

  async function approveBatchItem(item: ContentBatchItem) {
    if (!canWrite || busyId || batchBusy || item.status === "approved") return;
    if (!canApproveContentItem(item)) return;
    const confirmMessage = language === "ar"
      ? `تأكيد اعتماد «${item.topic || "محتوى بدون عنوان"}»؟ سيتم اعتماد المحتوى وجدولته للموعد المحدد.`
      : `Approve "${item.topic || copy.untitled}"? The item will be approved and scheduled for its planned time.`;
    if (!window.confirm(confirmMessage)) return;
    await runMutation(
      item.id,
      () => callRpc(session, "approve_and_schedule_staff_content_item", {
        p_content_item_id: item.id,
        p_scheduled_for: item.scheduledFor,
      }),
      language === "ar" ? "تم اعتماد المحتوى وجدولته." : "Item approved and scheduled.",
      { action: "unschedule", label: language === "ar" ? "إلغاء الجدولة" : "Undo scheduling" },
    );
  }

  async function requestBatchChanges(item: ContentBatchItem, kind: ChangeRequestKind, note: string) {
    if (!canWrite || busyId || batchBusy || item.status === "needs_review") return;
    const confirmMessage = language === "ar"
      ? `تأكيد طلب تعديل «${item.topic || "محتوى بدون عنوان"}» وإعادته للمراجعة؟`
      : `Request changes and return "${item.topic || copy.untitled}" to review?`;
    if (!window.confirm(confirmMessage)) return;
    const changeNote = buildChangeRequestNote(kind, note);
    const nextVisualPrompt = appendChangeRequest(String(item.visualPrompt ?? ""), changeNote);
    await runMutation(item.id, async () => {
      await updateContentItem(session, item.id, {
        topic: item.topic,
        hook: String(item.hook ?? ""),
        caption: item.caption,
        cta: String(item.cta ?? ""),
        hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
        visualPrompt: nextVisualPrompt,
      });
      await transitionContentItem(session, item.id, "return_to_review");
    }, language === "ar" ? "تم إرسال طلب التعديل وإعادة العنصر للمراجعة." : "Change request sent and item returned to review.");
  }

  async function editBatchItem(item: ContentBatchItem, visualPrompt: string, scheduledFor: string | null) {
    if (!canWrite || busyId || batchBusy || item.status === "published") return;
    const contentChanged = visualPrompt !== String(item.visualPrompt ?? "");
    const scheduleChanged = scheduledFor !== item.scheduledFor;
    if (!contentChanged && !scheduleChanged) {
      setNotice(language === "ar" ? "لا تغيير." : "No change.");
      return;
    }
    const confirmMessage = language === "ar" ? "تأكيد التعديل؟" : "Confirm edit?";
    if (!window.confirm(confirmMessage)) return;
    await runMutation(item.id, async () => {
      if (contentChanged) {
        await updateContentItem(session, item.id, {
          topic: item.topic,
          hook: String(item.hook ?? ""),
          caption: item.caption,
          cta: String(item.cta ?? ""),
          hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
          visualPrompt,
        });
      }
      if (scheduleChanged) {
        if (scheduledFor) await transitionContentItem(session, item.id, "schedule", scheduledFor);
        else if (item.status === "scheduled") await transitionContentItem(session, item.id, "unschedule", null);
      }
    }, contentChanged && scheduleChanged
      ? (language === "ar" ? "تم حفظ التصميم والموعد." : "Design request and schedule updated.")
      : contentChanged
        ? (language === "ar" ? "تم حفظ طلب التصميم." : "Design request saved.")
        : (language === "ar" ? "تم تحديث الموعد." : "Time updated."));
  }

  async function approveAllBatch(candidates: ContentBatchItem[]) {
    if (!canWrite || busyId || batchBusy) return;
    const pending = candidates.filter(canApproveContentItem);
    if (pending.length === 0) {
      setNotice(t("contentBatch").batchNothingToApprove);
      return;
    }
    const databaseBatchId = sharedDatabaseBatchId(candidates);
    setBatchBusy(true);
    setNotice("");
    try {
      if (databaseBatchId) {
        try {
          const result = await approveStaffContentBatch(session, databaseBatchId);
          const approvedCount = result.approvedCount ?? 0;
          const alreadyApprovedCount = result.alreadyApprovedCount ?? 0;
          if (approvedCount > 0 || alreadyApprovedCount > 0) {
            setNotice(approvedCount > 0 ? t("contentBatch").batchApprovedNotice : t("contentBatch").batchNothingToApprove);
            onChanged();
          } else {
            setNotice(t("contentBatch").batchNothingToApprove);
          }
        } catch (cause) {
          const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
          if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
          setNotice(contentErrorMessage(language, code));
        }
        return;
      }

      let approvedCount = 0;
      let failed = false;
      for (const item of pending) {
        if (!canApproveContentItem(item)) continue;
        try {
          await transitionContentItem(session, item.id, "approve");
          approvedCount += 1;
        } catch (cause) {
          failed = true;
          const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
          if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
          setNotice(contentErrorMessage(language, code));
          break;
        }
      }
      if (approvedCount > 0) {
        setNotice(failed ? t("contentBatch").batchPartialFailure : t("contentBatch").batchApprovedNotice);
        onChanged();
      } else if (!failed) {
        setNotice(t("contentBatch").batchNothingToApprove);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  const panelBusy = busyId !== null || batchBusy;
  const contentCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return <>
    <div className="write-banner"><strong>{copy.writeBannerTitle}</strong><span>{copy.writeBannerSubtitle}</span></div>
    {notice && <div className="notice-box" aria-live="polite">{notice}{undoAction && <button type="button" className="text-button" disabled={busyId !== null || batchBusy} onClick={() => void undoLastAction()}>{undoAction.label}</button>}</div>}
    <Suspense fallback={null}>
      <ContentGrowthHub
        items={items}
        session={session}
        canWrite={canWrite}
        busy={panelBusy}
        activeTab={factoryTab}
        onApproveItem={approveBatchItem}
        onEditItem={editBatchItem}
        onRequestChanges={requestBatchChanges}
        onApproveAll={approveAllBatch}
        onBatchCreated={onChanged}
        onSessionExpired={onSessionExpired}
        onOpenMedia={() => onOpenMedia?.()}
        onOpenBrain={() => onOpenBrain?.()}
        onTabChange={setFactoryTab}
      />
    </Suspense>
    {factoryTab === "content" && <>
    <section className="content-control-room" aria-labelledby="content-control-room-title">
      <div><span>{language === "ar" ? "مساحة عمل تنفيذية" : "ACTION WORKSPACE"}</span><h2 id="content-control-room-title">{language === "ar" ? "ماذا تريد أن تفعل بالمحتوى؟" : "What do you want to do with content?"}</h2><p>{language === "ar" ? "اختر إجراءً واضحًا أولًا؛ لا تحتاج إلى قراءة القائمة كاملة." : "Choose a clear action first; you do not need to read the full list."}</p></div>
      <div className="content-control-actions">
        <button type="button" className="primary-button" onClick={() => { setFactoryTab("factory"); }}>{language === "ar" ? "إنشاء دفعة جديدة" : "Create new batch"}</button>
        <button type="button" onClick={() => { setFactoryTab("review"); }}>{language === "ar" ? `مراجعة المحتوى (${contentCounts.needs_review ?? 0})` : `Review content (${contentCounts.needs_review ?? 0})`}</button>
        <button type="button" onClick={() => { setFactoryTab("campaigns"); }}>{language === "ar" ? `فتح المجدول (${contentCounts.scheduled ?? 0})` : `Open scheduled (${contentCounts.scheduled ?? 0})`}</button>
      </div>
    </section>
    <div className="content-toolbar">
      <label>{t("common").search}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label>
      <label>{t("common").status}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ContentStatus | "all")}><option value="all">{copy.allStatuses}</option>{(Object.keys(statusLabels) as ContentStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <span>{filteredItems.length} {t("common").of} {items.length}</span>
    </div>
    {filteredItems.length > contentPageSize && <div className="content-pagination" aria-label={language === "ar" ? "تنقل صفحات المحتوى" : "Content pagination"}>
      <button type="button" disabled={contentPage <= 1} onClick={() => setContentPage((page) => Math.max(1, page - 1))}>{language === "ar" ? "السابق" : "Previous"}</button>
      <strong>{language === "ar" ? `صفحة ${contentPage} من ${contentPageCount}` : `Page ${contentPage} of ${contentPageCount}`}</strong>
      <button type="button" disabled={contentPage >= contentPageCount} onClick={() => setContentPage((page) => Math.min(contentPageCount, page + 1))}>{language === "ar" ? "التالي" : "Next"}</button>
    </div>}
    {items.length === 0 && <p className="muted">{copy.noItems}</p>}
    {items.length > 0 && filteredItems.length === 0 && <p className="muted">{t("common").noResults}</p>}
    <div className="content-list">{visibleContentItems.map((item) => {
      const scheduledLocal = formatLocalDateTimeInput(item.scheduledFor);
      const locked = panelBusy || !canWrite || item.status === "published";
      return <article className="content-card" key={item.id}>
        <header><div><span>{item.platform} · {item.contentType}</span><h3>{item.topic || copy.untitled}</h3><small>{item.status === "published" ? (language === "ar" ? "منشور — لا يحتاج تعديلًا" : "Published — no edit needed") : (language === "ar" ? "اختر إجراءً من الأسفل" : "Choose an action below")}</small></div><div className="content-card-heading-actions"><span className={`content-status status-${item.status}`}>{statusLabels[item.status]}</span><button type="button" onClick={() => setExpandedContentId((current) => current === item.id ? null : item.id)}>{expandedContentId === item.id ? (language === "ar" ? "إغلاق التعديل" : "Close editor") : (language === "ar" ? "تعديل المحتوى" : "Edit content")}</button></div></header>
        {expandedContentId === item.id && <form id={`content-editor-${item.id}`} onSubmit={(event) => { event.preventDefault(); void save(item, event.currentTarget); }}>
          <div className="content-fields"><label>{copy.topicLabel}<input name="topic" defaultValue={item.topic} maxLength={300} disabled={locked} /></label><label>{copy.hookLabel}<input name="hook" defaultValue={item.hook} maxLength={500} disabled={locked} /></label></div>
          <label>{copy.captionLabel}<textarea name="caption" defaultValue={item.caption} minLength={2} maxLength={5000} rows={6} required disabled={locked} /></label>
          <div className="content-fields"><label>{copy.ctaLabel}<input name="cta" defaultValue={item.cta} maxLength={500} disabled={locked} /></label><label>{copy.hashtagsLabel}<input name="hashtags" defaultValue={item.hashtags.join(", ")} disabled={locked} /></label></div>
          <label>{copy.visualPromptLabel}<textarea name="visualPrompt" defaultValue={item.visualPrompt} maxLength={2000} rows={3} disabled={locked} /></label>
          <button type="submit" disabled={locked}>{busyId === item.id ? t("common").saving : copy.saveButton}</button>
        </form>}
        <form className="content-actions" onSubmit={(event) => event.preventDefault()}>
          <label>{copy.scheduleTimeLabel}<input name="scheduledFor" type="datetime-local" defaultValue={scheduledLocal} disabled={!canWrite || busyId !== null || !["approved", "scheduled"].includes(item.status)} /></label>
          <div>
            {["draft", "generated", "needs_review"].includes(item.status) && <button type="button" disabled={!canWrite || busyId !== null} onClick={(event) => void transition(item, "approve", event.currentTarget.form!)}>{copy.approveButton}</button>}
            {["draft", "generated", "approved", "scheduled", "failed"].includes(item.status) && <button type="button" className="secondary" disabled={!canWrite || busyId !== null} onClick={(event) => void transition(item, "return_to_review", event.currentTarget.form!)}>{copy.returnToReviewButton}</button>}
            {["approved", "scheduled"].includes(item.status) && <button type="button" disabled={!canWrite || busyId !== null} onClick={(event) => void transition(item, "schedule", event.currentTarget.form!)}>{item.status === "scheduled" ? copy.rescheduleButton : copy.scheduleButton}</button>}
            {item.status === "scheduled" && <button type="button" className="secondary" disabled={!canWrite || busyId !== null} onClick={(event) => void transition(item, "unschedule", event.currentTarget.form!)}>{copy.unscheduleButton}</button>}
          </div>
        </form>
        <footer><span>{copy.lastUpdated}: {formatBookingDateTime(language, item.updatedAt)}</span>{item.publishedAt && <span>{copy.published}: {formatBookingDateTime(language, item.publishedAt)}</span>}{!canWrite && <span>{t("common").readOnlyNote}</span>}{item.status === "published" && <span>{copy.publishedLocked}</span>}</footer>
      </article>;
    })}</div>
    </>}
  </>;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function AnalyticsView({ value, onNavigate }: { value: JsonValue; onNavigate: (section: SectionId) => void }) {
  const { language, t } = useLanguage();
  const copy = t("analytics");
  const analyticsNumber = useMemo(() => new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-AE", { maximumFractionDigits: 0 }), [language]);
  const analyticsPercent = useMemo(() => new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-AE", { style: "percent", maximumFractionDigits: 1 }), [language]);
  const parsed = AnalyticsSchema.safeParse(value);
  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;
  const analytics = parsed.data;
  const publishedShare = safeRatio(analytics.publishedItems, analytics.contentItems);
  const dmRate = safeRatio(analytics.dms, analytics.views);

  return <>
    <div className="operations-actions"><button type="button" onClick={() => onNavigate("content")}>{language === "ar" ? "فتح المصنع" : "Open Factory"}</button><button type="button" className="secondary" onClick={() => onNavigate("crm")}>{language === "ar" ? "فتح العملاء" : "Open customers"}</button><button type="button" className="secondary" onClick={() => onNavigate("planner")}>{language === "ar" ? "فتح الحجوزات" : "Open bookings"}</button></div>
    <div className={`analytics-trust ${analytics.attributionReady ? "ready" : "limited"}`}>
      <div><strong>{analytics.attributionReady ? (language === "ar" ? "Attribution متاح" : "Attribution available") : (language === "ar" ? "Attribution غير مكتمل" : "Attribution incomplete")}</strong><p>{analytics.attributionReady ? (language === "ar" ? "يمكن ربط النتائج بالمصادر وفق العقد الحالي." : "Results can be linked to sources under the current contract.") : (language === "ar" ? "المؤشرات إجماليات تشغيلية مستقلة؛ لا تُفسر كتحويلات منسوبة لحملة أو منشور." : "These figures are independent operational totals; do not interpret them as conversions attributed to a campaign or post.")}</p></div>
      <span>{analytics.attributionReady ? copy.attributionReadyBadge : copy.attributionLimitedBadge}</span>
    </div>
    <div className="analytics-groups">
      <section><header><div><p>{copy.audienceGroupEyebrow}</p><h3>{copy.audienceGroupTitle}</h3></div><BarChart3 size={24} /></header><div className="analytics-metrics"><article><span>{copy.viewsLabel}</span><strong>{analyticsNumber.format(analytics.views)}</strong><small>{copy.viewsHint}</small></article><article><span>{copy.dmsLabel}</span><strong>{analyticsNumber.format(analytics.dms)}</strong><small>{dmRate == null ? copy.dmRateNoViews : `${analyticsPercent.format(dmRate)} ${copy.dmRateHint}`}</small></article></div></section>
      <section><header><div><p>{copy.leadsGroupEyebrow}</p><h3>{copy.leadsGroupTitle}</h3></div><ContactRound size={24} /></header><div className="analytics-metrics"><article><span>{copy.qualifiedLeadsLabel}</span><strong>{analyticsNumber.format(analytics.qualifiedLeads)}</strong><small>{copy.qualifiedLeadsHint}</small></article><article><span>{copy.bookingRequestsLabel}</span><strong>{analyticsNumber.format(analytics.bookingRequests)}</strong><small>{language === "ar" ? "إجمالي مستقل، غير منسوب للعملاء المؤهلين" : "Independent total, not attributed to qualified leads"}</small></article></div></section>
      <section><header><div><p>{copy.contentGroupEyebrow}</p><h3>{copy.contentGroupTitle}</h3></div><Bot size={24} /></header><div className="analytics-metrics"><article><span>{copy.totalContentLabel}</span><strong>{analyticsNumber.format(analytics.contentItems)}</strong><small>{copy.totalContentHint}</small></article><article><span>{copy.publishedLabel}</span><strong>{analyticsNumber.format(analytics.publishedItems)}</strong><small>{publishedShare == null ? copy.publishedNoContentHint : `${analyticsPercent.format(publishedShare)} ${copy.publishedShareHint}`}</small></article></div>{publishedShare != null && <progress className="analytics-progress" value={Math.min(publishedShare, 1)} max={1} aria-label={`${copy.publishedShareAria} ${analyticsPercent.format(publishedShare)}`}>{analyticsPercent.format(publishedShare)}</progress>}</section>
    </div>
    <div className="analytics-methodology"><strong>{copy.methodologyTitle}</strong><p>{analytics.note}</p><small>{copy.methodologyFootnote}</small></div>
  </>;
}

const radarPriorityLabels: Record<Language, Record<RadarPriority, string>> = {
  ar: { HOT: "🔥 ساخن", WARM: "دافئ", LOW: "منخفض" },
  en: { HOT: "🔥 HOT", WARM: "WARM", LOW: "LOW" },
};
const radarStatusLabels: Record<Language, Record<RadarStatus, string>> = {
  ar: {
    NEW: "جديد", REVIEWED: "تمت المراجعة", ACTIONED: "تم اتخاذ إجراء", DISMISSED: "مرفوض",
    CONTACTED: "تم التواصل", CUSTOMER_REPLIED: "رد العميل", BOOKING_REQUEST: "طلب حجز",
    BOOKED: "تم الحجز", PAID_CUSTOMER: "عميل مدفوع", NOT_RELEVANT: "غير ذي صلة",
    UNREACHABLE: "تعذر الوصول", LOST: "فقدت",
  },
  en: {
    NEW: "New", REVIEWED: "Reviewed", ACTIONED: "Actioned", DISMISSED: "Dismissed",
    CONTACTED: "Contacted", CUSTOMER_REPLIED: "Customer replied", BOOKING_REQUEST: "Booking request",
    BOOKED: "Booked", PAID_CUSTOMER: "Paid customer", NOT_RELEVANT: "Not relevant",
    UNREACHABLE: "Unreachable", LOST: "Lost",
  },
};
const radarFunnelOrder = Object.keys(radarStatusLabels.en) as RadarStatus[];

function RadarView({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  const { language, t } = useLanguage();
  const copy = t("radar");
  const parsed = useMemo(() => z.array(RadarOpportunitySchema).safeParse(value), [value]);
  const [priorityFilter, setPriorityFilter] = useState<RadarPriority | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [sourcePerf, setSourcePerf] = useState<z.infer<typeof RadarSourcePerformanceSchema>[] | null>(null);
  const canWrite = ["super_admin", "admin", "reception", "coach"].includes(session.role);

  useEffect(() => {
    const controller = new AbortController();
    getRadarSourcePerformance(session, controller.signal).then(setSourcePerf).catch(() => setSourcePerf(null));
    return () => controller.abort();
  }, [session, value]);

  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;
  const opportunities = parsed.data;
  const counts = { HOT: 0, WARM: 0, LOW: 0 } as Record<RadarPriority, number>;
  for (const opportunity of opportunities) counts[opportunity.priority] += 1;
  const visible = priorityFilter === "all" ? opportunities : opportunities.filter((opportunity) => opportunity.priority === priorityFilter);

  async function changeStatus(opportunity: z.infer<typeof RadarOpportunitySchema>, next: RadarStatus) {
    if (!canWrite || busyId || opportunity.status === next) return;
    setBusyId(opportunity.id); setNotice("");
    try {
      await setRadarOpportunityStatus(session, opportunity.id, next);
      setNotice(copy.updateSuccess);
      onChanged();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(code === "STAFF_ACCESS_DENIED" ? copy.accessDenied : copy.updateFailed);
    } finally { setBusyId(null); }
  }

  return <>
    <div className="operations-boundary"><div><strong>{copy.boundaryTitle}</strong><p>{copy.boundaryBody}</p></div></div>
    {notice && <div className="notice-box" aria-live="polite">{notice}</div>}
    <div className="operations-summary">
      <button type="button" className={priorityFilter === "all" ? "active" : ""} onClick={() => setPriorityFilter("all")}><span>{copy.totalRecords}</span><strong>{opportunities.length}</strong></button>
      <button type="button" className={priorityFilter === "HOT" ? "active danger" : ""} onClick={() => setPriorityFilter("HOT")}><span>{radarPriorityLabels[language].HOT}</span><strong>{counts.HOT}</strong></button>
      <button type="button" className={priorityFilter === "WARM" ? "active warning" : ""} onClick={() => setPriorityFilter("WARM")}><span>{radarPriorityLabels[language].WARM}</span><strong>{counts.WARM}</strong></button>
      <button type="button" className={priorityFilter === "LOW" ? "active" : ""} onClick={() => setPriorityFilter("LOW")}><span>{radarPriorityLabels[language].LOW}</span><strong>{counts.LOW}</strong></button>
    </div>
    {visible.length === 0 && <p className="muted">{copy.noOpportunities}</p>}
    <div className="operations-list">{visible.map((opportunity) => <article key={opportunity.id}>
      <header><div><h4>{radarPriorityLabels[language][opportunity.priority]} · {opportunity.buyerIntentScore}/100</h4><small>{opportunity.source} ({opportunity.sourceType}) · {formatBookingDateTime(language, opportunity.discoveredAt)}</small></div><span className={`job-status job-${opportunity.status.toLowerCase()}`}>{radarStatusLabels[language][opportunity.status]}</span></header>
      <p dir={opportunity.language === "ar" ? "rtl" : "ltr"}>{opportunity.textExcerpt}</p>
      <dl>
        <div><dt>{copy.locationLabel}</dt><dd>{[opportunity.locationHint ?? opportunity.areaHint, opportunity.serviceIntent].filter(Boolean).join(" · ") || t("common").unlinked}</dd></div>
        <div><dt>{copy.reasonLabel}</dt><dd>{opportunity.reason ?? t("common").unlinked}{opportunity.duplicateCount > 0 ? ` (${copy.seenAgain} ${opportunity.duplicateCount})` : ""}</dd></div>
        {opportunity.recommendedAction && <div><dt>{copy.nextActionLabel}</dt><dd>{opportunity.recommendedAction}</dd></div>}
      </dl>
      <p>
        {opportunity.sourceUrl && <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="text-button">{copy.openSource}</a>}
        {canWrite && (
          <select
            aria-label={copy.funnelStatusLabel}
            disabled={busyId !== null}
            value={opportunity.status}
            onChange={(event) => void changeStatus(opportunity, event.target.value as RadarStatus)}
          >
            {radarFunnelOrder.map((next) => <option key={next} value={next}>{radarStatusLabels[language][next]}</option>)}
          </select>
        )}
      </p>
    </article>)}</div>
    {sourcePerf && sourcePerf.length > 0 && <>
      <h3>{copy.sourcePerformanceTitle}</h3>
      <div className="operations-list">{sourcePerf.map((row) => <article key={row.source}>
        <header><div><h4>{row.source}</h4><small>{row.total} {copy.totalRecords.toLowerCase()}</small></div></header>
        <p>{copy.qualifiedLabel} {row.qualified_leads} · {copy.bookingRequestsLabel} {row.booking_requests} · {copy.paidLabel} {row.paid_customers} · {copy.conversionLabel} {row.conversion_rate_pct}%</p>
      </article>)}</div>
    </>}
  </>;
}

const bookingStatusLabels: Record<Language, Record<BookingStatus, string>> = {
  ar: { pending: "قيد الانتظار", contacted: "تم التواصل", confirmed: "مؤكد", declined: "مرفوض", cancelled: "ملغي" },
  en: { pending: "Pending", contacted: "Contacted", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled" },
};

function formatBookingDateTime(language: Language, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "ar" ? "ar-AE" : "en-AE");
}

function BookingView({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  const { language, t } = useLanguage();
  const copy = t("planner");
  const statusLabels = bookingStatusLabels[language];
  const parsed = useMemo(() => z.array(BookingSchema).safeParse(value), [value]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [undoBooking, setUndoBooking] = useState<{ id: string; previous: BookingStatus; label: string } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const canWrite = ["super_admin", "admin", "reception"].includes(session.role);
  const bookings = parsed.success ? parsed.data : [];
  const counts = useMemo(() => {
    const initial: Record<BookingStatus, number> = { pending: 0, contacted: 0, confirmed: 0, declined: 0, cancelled: 0 };
    for (const booking of bookings) initial[booking.status] += 1;
    return initial;
  }, [bookings]);
  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");
    return bookings.filter((booking) => {
      if (statusFilter !== "all" && booking.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [booking.full_name, booking.phone, booking.normalized_phone, booking.category, booking.training_type, booking.location, booking.other_location]
        .filter((item): item is string => Boolean(item))
        .some((item) => item.toLocaleLowerCase("ar").includes(normalizedQuery));
    });
  }, [bookings, query, statusFilter]);

  useEffect(() => {
    if (statusFilter !== "all" || bookings.length === 0) return;
    const nextFilter: BookingStatus | "all" = counts.pending > 0 ? "pending" : counts.contacted > 0 ? "contacted" : "all";
    if (nextFilter !== "all") setStatusFilter(nextFilter);
  }, [bookings.length, counts.contacted, counts.pending, statusFilter]);

  if (!parsed.success) return <div className="error-box">{copy.invalidFormat}</div>;

  async function changeStatus(booking: z.infer<typeof BookingSchema>, next: BookingStatus) {
    if (!canWrite || busyId || booking.status === next) return;
    const confirmMessage = language === "ar"
      ? `تأكيد تغيير حالة طلب ${booking.full_name} من «${statusLabels[booking.status]}» إلى «${statusLabels[next]}»؟ سيتم تسجيل العملية في Audit Log.`
      : `Change ${booking.full_name}'s status from "${statusLabels[booking.status]}" to "${statusLabels[next]}"? Recorded in the Audit Log.`;
    if (!window.confirm(confirmMessage)) return;
    setBusyId(booking.id); setNotice("");
    try {
      await updateBookingStatus(session, booking.id, next);
      setUndoBooking({ id: booking.id, previous: booking.status, label: language === "ar" ? "تراجع عن آخر تغيير" : "Undo last change" });
      setNotice(language === "ar" ? "تم تحديث الحالة وتسجيل العملية بنجاح." : "Status updated and recorded.");
      onChanged();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      const messagesByCode: Record<string, string> = language === "ar" ? {
        STAFF_ACCESS_DENIED: "ليست لديك صلاحية تنفيذ هذا التغيير.",
        INVALID_STATUS: "حالة الحجز المطلوبة غير مسموحة.",
        NOT_FOUND: "طلب الحجز لم يعد موجودًا.",
      } : {
        STAFF_ACCESS_DENIED: "You don't have permission for this.",
        INVALID_STATUS: "That booking status isn't allowed.",
        NOT_FOUND: "This booking request no longer exists.",
      };
      setNotice(messagesByCode[code] ?? (language === "ar" ? "تعذر التحديث بأمان؛ لم يتم اعتماد أي تغيير غير مؤكد." : "Update failed safely; no change was made."));
    } finally { setBusyId(null); }
  }

  async function undoLastBookingChange() {
    if (!undoBooking || !canWrite || busyId) return;
    const action = undoBooking;
    setBusyId(action.id); setNotice("");
    try {
      await updateBookingStatus(session, action.id, action.previous);
      setUndoBooking(null);
      setNotice(language === "ar" ? "تم التراجع عن آخر تغيير فقط." : "The last change was undone.");
      onChanged();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "UPDATE_FAILED";
      if (code === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(language === "ar" ? "تعذر التراجع بأمان؛ لم يتم تغيير الحجز." : "Undo failed safely; the booking was not changed.");
    } finally { setBusyId(null); }
  }

  return <>
    <div className="write-banner"><strong>{copy.writeBannerTitle}</strong><span>{copy.writeBannerSubtitle}</span></div>
    {notice && <div className="notice-box" aria-live="polite">{notice}{undoBooking && <button type="button" className="text-button" disabled={busyId !== null} onClick={() => void undoLastBookingChange()}>{undoBooking.label}</button>}</div>}
    <div className="booking-summary" aria-label={language === "ar" ? "ملخص حالات الحجوزات" : "Booking status summary"}>
      <button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}><span>{copy.totalLabel}</span><strong>{bookings.length}</strong></button>
      {(Object.keys(statusLabels) as BookingStatus[]).map((status) => <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}><span>{statusLabels[status]}</span><strong>{counts[status]}</strong></button>)}
    </div>
    <div className="booking-toolbar">
      <label htmlFor="booking-search">{copy.searchLabel}<input id="booking-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label>
      <span>{filteredBookings.length} {t("common").of} {bookings.length}</span>
    </div>
    {bookings.length === 0 && <p className="muted">{copy.noBookings}</p>}
    {bookings.length > 0 && filteredBookings.length === 0 && <p className="muted">{t("common").noResults}</p>}
    <div className="booking-list">{filteredBookings.map((booking) => {
      const phone = booking.normalized_phone ?? booking.phone;
      const location = booking.location === "Other" ? booking.other_location : booking.location;
      const bookingNeedsAction = ["pending", "contacted"].includes(booking.status);
      return <article className="booking-operation-card" key={booking.id}>
        <header><div><h3>{booking.full_name}</h3><p>{phone ? <a href={`tel:${phone}`}>{phone}</a> : copy.noPhone}</p></div><span className={`booking-status status-${booking.status}`}>{statusLabels[booking.status]}</span></header>
        <dl>
          <div><dt>{copy.requestedSlotLabel}</dt><dd>{[booking.requested_date, booking.requested_time?.slice(0, 5)].filter(Boolean).join(" · ") || copy.notSpecified}</dd></div>
          <div><dt>{copy.serviceLabel}</dt><dd>{[booking.category, booking.training_type].filter(Boolean).join(" · ") || copy.serviceNotSpecified}</dd></div>
          <div><dt>{copy.locationLabel}</dt><dd>{location || copy.notSpecified}</dd></div>
          <div><dt>{copy.profileLabel}</dt><dd>{[booking.gender, booking.swam_before == null ? null : booking.swam_before ? copy.hasSwum : copy.hasNotSwum].filter(Boolean).join(" · ") || copy.profileIncomplete}</dd></div>
          <div><dt>{copy.requestedAtLabel}</dt><dd>{formatBookingDateTime(language, booking.created_at)}</dd></div>
        </dl>
        {booking.fear_of_water && <div className="booking-risk">{copy.fearOfWaterAlert}</div>}
        <label htmlFor={`booking-status-${booking.id}`}>{copy.updateStatusLabel}<select id={`booking-status-${booking.id}`} value={booking.status} disabled={!canWrite || busyId !== null} onChange={(event) => void changeStatus(booking, event.target.value as BookingStatus)}>{(Object.keys(statusLabels) as BookingStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        {canWrite && bookingNeedsAction && <div className="operations-actions"><button type="button" className="primary-action" disabled={busyId !== null} onClick={() => void changeStatus(booking, "confirmed")}>{statusLabels.confirmed}</button><button type="button" className="danger" disabled={busyId !== null} onClick={() => void changeStatus(booking, "declined")}>{statusLabels.declined}</button></div>}
        {busyId === booking.id && <small>{copy.savingChange}</small>}
        {!canWrite && <small>{t("common").readOnlyNote}</small>}
      </article>;
    })}</div>
  </>;
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { language, t } = useLanguage();
  const nav = t("nav");
  const dashboardCopy = t("dashboard");
  const launchParams = new URLSearchParams(window.location.search);
  const canvaCallback = launchParams.get("canva");
  const initialSection: SectionId = canvaCallback
    ? "media"
    : !launchParams.get("section")
      ? "brain"
      : sectionFromLocation();
  const [active, setActive] = useState<SectionId>(initialSection);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<JsonValue>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const loadedSectionRef = useRef<SectionId | null>(null);

  useEffect(() => {
    const onPopState = () => setActive(sectionFromLocation());
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "rf-push-navigate" && sections.some(([id]) => id === event.data.section)) go(event.data.section);
    };
    const onCommandCenterNavigate = (event: Event) => {
      const section = (event as CustomEvent<{ section?: string }>).detail?.section;
      if (section && sections.some(([id]) => id === section)) go(section as SectionId);
    };
    window.addEventListener("popstate", onPopState);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    window.addEventListener("command-center:navigate", onCommandCenterNavigate);
    return () => {
      window.removeEventListener("popstate", onPopState);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.removeEventListener("command-center:navigate", onCommandCenterNavigate);
    };
  });

  const current = useMemo(() => sections.find(([id]) => id === active)!, [active]);

  useEffect(() => {
    document.title = `${nav[current[0]]} · ${nav.dashboard}`;
  }, [current, nav]);

  useEffect(() => {
    const controller = new AbortController();
    const section = current[0];
    if (["archive", "dashboard", "today", "command", "brain", "workspace"].includes(section)) {
      setStatus("ready");
      loadedSectionRef.current = section;
      return () => controller.abort();
    }
    const backgroundRefresh = loadedSectionRef.current === section;
    if (!backgroundRefresh) {
      setStatus("loading");
      setError("");
    }
    callRpc(session, current[2], {}, controller.signal).then((result) => {
      setData(result);
      setStatus("ready");
      loadedSectionRef.current = section;
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const message = cause instanceof Error ? cause.message : "LOAD_FAILED";
      if (message === "SESSION_EXPIRED") onLogout();
      else if (!backgroundRefresh) {
        setError(dashboardCopy.loadError);
        setStatus("error");
      }
    });
    return () => controller.abort();
  }, [current, dashboardCopy.loadError, onLogout, reloadKey, session]);

  const modeLabel = ["planner", "crm", "inbox", "content", "media"].includes(active)
    ? dashboardCopy.controlledWrite
    : dashboardCopy.readOnly;

  const go = (requestedId: SectionId, replace = false) => {
    const id = normalizeOwnerSection(requestedId);
    setMoreOpen(false);
    setActive(id);
    const nextUrl = sectionUrl(id);
    if (replace) window.history.replaceState({ section: id }, "", nextUrl);
    else if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState({ section: id }, "", nextUrl);
  };

  // One owner-facing system: core destinations stay visible; lower-frequency tools live under More.
  const moreIds = ["today", "planner", "crm", "connections", "analytics", "radar", "archive", "workspace", "integrations"] as const;
  const moreLabel = language === "ar" ? "المزيد" : "More";
  const toggleMore = () => setMoreOpen(!moreOpen);
  const morePanel = <div className="more-panel">
    {moreIds.map((id) => <button key={id} onClick={() => go(id)}>
      {nav[id]}
    </button>)}
  </div>;

  const primary = [
    ["dashboard", LayoutDashboard, nav.dashboard],
    ["brain", Bot, nav.brain],
    ["content", Bot, nav.factory],
    ["inbox", Inbox, nav.inbox],
    ["media", Library, nav.media],
    ["automations", Workflow, nav.automations],
  ] as const;
  const renderPrimary = () => primary.map(([id, Icon, label]) => (
    <button key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => go(id)}>
      <Icon size={18} /><span>{label}</span>
    </button>
  ));

  return <div className="app-shell">
    <a className="skip-link" href="#main-workspace">{nav.skipToContent}</a>
      <aside>
      <div className="side-brand">
        <strong>Command Center Hub</strong>
        <span>{language === "ar" ? "مركز تشغيل السباحة" : "Swimming Academy OS"}</span>
        <small>{session.displayName} · {session.role}</small>
      </div>
      <LanguageSwitcher onDark />
        <nav aria-label="وحدات Command Center">
        <div className="nav-group">
          <span className="nav-group-label">{language === "ar" ? "التنقل الرئيسي" : "MAIN NAVIGATION"}</span>
          {renderPrimary()}
          <button aria-expanded={moreOpen} onClick={toggleMore}>
            <Settings2 size={18} /><span>{moreLabel}</span>
          </button>
        </div>
      </nav>
      <button type="button" className="logout" onClick={onLogout}><LogOut size={18} />{nav.logout}</button>
    </aside>

    <main className="workspace" id="main-workspace" tabIndex={-1}>
      <header className="owner-header">
        <div>
          <p className="eyebrow">{language === "ar" ? "مركز القيادة" : "OWNER COMMAND CENTER"}</p>
          <h1>{active === "content" ? nav.factory : active === "dashboard" ? nav.dashboard : nav[current[0]]}</h1>
        </div>
        <div className="owner-header-actions">
          <button type="button" className="refresh" disabled={status === "loading"} onClick={() => setReloadKey((value) => value + 1)}>{t("common").refresh}</button>
          <button type="button" className="logout mobile-logout" onClick={onLogout}><LogOut size={18} /></button>
        </div>
      </header>

      <section className="owner-status-strip">
        <span><i className="status-dot" />{language === "ar" ? "الوضع الآمن" : "Safe mode"}</span>
        <span>{modeLabel}</span>
      </section>

      {moreOpen && morePanel}

      <section className="panel owner-panel" aria-busy={status === "loading"}>
        {status === "loading" && <p className="muted" role="status">{t("common").loading}</p>}
        {status === "error" && <div className="error-box" role="alert">{error}</div>}
        {status === "ready" && (
          active === "dashboard" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><ControlTowerV2 key={`home-${reloadKey}`} session={session} onNavigate={(section) => { if (sections.some(([id]) => id === section)) go(section as SectionId); }} onSessionExpired={onLogout} /></Suspense> :
          active === "today" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><TodayView session={session} onNavigate={go} onSessionExpired={onLogout} /></Suspense> :
          active === "planner" ? <BookingView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /> :
          active === "crm" ? <CRMView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /> :
          active === "inbox" ? <AIInboxView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /> :
          active === "content" ? <ContentStudioView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} onOpenMedia={() => go("media")} onOpenBrain={() => go("brain")} /> :
          active === "media" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><MediaLibraryView value={data} session={session} canWrite={["super_admin", "admin", "content_manager"].includes(session.role)} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} onNavigate={(section) => { if (sections.some(([id]) => id === section)) go(section as SectionId); }} /></Suspense> :
          active === "archive" ? <Suspense><M /></Suspense> :
          active === "analytics" ? <AnalyticsView value={data} onNavigate={go} /> :
          active === "integrations" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><OperationsQueueView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /></Suspense> :
          active === "connections" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><IntegrationsCenter value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /></Suspense> :
          active === "automations" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><AutomationsView value={data} onOpenQueue={() => go("integrations")} onOpenContent={() => go("content")} /></Suspense> :
          active === "radar" ? <RadarView value={data} session={session} onChanged={() => setReloadKey((value) => value + 1)} onSessionExpired={onLogout} /> :
          active === "brain" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><CoachBrain language={language} onNavigate={(section) => { if (sections.some(([id]) => id === section)) go(section as SectionId); }} /></Suspense> :
          active === "workspace" ? <Suspense fallback={<p className="muted" role="status">{t("common").loading}</p>}><RealProductFoundation session={session} language={language} /></Suspense> :
          null
        )}
      </section>

      <nav className="owner-mobile-nav" aria-label={language === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
        {renderPrimary()}
        <button aria-expanded={moreOpen} onClick={toggleMore}>
          <Settings2 size={18} /><span>{moreLabel}</span>
        </button>
      </nav>
    </main>
  </div>;
}
function App() {
  const { language } = useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => { void registerServiceWorker(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    try {
      const raw = sessionStorage.getItem("relaxfix-command-session");
      if (!raw) { setRestoring(false); return () => controller.abort(); }
      const stored = StoredSessionSchema.parse(JSON.parse(raw));
      restoreSession(stored.accessToken, controller.signal).then((restored) => {
        if (controller.signal.aborted) return;
        sessionStorage.setItem("relaxfix-command-session", JSON.stringify({ accessToken: restored.accessToken }));
        setSession(restored);
      }).catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        sessionStorage.removeItem("relaxfix-command-session");
      }).finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    } catch { sessionStorage.removeItem("relaxfix-command-session"); setRestoring(false); }
    return () => controller.abort();
  }, []);
  if (restoring) return <main className="login-page"><p className="muted" role="status">{language === "ar" ? "جاري التحقق من الجلسة والموظف النشط..." : "Verifying session and active staff..."}</p></main>;
  if (!session) return <Login onAuthenticated={setSession} />;
  return <Dashboard session={session} onLogout={() => { sessionStorage.removeItem("relaxfix-command-session"); setSession(null); }} />;
}
createRoot(document.getElementById("root")!).render(<LanguageProvider><App /></LanguageProvider>);
