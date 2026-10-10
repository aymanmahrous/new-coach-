import { lazy, Suspense, useEffect, useState } from "react";
import { BadgeCheck, BookOpen, BrainCircuit, Megaphone, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { Language } from "./i18n";
import "./real-product-foundation.css";

const KnowledgeManagement = lazy(() => import("./knowledge-management"));

type Session = { accessToken: string; displayName: string; role: string };
type Workspace = {
  knowledge: { entries: number; categories: number; skills: number; relationships: number };
  students: { progressRecords: number; badges: number; certificates: number };
  social: { reviewsPending: number; reviewsApproved: number; ctwaDrafts: number; metaSetupRequired: number };
  attribution: { events: number; status: "available" | "incomplete_data" };
  generatedAt: string;
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

async function loadWorkspace(session: Session, signal: AbortSignal): Promise<Workspace> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("SETUP_REQUIRED");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_staff_real_product_workspace`, {
    method: "POST",
    signal,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "SESSION_EXPIRED" : "LOAD_FAILED");
  return (await response.json()) as Workspace;
}

export default function RealProductFoundation({ session, language }: { session: Session; language: Language }) {
  const ar = language === "ar";
  const [data, setData] = useState<Workspace | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  const refresh = () => {
    const controller = new AbortController();
    setState("loading");
    loadWorkspace(session, controller.signal).then((value) => { setData(value); setState("ready"); }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error && cause.message === "SETUP_REQUIRED" ? (ar ? "إعداد Supabase مطلوب." : "Supabase setup required.") : (ar ? "تعذر تحميل مساحة المنتج بأمان." : "The product workspace could not be loaded securely."));
      setState("error");
    });
    return () => controller.abort();
  };

  useEffect(() => refresh(), [session.accessToken]);

  const cards = data ? [
    { icon: BookOpen, title: ar ? "المعرفة" : "Knowledge", values: [[ar ? "المداخل" : "Entries", data.knowledge.entries], [ar ? "التصنيفات" : "Categories", data.knowledge.categories], [ar ? "المهارات" : "Skills", data.knowledge.skills], [ar ? "العلاقات" : "Relationships", data.knowledge.relationships]] },
    { icon: BadgeCheck, title: ar ? "تقدم الطلاب" : "Student progress", values: [[ar ? "السجلات" : "Progress records", data.students.progressRecords], [ar ? "الشارات" : "Badges", data.students.badges], [ar ? "الشهادات" : "Certificates", data.students.certificates]] },
    { icon: Megaphone, title: ar ? "المراجعات وCTWA" : "Reviews + CTWA", values: [[ar ? "مراجعات معلقة" : "Pending reviews", data.social.reviewsPending], [ar ? "مراجعات معتمدة" : "Approved reviews", data.social.reviewsApproved], [ar ? "مسودات CTWA" : "CTWA drafts", data.social.ctwaDrafts], ["Meta", data.social.metaSetupRequired ? (ar ? "إعداد مطلوب" : "Setup required") : "Connected"]] },
    { icon: BrainCircuit, title: ar ? "الإسناد" : "Attribution", values: [[ar ? "الأحداث" : "Events", data.attribution.events], [ar ? "الحالة" : "Status", data.attribution.status === "available" ? (ar ? "متاح" : "Available") : (ar ? "بيانات غير مكتملة" : "Incomplete data")]] },
  ] : [];

  return <div className="real-product-workspace">
    <header className="real-product-hero">
      <div><span className="eyebrow">{ar ? "منتج حقيقي" : "REAL PRODUCT"}</span><h2>{ar ? "مساحة المنتج المتكاملة" : "Integrated product workspace"}</h2><p>{ar ? "حالة حقيقية من Supabase؛ لا بيانات وهمية ولا نشر تلقائي." : "Live Supabase state; no fake data and no automatic publishing."}</p></div>
      <div className="real-product-actions"><button type="button" className="refresh" onClick={refresh} disabled={state === "loading"}><RefreshCw size={16} /> {ar ? "تحديث" : "Refresh"}</button><button type="button" className="refresh" onClick={() => setKnowledgeOpen(true)}><BookOpen size={16} /> {ar ? "إدارة المعرفة" : "Manage Knowledge"}</button></div>
    </header>
    <div className="real-product-boundaries"><ShieldCheck size={18} /><span>{ar ? "RBAC + RLS + Audit Log" : "RBAC + RLS + Audit Log"}</span><span>{ar ? "Preview → Confirm → Execute" : "Preview → Confirm → Execute"}</span></div>
    {state === "loading" && <p className="muted" role="status">{ar ? "جاري تحميل الحالة الحقيقية..." : "Loading live product state..."}</p>}
    {state === "error" && <div className="error-box" role="alert">{error}</div>}
    {state === "ready" && <>
      <div className="real-product-grid">{cards.map(({ icon: Icon, title, values }) => <article className="real-product-card" key={title}><Icon size={20} /><h3>{title}</h3><dl>{values.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</div>
      <section className="real-product-next"><Sparkles size={18} /><div><strong>{ar ? "الخطوة التالية" : "Next safe step"}</strong><p>{data?.attribution.status === "incomplete_data" ? (ar ? "لا توجد توصية Attribution حتى تتوفر أحداث حقيقية مرتبطة." : "No attribution recommendation until real linked events exist.") : (ar ? "يمكن مراجعة الأحداث المرتبطة من النظام الحالي." : "Review linked events from the existing system.")}</p></div><Search size={18} aria-hidden="true" /></section>
      {data && <small className="real-product-updated">{ar ? "آخر قراءة" : "Last read"}: {new Date(data.generatedAt).toLocaleString(ar ? "ar-AE" : "en-US")}</small>}
    </>}
    {knowledgeOpen && <Suspense fallback={<p className="muted" role="status">{ar ? "جاري تحميل إدارة المعرفة..." : "Loading Knowledge management..."}</p>}><KnowledgeManagement session={session} language={language} onSessionExpired={() => setKnowledgeOpen(false)} /></Suspense>}
  </div>;
}
