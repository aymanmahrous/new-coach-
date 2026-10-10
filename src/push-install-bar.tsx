import { useEffect, useState } from "react";
import type { Language } from "./i18n";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "./push";

type PushSession = { accessToken: string; role: string };
type Rpc = (name: string, body: Record<string, unknown>) => Promise<unknown>;

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

async function sendTestPushSelf(session: PushSession) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notifications`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "TEST_PUSH_SELF" }),
  });
  const result = (await response.json().catch(() => ({}))) as { success?: boolean; code?: string };
  if (!response.ok || !result.success) throw new Error(result.code ?? `TEST_PUSH_FAILED_${response.status}`);
}

export default function PushInstallBar({ session, language, rpc }: { session: PushSession; language: Language; rpc: Rpc }) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [installEvent, setInstallEvent] = useState<{ prompt: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (pushSupported()) getPushSubscription().then((sub) => setSubscribed(Boolean(sub))).catch(() => setSubscribed(false));
    else setSubscribed(false);
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as unknown as { prompt: () => void }); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function toggle() {
    setBusy(true); setError("");
    try {
      if (subscribed) { await disablePush(rpc); setSubscribed(false); }
      else { await enablePush(rpc); setSubscribed(true); }
    } catch {
      setError(language === "ar" ? "تعذر تنفيذ الإجراء بأمان." : "Couldn't complete this safely.");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setTestBusy(true); setTestResult("idle");
    try {
      await sendTestPushSelf(session);
      setTestResult("success");
    } catch {
      setTestResult("error");
    } finally { setTestBusy(false); }
  }

  return <div className="push-install-bar">
    {pushSupported() && subscribed !== null && (
      <button type="button" disabled={busy} onClick={() => void toggle()}>
        {subscribed ? (language === "ar" ? "إيقاف إشعارات الجوال" : "Disable phone notifications") : (language === "ar" ? "تفعيل إشعارات الجوال" : "Enable phone notifications")}
      </button>
    )}
    {session.role === "super_admin" && subscribed && (
      <button type="button" disabled={testBusy} onClick={() => void sendTest()}>
        إرسال إشعار تجريبي / Send test notification
      </button>
    )}
    {installEvent && (
      <button type="button" onClick={() => { installEvent.prompt(); setInstallEvent(null); }}>{language === "ar" ? "تثبيت التطبيق" : "Install Command Center"}</button>
    )}
    {testResult === "success" && <small className="operation-success">{language === "ar" ? "تم إرسال الإشعار التجريبي." : "Test notification sent."}</small>}
    {testResult === "error" && <small className="operation-error">{language === "ar" ? "تعذر إرسال الإشعار التجريبي." : "Couldn't send the test notification."}</small>}
    {error && <small className="operation-error">{error}</small>}
  </div>;
}
