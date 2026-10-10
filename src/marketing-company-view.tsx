import { useMemo, useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, Layers3, Sparkles, Trash2 } from "lucide-react";
import type { GeneratedBatchItem } from "./content-batch-generator";
import "./marketing-company.css";

type Session = { accessToken: string; role: string };
type Props = { session: Session; onChanged: () => void; onSessionExpired: () => void };
type Proposal = "trust" | "conversion";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const proposalCopy = {
  trust: {
    title: "بناء الثقة والتعليم",
    summary: "محتوى مفيد يجعل الأهل يرون خبرتك قبل أن يقرروا التواصل.",
    days: ["معلومة عن التنفس", "خطأ شائع عند الأطفال", "فيديو تمرين الطفو", "تحذير للسلامة", "سؤال تفاعلي", "نصيحة للأهل", "تصحيح حركة", "كيف يختار الأهل مدربًا؟", "قصة تعليمية", "دعوة هادئة للتواصل"],
  },
  conversion: {
    title: "التعليم مع جذب التسجيلات",
    summary: "مزيج متوازن من التعليم والثقة ودعوات التواصل دون إعلانات متكررة.",
    days: ["مشكلة الطفل مع الماء", "حل بسيط للأهل", "فيديو تصحيح خطأ", "تجربة تدريبية", "سؤال للأهل", "معلومة سلامة", "فرق التدريب المنظم", "إجابة عن اعتراض", "نصيحة قبل التسجيل", "دعوة لتقييم الطفل"],
  },
} as const;

function rpcHeaders(session: Session): HeadersInit {
  return { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Accept: "application/json" };
}
async function createBatch(session: Session, items: GeneratedBatchItem[], providerExternalId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_staff_generated_content_batch`, {
    method: "POST",
    headers: rpcHeaders(session),
    body: JSON.stringify({ p_items: items, p_provider_external_id: providerExternalId }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return response.json() as Promise<{ success?: boolean; code?: string }>;
}
function dateLabel(date: Date): string { return new Intl.DateTimeFormat("ar-AE", { day: "numeric", month: "short" }).format(date); }

export default function MarketingCompanyView({ session, onChanged, onSessionExpired }: Props) {
  const [proposal, setProposal] = useState<Proposal>("trust");
  const [draft, setDraft] = useState<GeneratedBatchItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const days = proposalCopy[proposal].days;
  const start = useMemo(() => { const today = new Date(); today.setHours(0, 0, 0, 0); return today; }, []);

  async function prepare() {
    if (busy || draft) return;
    setBusy(true); setNotice("");
    try {
      const { buildCoachAyman2026BatchItems } = await import("./content-batch-generator");
      const generated = await buildCoachAyman2026BatchItems(start, `owner-cycle-${start.toISOString().slice(0, 10)}-${proposal}`);
      setDraft(generated.slice(0, 10));
      setNotice("تم تجهيز المقترح للمراجعة فقط. لم يتم إنشاء دفعة أو جدولة أي شيء.");
    } catch { setNotice("تعذر تجهيز المقترح. لم يتم تغيير أي شيء."); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!draft || busy) return;
    setBusy(true); setNotice("");
    try {
      const { COACH_AYMAN_PROVIDER_ID } = await import("./content-batch-generator");
      const result = await createBatch(session, draft, COACH_AYMAN_PROVIDER_ID);
      if (result.code === "CONTENT_SLOT_ALREADY_PLANNED") throw new Error(result.code);
      if (result.success === false) throw new Error(result.code || "BATCH_REJECTED");
      setNotice("تم اعتماد خطة العشرة أيام ووضعها للمراجعة. لم يتم النشر تلقائيًا.");
      setDraft(null);
      onChanged();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "SESSION_EXPIRED") { onSessionExpired(); return; }
      setNotice(cause instanceof Error && cause.message === "CONTENT_SLOT_ALREADY_PLANNED" ? "يوجد محتوى لنفس الأيام بالفعل؛ أوقفت العملية لمنع التكرار." : "لم يتم اعتماد الخطة. لم يتغير المحتوى الحالي.");
    } finally { setBusy(false); }
  }
  function reject() { setDraft(null); setNotice("تم رفض المقترح فقط. لا توجد خطة جديدة أو جدولة معلقة."); }
  function remove() { setDraft(null); setNotice("تم حذف المقترح غير المعتمد من هذه الشاشة. لم يتم حذف أي أصل محفوظ."); }

  return <div className="marketing-company" dir="rtl">
    <header className="marketing-company-hero">
      <div><p className="eyebrow">شركة التسويق</p><h2>خطة السباحة الجاهزة للقرار</h2><p>التطبيق يجهز لك خطة متنوعة لمدة عشرة أيام. أنت توافق أو ترفض أو تحذف، والباقي يتم داخل النظام.</p></div>
      <div className="marketing-company-mark"><Sparkles size={22} /><span>دورة واحدة<br />بدون تكرار</span></div>
    </header>
    <section className="marketing-company-proposals" aria-labelledby="proposal-heading">
      <div className="marketing-company-section-heading"><div><p className="eyebrow">الاختيار الوحيد المطلوب منك</p><h3 id="proposal-heading">اختر اتجاه خطة العشرة أيام</h3></div><Layers3 size={24} /></div>
      <div className="marketing-proposal-grid">{(["trust", "conversion"] as Proposal[]).map((key) => <button type="button" key={key} className={`marketing-proposal-card ${proposal === key ? "selected" : ""}`} onClick={() => { setProposal(key); setDraft(null); setNotice(""); }}><span>{key === "trust" ? "المقترح 1" : "المقترح 2"}</span><strong>{proposalCopy[key].title}</strong><p>{proposalCopy[key].summary}</p><b>{proposal === key ? "محدد" : "اختيار هذا المقترح"}</b></button>)}</div>
      {!draft ? <button type="button" className="marketing-primary-action" disabled={busy} onClick={() => void prepare()}>{busy ? "جاري تجهيز المقترح..." : "عرض خطة العشرة أيام"}<ChevronLeft size={18} /></button> : <div className="marketing-plan-review"><div className="marketing-review-head"><div><p className="eyebrow">مقترح غير معتمد</p><h3>{proposalCopy[proposal].title}</h3><p>{notice}</p></div><button type="button" className="icon-action" onClick={remove} aria-label="حذف المقترح"><Trash2 size={18} /></button></div><ol className="marketing-days">{days.map((day, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return <li key={`${proposal}-${index}`}><span className="marketing-day-number">{index + 1}</span><div><strong>{day}</strong><small>{dateLabel(date)} · {draft[index]?.contentType === "reel" ? "فيديو قصير" : draft[index]?.contentType === "carousel" ? "تصميم متعدد" : "منشور تعليمي"}</small></div><Check size={16} /></li>; })}</ol><div className="marketing-review-actions"><button type="button" className="secondary" disabled={busy} onClick={reject}>غير موافق — أعد الاقتراح</button><button type="button" className="marketing-primary-action compact" disabled={busy} onClick={() => void approve()}>{busy ? "جاري الاعتماد..." : "موافق على الخطة"}<Check size={18} /></button></div></div>}
    </section>
    <section className="marketing-company-footer"><Archive size={18} /><p><strong>الحماية مفعلة:</strong> لا نشر تلقائي، لا حذف للملفات المحفوظة، ولا دفعة جديدة قبل اعتمادك. التكرار يُرفض من النظام.</p></section>
  </div>;
}
