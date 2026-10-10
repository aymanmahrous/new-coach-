import { useMemo, useState } from "react";
import { z } from "zod";
import { useLanguage } from "./i18n";
import type { Language } from "./i18n";
import { CANVA_OPEN_URL, canvaConnectErrorMessage, startCanvaConnect } from "./canva-adapter";
import { googleCalendarConnectErrorMessage, startGoogleCalendarConnect } from "./google-calendar-adapter";
import "./integrations-center.css";

type Role = "super_admin" | "admin" | "reception" | "coach" | "content_manager";
type Session = { accessToken: string; displayName: string; role: Role };
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type CapabilityState = "AVAILABLE" | "LIMITED" | "BLOCKED" | "NOT_CONFIGURED";
const URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const Item = z.object({ id: z.string().uuid(), provider: z.string(), connectionMethod: z.enum(["oauth", "api_key", "manual"]), status: z.enum(["not_connected", "pending", "connected", "needs_test", "error", "disabled"]), displayName: z.string(), accountLabel: z.string().nullable().optional(), secretHint: z.string().nullable().optional(), lastTestedAt: z.string().nullable().optional(), lastErrorCode: z.string().nullable().optional(), updatedAt: z.string() }).passthrough();
const Payload = z.object({ success: z.boolean(), items: z.array(Item).optional(), generatedAt: z.string().optional(), code: z.string().optional(), status: z.string().optional() }).passthrough();
const definitions: Record<string, { icon: string; description: Record<Language, string>; method: "oauth" | "api_key" | "manual" }> = {
  meta_whatsapp: { icon: "WA", method: "oauth", description: { ar: "رسائل العملاء وعمليات الاستلام عبر Meta WhatsApp المعتمد.", en: "Customer messages and intake through Meta WhatsApp." } },
  instagram: { icon: "IG", method: "oauth", description: { ar: "ربط حساب Instagram Business للنشر المعتمد.", en: "Connect an Instagram Business account for publishing." } },
  facebook: { icon: "FB", method: "oauth", description: { ar: "ربط صفحة Facebook لنشر المحتوى وإدارته.", en: "Connect a Facebook Page for content management." } },
  telegram: { icon: "TG", method: "manual", description: { ar: "تنبيهات الموظفين الداخلية (اختياري). محادثات العملاء تعمل عبر WhatsApp.", en: "Internal staff alerts (optional). Customer chats run via WhatsApp." } },
  google_calendar: { icon: "GC", method: "oauth", description: { ar: "قراءة المواعيد ومنع تعارض الحجوزات التدريبية.", en: "Read availability and prevent booking conflicts." } },
  canva: { icon: "CV", method: "oauth", description: { ar: "ربط التصاميم بالمنشورات. (موجز Canva الذكي متاح مجاناً دائماً).", en: "Link designs to posts. (Canva Smart Brief is always available)." } },
  ai_provider: { icon: "AI", method: "api_key", description: { ar: "محرك الذكاء الاصطناعي (Gemini Core) مهيأ ويعمل سحابياً. لا حاجة لمفتاح إضافي للتشغيل اليومي.", en: "System AI engine (Gemini Core) is configured and running server-side. No extra key needed." } },
};
const statusLabels: Record<Language, Record<string, string>> = { ar: { not_connected: "غير مربوط", pending: "جاري الربط", connected: "اجتاز اختبار الإعداد المحلي", needs_test: "يحتاج اختبار", error: "فشل", disabled: "متوقف" }, en: { not_connected: "Not connected", pending: "Pending", connected: "Local config test passed", needs_test: "Needs test", error: "Error", disabled: "Disabled" } };
const capabilityLabels: Record<Language, Record<CapabilityState, string>> = {
  ar: { AVAILABLE: "القدرة متاحة", LIMITED: "محدود — غير متحقق بالكامل", BLOCKED: "متوقف", NOT_CONFIGURED: "غير مهيأ" },
  en: { AVAILABLE: "Capability available", LIMITED: "Limited — not fully verified", BLOCKED: "Blocked", NOT_CONFIGURED: "Not configured" },
};
const capabilityNames: Record<string, Record<Language, string>> = {
  canva: { ar: "إنشاء التصاميم", en: "Design generation" },
  instagram: { ar: "نشر Instagram", en: "Instagram publishing" },
  facebook: { ar: "نشر Facebook", en: "Facebook publishing" },
  n8n: { ar: "تشغيل أتمتة المحتوى", en: "Content automation" },
  runway: { ar: "توليد الفيديو", en: "Video generation" },
  buffer: { ar: "الجدولة الخارجية", en: "External scheduling" },
  tiktok: { ar: "نشر TikTok", en: "TikTok publishing" },
  telegram: { ar: "تنبيهات الموظفين", en: "Staff notifications" },
  meta_whatsapp: { ar: "رسائل WhatsApp عبر Meta", en: "Meta WhatsApp messaging" },
  google_calendar: { ar: "قراءة تقويم Google", en: "Google Calendar access" },
  ai_provider: { ar: "مزود الذكاء الاصطناعي", en: "AI provider" },
};
function capabilityState(status: z.infer<typeof Item>["status"], lastTestedAt?: string | null): CapabilityState {
  if (status === "not_connected") return "NOT_CONFIGURED";
  if (status === "error" || status === "disabled") return "BLOCKED";
  if (status === "connected" && lastTestedAt) return "AVAILABLE";
  if (status === "connected" || status === "needs_test" || status === "pending") return "LIMITED";
  return "LIMITED";
}
function capabilityDetail(language: Language, state: CapabilityState, provider: string): string {
  const name = capabilityNames[provider]?.[language] ?? (language === "ar" ? "القدرة المطلوبة" : "Requested capability");
  if (state === "NOT_CONFIGURED") return language === "ar" ? `${name}: لا يوجد إعداد صالح.` : `${name}: no usable configuration.`;
  if (state === "BLOCKED") return language === "ar" ? `${name}: متوقف حتى معالجة الخطأ أو إعادة التفعيل.` : `${name}: blocked until the error is resolved or re-enabled.`;
  return language === "ar" ? `${name}: الإعداد موجود، لكن التشغيل الخارجي لم يُتحقق منه.` : `${name}: configuration exists, but external operation is not verified.`;
}
function rpcHeaders(session: Session) { return { apikey: KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
async function rpc(session: Session, name: string, body: Record<string, unknown> = {}) { const response = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: "POST", headers: rpcHeaders(session), body: JSON.stringify(body), cache: "no-store" }); if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED"); if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`); return Payload.parse(await response.json()); }
function message(language: Language, code?: string) { const map: Record<string, Record<Language, string>> = { SECRET_TOO_SHORT: { ar: "القيمة قصيرة جدًا. استخدم قيمة صالحة.", en: "The value is too short. Enter a valid credential." }, CREDENTIAL_REQUIRED: { ar: "أدخل قيمة الربط أولًا.", en: "Enter the connection value first." }, STAFF_ACCESS_DENIED: { ar: "ليس لديك صلاحية إدارة التكاملات.", en: "You do not have integration-management access." }, CONNECTION_CONFIGURED: { ar: "تم اختبار الإعداد بنجاح. لم يتم استدعاء مزود خارجي بعد.", en: "Configuration passed the local safety test. No external provider was called." } }; return (code && map[code]?.[language]) || (language === "ar" ? `لم يكتمل الإجراء: ${code ?? "خطأ غير معروف"}` : `Action not completed: ${code ?? "Unknown error"}`); }

export default function IntegrationsCenter({ value, session, onChanged, onSessionExpired }: { value: JsonValue; session: Session; onChanged: () => void; onSessionExpired: () => void }) {
  const { language } = useLanguage();
  const parsed = useMemo(() => Payload.safeParse(value), [value]);
  const [selected, setSelected] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const items = parsed.success ? (parsed.data.items ?? []) : [];
  const canWrite = ["super_admin", "admin", "content_manager"].includes(session.role);
  async function action(name: string, body: Record<string, unknown>) { setBusy(name); setNotice(""); try { const result = await rpc(session, name, body); if (!result.success) throw new Error(result.code ?? "ACTION_REJECTED"); setNotice(message(language, result.code)); setSelected(null); setSecret(""); setAccount(""); onChanged(); } catch (cause) { if (cause instanceof Error && cause.message === "SESSION_EXPIRED") { onSessionExpired(); return; } setNotice(message(language, cause instanceof Error ? cause.message : "ACTION_FAILED")); } finally { setBusy(null); } }
  async function connectOAuth(provider: string) {
    setBusy(provider); setNotice("");
    try {
      if (provider === "google_calendar") {
        const { authorizationUrl } = await startGoogleCalendarConnect(session);
        window.location.assign(authorizationUrl);
        return;
      }
      if (provider === "facebook") {
        const current = items.find((item) => item.provider === provider);
        if (current?.status === "needs_test" || current?.status === "connected") {
          const response = await fetch(`${URL}/functions/v1/meta-provider-status`, {
            method: "POST",
            headers: rpcHeaders(session),
            body: JSON.stringify({ provider }),
            cache: "no-store",
          });
          const result = await response.json().catch(() => ({}));
          if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
          if (!response.ok || !result.success) throw new Error(String(result.code ?? "META_EXTERNAL_TEST_FAILED"));
          setNotice(language === "ar" ? `تم التحقق من Facebook خارجيًا: ${result.accountLabel ?? "الصفحة"}.` : `Facebook verified externally: ${result.accountLabel ?? "page"}.`);
          onChanged();
          return;
        }
        const response = await fetch(`${URL}/functions/v1/facebook-oauth`, {
          method: "POST",
          headers: rpcHeaders(session),
          body: JSON.stringify({ mode: "authorize" }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
        if (!response.ok || !result.success || !result.authorizationUrl) throw new Error(String(result.code ?? "FACEBOOK_AUTHORIZE_FAILED"));
        window.location.assign(String(result.authorizationUrl));
        return;
      }
      if (provider === "instagram" || provider === "meta_whatsapp") {
        const current = items.find((item) => item.provider === provider);
        if (provider === "instagram" && current?.status === "not_connected") {
          const response = await fetch(`${URL}/functions/v1/facebook-oauth`, {
            method: "POST",
            headers: rpcHeaders(session),
            body: JSON.stringify({ mode: "authorize" }),
            cache: "no-store",
          });
          const result = await response.json().catch(() => ({}));
          if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
          if (!response.ok || !result.success || !result.authorizationUrl) throw new Error(String(result.code ?? "FACEBOOK_AUTHORIZE_FAILED"));
          window.location.assign(String(result.authorizationUrl));
          return;
        }
        const response = await fetch(`${URL}/functions/v1/meta-provider-status`, {
          method: "POST",
          headers: rpcHeaders(session),
          body: JSON.stringify({ provider }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
        if (!response.ok || !result.success) throw new Error(String(result.code ?? "META_EXTERNAL_TEST_FAILED"));
        setNotice(language === "ar" ? `تم التحقق من ${result.accountLabel ?? "Meta"} خارجيًا وربطه بحالة المركز.` : `Meta connection verified externally: ${result.accountLabel ?? "connected"}.`);
        onChanged();
        return;
      }
      if (provider !== "canva") {
        setNotice(language === "ar"
          ? "هذا الربط يحتاج تهيئة OAuth داخلية مرة واحدة. لا تدخل Token أو مفتاحًا هنا."
          : "This OAuth connection needs one-time internal setup. Do not enter a token or key here.");
        return;
      }
      const { authorizationUrl } = await startCanvaConnect(session);
      window.location.assign(authorizationUrl);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") { onSessionExpired(); return; }
      const code = cause instanceof Error ? cause.message.replace(/^CANVA_/, "") : undefined;
      setNotice(provider === "google_calendar" ? (language === "ar" ? googleCalendarConnectErrorMessage(code) : `Google Calendar OAuth could not start (${code ?? "unknown"}).`) : canvaConnectErrorMessage(code, language));
    } finally { setBusy(null); }
  }
  function open(provider: string) { setSelected(provider); setSecret(""); setAccount(""); setNotice(""); }
  if (!parsed.success) return <div className="error-box">{language === "ar" ? "بيانات التكاملات غير متوافقة؛ لم يتم تنفيذ أي إجراء." : "Integration data is incompatible; no action was performed."}</div>;
  return <div className="integration-center">
    <div className="integration-intro"><div><p className="eyebrow">{language === "ar" ? "مركز الاتصالات" : "CONNECTION CENTER"}</p><h2>{language === "ar" ? "اربط الخدمات من داخل التطبيق" : "Connect services inside the app"}</h2><p>{language === "ar" ? "القيم السرية تُحفظ في الخادم ولا تظهر كاملة للواجهة. زر الاختبار الحالي يتحقق من الإعداد فقط، ولا ينفذ نشرًا أو رسالة خارجية." : "Secrets are stored server-side and never returned in full. The current test validates configuration only; it does not publish or send externally."}</p></div><span className="integration-safety">{language === "ar" ? "محمية + سجل تدقيق" : "Protected + audited"}</span></div>
    {notice && <div className="integration-notice" role="status" aria-live="polite">{notice}</div>}
    <div className="integration-grid">{items.map((item) => { const definition = definitions[item.provider] ?? { icon: "?", method: "manual" as const, description: { ar: "تكامل إضافي.", en: "Additional integration." } }; const status = item.lastTestedAt ? (language === "ar" ? "تم التحقق وظيفيًا" : "Functionally verified") : (statusLabels[language][item.status] ?? item.status); const state = capabilityState(item.status, item.lastTestedAt); return <article className="integration-card" key={item.provider}><header><span className="integration-icon">{definition.icon}</span><div><h3>{item.displayName}</h3><p>{definition.description[language]}</p></div><span className={`integration-status status-${item.status}`}>{status}</span></header><div className={`integration-capability capability-${state.toLowerCase()}`}><strong>{capabilityLabels[language][state]}</strong><span>{capabilityDetail(language, state, item.provider)}</span></div><dl><div><dt>{language === "ar" ? "طريقة الربط" : "Method"}</dt><dd>{item.provider === "instagram" || item.provider === "meta_whatsapp" ? "Meta server connection" : item.connectionMethod === "api_key" ? "API Key" : item.connectionMethod === "oauth" ? "OAuth" : language === "ar" ? "إعداد داخلي" : "Internal setup"}</dd></div><div><dt>{language === "ar" ? "الحساب" : "Account"}</dt><dd>{item.accountLabel || (language === "ar" ? "غير محدد" : "Not set")}</dd></div><div><dt>{language === "ar" ? "القيمة" : "Credential"}</dt><dd>{item.secretHint || "—"}</dd></div></dl><footer>{canWrite && ["not_connected", "disabled", "pending"].includes(item.status) && <><button type="button" disabled={busy === item.provider} onClick={() => item.connectionMethod === "oauth" ? void connectOAuth(item.provider) : open(item.provider)}>{busy === item.provider ? (language === "ar" ? "جاري الربط" : "Connecting") : language === "ar" ? (item.status === "disabled" ? "إعادة الربط" : item.provider === "instagram" || item.provider === "meta_whatsapp" ? "فحص وربط" : item.connectionMethod === "oauth" ? "اتصال آمن" : "إعداد") : (item.status === "disabled" ? "Reconnect" : item.provider === "instagram" || item.provider === "meta_whatsapp" ? "Verify & connect" : item.connectionMethod === "oauth" ? "Secure connect" : "Setup")}</button>{item.provider === "canva" && <a className="secondary" href={CANVA_OPEN_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem" }}>{language === "ar" ? "فتح Canva يدوياً" : "Open Canva"}</a>}</>}{canWrite && ["connected", "needs_test", "error"].includes(item.status) && <><button type="button" disabled={busy === item.provider} onClick={() => ((item.provider === "facebook" || item.provider === "instagram") ? void connectOAuth(item.provider) : void action("test_staff_integration", { p_provider: item.provider }))}>{item.provider === "facebook" || item.provider === "instagram" ? (language === "ar" ? "فحص الاتصال الخارجي" : "Verify external connection") : (language === "ar" ? "اختبار الإعداد المحلي" : "Test local configuration")}</button><button type="button" className="secondary" onClick={() => open(item.provider)}>{language === "ar" ? "تعديل" : "Edit"}</button><button type="button" className="danger" onClick={() => { if (window.confirm(language === "ar" ? "سيتم حذف سر الربط وتعطيل التكامل. هل تتابع؟" : "The stored credential will be removed and the integration disabled. Continue?")) void action("disconnect_staff_integration", { p_provider: item.provider }); }}>{language === "ar" ? "تعطيل" : "Disable"}</button></>}</footer></article>; })}</div>
    {selected && items.find((item) => item.provider === selected)?.connectionMethod !== "oauth" && <div className="integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title"><div className="integration-modal-card"><header><div><p className="eyebrow">{language === "ar" ? "إعداد آمن" : "SECURE SETUP"}</p><h2 id="integration-dialog-title">{items.find((item) => item.provider === selected)?.displayName}</h2></div><button type="button" className="modal-close" onClick={() => setSelected(null)}>×</button></header><p>{selected === "ai_provider" ? (language === "ar" ? "محرك Gemini مهيأ مركزياً في الخادم لتشغيل Coach Brain ومصنع المحتوى. إدخال مفتاح هنا اختياري لمزود بديل فقط." : "Gemini AI is centrally configured server-side for Coach Brain and Factory. Entering a key here is optional for alternative providers.") : (language === "ar" ? "أدخل القيمة من مزود الخدمة. لن تظهر القيمة بعد الحفظ، وسيظهر آخر أربعة رموز فقط." : "Enter the provider value. It will not be shown after saving; only the last four characters are displayed.")}</p><label>{language === "ar" ? "القيمة السرية / Token" : "Secret value / Token"}<input type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={language === "ar" ? "أدخل القيمة هنا" : "Enter value here"} /></label><label>{language === "ar" ? "اسم الحساب (اختياري)" : "Account label (optional)"}<input value={account} onChange={(event) => setAccount(event.target.value)} placeholder={language === "ar" ? "مثال: Relax Fix UAE" : "e.g. Relax Fix UAE"} /></label><div className="integration-modal-actions"><button type="button" className="secondary" onClick={() => setSelected(null)}>{language === "ar" ? "إلغاء" : "Cancel"}</button><button type="button" disabled={!secret.trim() || busy === selected} onClick={() => void action("connect_staff_integration", { p_provider: selected, p_connection_method: definitions[selected]?.method ?? "manual", p_secret: secret, p_account_label: account })}>{busy === selected ? (language === "ar" ? "جاري الحفظ" : "Saving") : (language === "ar" ? "حفظ الاعتماد" : "Save credential")}</button></div><small>{language === "ar" ? "لا تدخل بيانات تسجيل الدخول أو أسرار مزود الخدمة في هذه الواجهة. OAuth يتم من خلال صفحة المزود عندما يكون الربط مهيأ." : "Do not enter provider login credentials or OAuth secrets here. OAuth runs on the provider page when the connection is configured."}</small></div></div>}
  </div>;
}
