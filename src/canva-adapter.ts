const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
export const CANVA_OPEN_URL = "https://www.canva.com/";

export type CanvaIntegrationStatus = "CONNECTED" | "NOT CONNECTED";

type CanvaSession = { accessToken: string };

type CanvaEdgeResponse = {
  success?: boolean;
  connected?: boolean;
  integrationStatus?: CanvaIntegrationStatus;
  credentialsConfigured?: boolean;
  detail?: string;
  authorizationUrl?: string;
  openUrl?: string;
  code?: string;
};

async function callCanvaOAuthEdge(session: CanvaSession, body: Record<string, unknown>): Promise<CanvaEdgeResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/canva-oauth`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as CanvaEdgeResponse;
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(String(payload.code ?? `CANVA_EDGE_HTTP_${response.status}`));
  return payload;
}

export async function fetchCanvaIntegrationStatus(session: CanvaSession): Promise<{
  connected: boolean;
  integrationStatus: CanvaIntegrationStatus;
  detail: string;
  openUrl: string;
}> {
  try {
    const result = await callCanvaOAuthEdge(session, { mode: "status" });
    const connected = result.connected === true;
    return {
      connected,
      integrationStatus: connected ? "CONNECTED" : "NOT CONNECTED",
      detail: result.detail ?? (connected ? "Canva connected." : "Canva optional — not connected."),
      openUrl: result.openUrl ?? CANVA_OPEN_URL,
    };
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SESSION_EXPIRED") throw cause;
    return {
      connected: false,
      integrationStatus: "NOT CONNECTED",
      detail: cause instanceof Error && cause.message !== "Failed to fetch" ? `Canva status request failed (${cause.message}).` : "Canva status request could not reach the server.",
      openUrl: CANVA_OPEN_URL,
    };
  }
}

export function canvaConnectErrorMessage(code: string | undefined, language: "ar" | "en" = "en"): string {
  const isAr = language === "ar";
  const normalized = (code ?? "").trim();
  if (normalized === "NEEDS_CREDENTIAL" || normalized === "CANVA_NEEDS_CREDENTIAL" || normalized.startsWith("CANVA_EDGE_HTTP_424")) {
    return isAr
      ? "ربط Canva البرمجي غير مهيأ على الخادم حالياً (يحتاج تطبيق مطور). يمكنك استخدام خيار فتح Canva يدوياً وتطبيق موجز التصميم بدون أي تكلفة إضافية."
      : "Canva OAuth is not configured on the server yet. Use Open Canva manually — connection is optional.";
  }
  if (normalized === "Load failed" || normalized === "Failed to fetch" || normalized.includes("NETWORK")) {
    return isAr
      ? "تعذر الاتصال بخادم ربط Canva التلقائي (يتطلب إعداد تطبيق مطور). يمكنك فتح Canva يدوياً مجاناً واستخدام موجز التصميم الجاهز."
      : "Canva connection could not reach the server (developer app required). Use Open Canva manually — connection is optional.";
  }
  if (normalized === "METHOD_NOT_ALLOWED") {
    return isAr
      ? "تم فتح رابط Canva بشكل غير صحيح. استخدم زر الربط داخل مكتبة الوسائط، وليس رابط الخادم المباشر."
      : "Canva link opened incorrectly. Use the Connect Canva button inside Media Library, not the server URL.";
  }
  if (normalized === "AUTH_REQUIRED" || normalized === "STAFF_ACCESS_DENIED") {
    return isAr
      ? "جلستك الحالية لا تملك صلاحية تفويض Canva. يرجى تسجيل الدخول بحساب مدير محتوى."
      : "Your session cannot authorize Canva. Sign in again with a content manager account.";
  }
  if (normalized === "STATE_STORE_FAILED" || normalized === "STATE_NOT_FOUND" || normalized === "STATE_EXPIRED") {
    return isAr
      ? "انتهت صلاحية جلسة تفويض Canva. يرجى المحاولة مرة أخرى."
      : "Canva authorization expired. Click Connect Canva again.";
  }
  if (normalized === "TOKEN_EXCHANGE_FAILED" || normalized === "TOKEN_RESPONSE_INVALID") {
    return isAr
      ? "وافقت Canva على الوصول ولكن فشل تبادل الرمز. تأكد في بوابة المطورين من ضبط رابط إعادة التوجيه بالضبط على: https://nmzxrjdxvmmzzmajrskm.supabase.co/functions/v1/canva-oauth"
      : "Canva approved access but token exchange failed. In Canva Developer Portal, set Redirect URI exactly to: https://nmzxrjdxvmmzzmajrskm.supabase.co/functions/v1/canva-oauth — then click Connect Canva again.";
  }
  if (normalized === "TOKEN_STORE_FAILED") {
    return isAr
      ? "تمت الموافقة من Canva لكن فشل حفظ رمز الدخول. حاول الاتصال مرة أخرى."
      : "Canva approved the link but storing the token failed. Try Connect Canva once more.";
  }
  if (normalized === "USE_CONNECT_BUTTON") {
    return isAr
      ? "استخدم زر الربط داخل التطبيق فقط — لا تفتح رابط Supabase مباشرة."
      : "Use Connect Canva inside Media Library only — do not open the Supabase server link directly. Click the button, approve in Canva, and wait for automatic return.";
  }
  return isAr
    ? (code ? `تعذر بدء ربط Canva تلقائياً (${code}). يمكنك فتح Canva وتصميم المحتوى يدوياً.` : "تعذر بدء ربط Canva التلقائي. يستمر المركز بالعمل بدون الحاجة لـ Canva.")
    : (code ? `Canva connection failed (${code}). Command Center continues without Canva.` : "Could not start Canva OAuth safely. Command Center continues without Canva.");
}

export async function startCanvaConnect(session: CanvaSession): Promise<{ authorizationUrl: string }> {
  const result = await callCanvaOAuthEdge(session, { mode: "authorize" });
  if (result.code === "NEEDS_CREDENTIAL") {
    throw new Error("CANVA_NEEDS_CREDENTIAL");
  }
  if (!result.success || !result.authorizationUrl) {
    throw new Error(result.code ?? "CANVA_AUTHORIZE_FAILED");
  }
  return { authorizationUrl: result.authorizationUrl };
}

export function readCanvaCallbackNotice(search: string): "connected" | "error" | null {
  const params = new URLSearchParams(search);
  const canva = params.get("canva");
  if (canva === "connected") return "connected";
  if (canva === "error") return "error";
  return null;
}
