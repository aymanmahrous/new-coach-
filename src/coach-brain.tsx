import { FormEvent, useState } from "react";
import { AlertTriangle, BookOpen, Brain, Search, ShieldCheck, Sparkles } from "lucide-react";
import { buildCoachBrainSummaryRequest } from "./coach-brain-conversation";
import { generateCoachAymanSampleWithProvider, type BatchAiProvider, type GeminiBatchPromptContext, type GeneratedContentSample } from "./gemini-batch-adapter";
import "./coach-brain.css";

type Source = { title: string; url: string };
type ResearchUsage = {
  requestedModel: string;
  modelVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  toolUsePromptTokens: number | null;
  groundingSearchQueries: number | null;
  estimatedTokenCostUsd: number | null;
  pricingStatus: "estimated" | "unavailable";
  pricingAsOf: string;
  pricingEffectiveFrom: string | null;
  pricingEffectiveThrough: string | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  pricingSource: string;
  groundingFeeIncluded: false;
  groundingQuotaStatus: "unknown";
};
type ResearchResult = { question: string; answer: string; isSummary: boolean; sources: Source[]; searchQueries?: string[]; usage: ResearchUsage | null };

const copy = {
  ar: {
    title: "Coach Brain",
    subtitle: "ابحث عن أفضل طرق التدريب والتعليم من الأدلة الحديثة",
    privacy: "اكتب سؤالك فقط. لا يتم إنشاء ملف للسباح أو حفظ بيانات الأطفال.",
    placeholder: "مثال: سباح عمره 12 سنة، 100م حرة في 45 ثانية. كيف أطور السرعة؟ هل أركز على الاستارت أم الدوران؟ وما التدريبات والأدوات المناسبة؟",
    search: "ابحث وحلل",
    searching: "جاري البحث في المصادر وتحليلها...",
    direct: "الإجابة البحثية",
    sources: "المصادر التي اعتمد عليها البحث",
    evidence: "الأدلة",
    safety: "السلامة",
    usageTitle: "استخدام Gemini والتكلفة التقديرية",
    inputTokens: "رموز الإدخال",
    responseTokens: "رموز الإجابة والتفكير",
    totalTokens: "إجمالي الرموز",
    searchQueries: "عمليات بحث Google",
    usageEstimate: "تقدير رموز النموذج (مرجع السعر المدفوع)",
    usageUnavailable: "التكلفة التقديرية غير متاحة؛ لم تصل بيانات استخدام كافية من المزود.",
    usageCaveat: "هذا تقدير وليس فاتورة. لا يشمل رسوم Google Search؛ لا نعرف الحصة الشهرية المتبقية أو فئة الفوترة من هذه الشاشة.",
    searchUsageUnknown: "غير متاحة",
    modelLabel: "النموذج",
    pricingSource: "مصدر السعر الرسمي",
    rateAsOf: "مرجع السعر بتاريخ",
    empty: "اكتب أي سؤال عن السباحة أو التدريب أو التقنية أو الاستارت أو الدوران أو الأدوات.",
    actionsTitle: "ماذا تريد أن تفعل؟",
    actionsHint: "اختر مهمة جاهزة بدل كتابة سؤال من الصفر.",
    actions: ["جهز لي خطة محتوى 10 أيام", "أعطني أفكارًا متنوعة لمحتوى السباحة", "جهز لي تصميم صورة", "جهز لي تصميم فيديو", "راجع هذا النص وحسّنه", "لخّص هذه المحادثة واقترح الخطوة التالية"],
    summaryPrompt: "لخّص إجابة البحث الأخيرة واقترح خطوة عملية تالية.", designImagePrompt: "أريد تصميم صورة تسويقية للسباحة. جهز لي Brief واضحًا للتصميم واقترح أفضل مزود متصل ومتحقق، ثم أعطني بدائل حقيقية يمكنني اختيارها بحرية.", designVideoPrompt: "أريد تصميم فيديو قصير للسباحة. جهز لي Brief واضحًا للفيديو واقترح أفضل مزود متصل ومتحقق، ثم أعطني بدائل حقيقية يمكنني اختيارها بحرية.",
    error: "تعذر تنفيذ البحث الآن. لم يتم حفظ السؤال أو إنشاء أي بيانات.",
    privacyNote: "البحث يتم عبر خادم آمن، ومفتاح Gemini لا يصل إلى الهاتف.",
    examples: [
      "طفل يخاف من الماء وعنده صعوبات انتباه، كيف أبدأ تدريبه تدريجيًا؟",
      "سباح 12 سنة، كيف أطور تكنيك وانسيابية 100م حرة وفق الأدلة؟",
      "تكييف بيئة درس السباحة لمتعلم من طيف التوحد دون تشخيص طبي؟",
      "متدرب بالغ يعاني من ألم في الكتف، ما الحدود الآمنة للتدريب المائي؟",
    ],
  },
  en: {
    title: "Coach Brain",
    subtitle: "Research the best current coaching and teaching methods",
    privacy: "Write the question only. No swimmer or child profile is created or stored.",
    placeholder: "Example: 12-year-old swimmer, 100m freestyle in 45s. How should I improve speed? Start, turn, drills and equipment?",
    search: "Research & analyze",
    searching: "Searching sources and analyzing the evidence...",
    direct: "Research answer",
    sources: "Sources used by the research",
    evidence: "Evidence",
    safety: "Safety",
    usageTitle: "Gemini usage & estimated cost",
    inputTokens: "Input tokens",
    responseTokens: "Answer and thinking tokens",
    totalTokens: "Total tokens",
    searchQueries: "Google Search queries",
    usageEstimate: "Estimated model-token cost (published paid-tier reference)",
    usageUnavailable: "Cost estimate unavailable because the provider did not return enough usage data.",
    usageCaveat: "Estimate only, not an invoice. Google Search fees are excluded; this screen cannot see the monthly quota remaining or billing tier.",
    searchUsageUnknown: "Not returned",
    modelLabel: "Model",
    pricingSource: "Official pricing source",
    rateAsOf: "Pricing reference date",
    empty: "Ask any swimming, coaching, technique, start, turn, training or equipment question.",
    actionsTitle: "What do you want to do?",
    actionsHint: "Choose a ready task instead of starting from a blank question.",
    actions: ["Prepare a 10-day content plan", "Give me varied swimming content ideas", "Prepare an image design", "Prepare a video design", "Review and improve this copy", "Summarize this conversation and suggest the next step"],
    summaryPrompt: "Summarize the latest research answer and suggest one practical next step.", designImagePrompt: "I want a swimming marketing image. Prepare a clear design brief, recommend the best connected and verified provider, and show real alternatives I can freely choose.", designVideoPrompt: "I want a short swimming video. Prepare a clear video brief, recommend the best connected and verified provider, and show real alternatives I can freely choose.",
    error: "The research could not be completed. The question was not saved and no swimmer record was created.",
    privacyNote: "Research runs through a secure server; the Gemini key never reaches the phone.",
    examples: [
      "A child has water fear and attention difficulties. How to begin step by step?",
      "How to improve a 12-year-old swimmer's 100m freestyle technique based on evidence?",
      "Adapting the aquatic lesson environment for an autistic learner without medical diagnosis?",
      "Adult swimmer with shoulder discomfort: what are the safe aquatic fitness boundaries?",
    ],
  },
};

export const COACH_BRAIN_FACTORY_HANDOFF_KEY = "coach-brain-factory-handoff";

function getSessionToken() {
  try {
    const raw = sessionStorage.getItem("relaxfix-command-session");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { accessToken?: unknown };
    return typeof parsed.accessToken === "string" ? parsed.accessToken : "";
  } catch { return ""; }
}

function formatTokenCount(value: number | null, language: "ar" | "en") {
  return value === null ? "—" : new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-US").format(value);
}

function formatUsd(value: number, language: "ar" | "en") {
  if (value > 0 && value < 0.000001) return language === "ar" ? "أقل من 0.000001 دولار" : "Less than $0.000001";
  return new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6,
  }).format(value);
}

export type CoachBrainProps = { language?: "ar" | "en"; onNavigate?: (section: string) => void };

export default function CoachBrain({ language = "ar", onNavigate = () => undefined }: CoachBrainProps) {
  const t = copy[language];
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [summaryRequested, setSummaryRequested] = useState(false);
  const usage = result?.usage ?? null;
  const responseTokens = usage?.outputTokens !== null && usage?.outputTokens !== undefined && usage?.thinkingTokens !== null && usage?.thinkingTokens !== undefined
    ? usage.outputTokens + usage.thinkingTokens
    : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planDays, setPlanDays] = useState("7");
  const [customDays, setCustomDays] = useState("10");
  const [planMix, setPlanMix] = useState("varied");
  const [planExecution, setPlanExecution] = useState<"best" | "value" | "library" | "design" | "manual">("best");
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sample, setSample] = useState<GeneratedContentSample | null>(null);
  const [sampleError, setSampleError] = useState("");

  function selectedPlanDays() {
    return planDays === "custom" ? Math.max(2, Math.min(30, Number(customDays) || 10)) : Number(planDays);
  }

  function sendResultToFactory() {
    if (!result && !sample) return;
    sessionStorage.setItem(COACH_BRAIN_FACTORY_HANDOFF_KEY, JSON.stringify({
      question: question.trim().slice(0, 1000) || "Coach Brain content plan",
      answer: result?.answer?.slice(0, 4000) || sample?.caption?.slice(0, 4000) || "",
      sources: result?.sources?.slice(0, 5).map((source) => ({ title: source.title, url: source.url })) ?? [],
      planWindowDays: selectedPlanDays(),
      planMix,
      planExecution,
      sample: sample ? {
        topic: sample.topic,
        hook: sample.hook,
        caption: sample.caption,
        visualPrompt: sample.visualPrompt,
        platform: sample.platform,
        contentType: sample.contentType,
      } : null,
      createdAt: new Date().toISOString(),
    }));
    const url = new URL(window.location.href);
    url.searchParams.set("section", "content");
    url.searchParams.set("factoryContext", "coach-brain");
    url.searchParams.set("planDays", String(selectedPlanDays()));
    url.searchParams.set("planMix", planMix);
    url.searchParams.set("planExecution", planExecution);
    window.location.assign(url.toString());
  }

  async function research(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || busy) return;
    const reference = summaryRequested && result && !result.isSummary ? result : null;
    setBusy(true); setError(""); setResult(null);
    setSummaryRequested(false);
    try {
      const baseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
      const publicKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "");
      const token = getSessionToken();
      if (!baseUrl || !publicKey || !token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(`${baseUrl}/functions/v1/coach-brain-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: publicKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify(reference
          ? buildCoachBrainSummaryRequest(reference.question, reference.answer)
          : { question: value }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; code?: string; answer?: string; sources?: Source[]; searchQueries?: string[]; usage?: ResearchUsage | null };
      if (!response.ok || !payload.success || !payload.answer) {
        const code = payload.code ?? (response.status === 401 ? "AUTH_REQUIRED" : response.status === 403 ? "STAFF_ACCESS_DENIED" : "RESEARCH_FAILED");
        if (code === "NEEDS_CREDENTIAL") throw new Error("NEEDS_CREDENTIAL");
        if (code === "AUTH_REQUIRED" || response.status === 401) throw new Error("AUTH_REQUIRED");
        if (code === "STAFF_ACCESS_DENIED" || response.status === 403) throw new Error("STAFF_ACCESS_DENIED");
        if (code === "ACADEMY_CONTEXT_FAILED") throw new Error("ACADEMY_CONTEXT_FAILED");
        throw new Error("RESEARCH_FAILED");
      }
      setResult({ question: value, answer: payload.answer, isSummary: Boolean(reference), sources: Array.isArray(payload.sources) ? payload.sources : [], searchQueries: payload.searchQueries, usage: payload.usage ?? null });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "RESEARCH_FAILED";
      if (code === "NEEDS_CREDENTIAL") setError(language === "ar" ? "Coach Brain يحتاج مفتاح Gemini في Supabase Edge Function باسم GEMINI_API_KEY. لا تضع المفتاح داخل التطبيق." : "Coach Brain needs the Gemini key in Supabase Edge Function secrets as GEMINI_API_KEY. Do not put the key in the app.");
      else if (code === "AUTH_REQUIRED" || code === "STAFF_ACCESS_DENIED") setError(language === "ar" ? "جلسة الدخول غير صالحة أو لا تملك صلاحية Coach Brain. سجّل الدخول مرة أخرى." : "The staff session is invalid or does not have Coach Brain access. Sign in again.");
      else if (code === "ACADEMY_CONTEXT_FAILED") setError(language === "ar" ? "Coach Brain وصل للخدمة لكن لم يستطع تحميل Academy Knowledge. سأحتاج إصلاح مسار المعرفة، وليس مفتاحًا جديدًا." : "Coach Brain reached the service but could not load Academy Knowledge. This needs a knowledge-path fix, not a new key.");
      else setError(t.error);
      if (reference) setResult(reference);
    } finally { setBusy(false); }
  }

  return (
    <main className="coach-brain" dir={language === "ar" ? "rtl" : "ltr"}>
      <header className="coach-brain__hero">
        <div>
          <div className="coach-brain__eyebrow"><Brain size={17} /> {t.title}</div>
          <h1>{t.subtitle}</h1>
          <p>{t.privacy}</p>
        </div>
        <div className="coach-brain__status"><ShieldCheck size={18} /> {language === "ar" ? "بحث آمن" : "Safe research"}</div>
      </header>


      <section className="coach-brain__command-dock" aria-label={language === "ar" ? "قدرات Coach Brain" : "Coach Brain capabilities"}>
        <div className="coach-brain__dock-heading">
          <div>
            <span className="coach-brain__dock-eyebrow">{language === "ar" ? "العقل التنفيذي" : "EXECUTIVE BRAIN"}</span>
            <h2>{language === "ar" ? "كل قدرات Command Center من مكان واحد" : "Command Center capabilities from one place"}</h2>
            <p>{language === "ar" ? "لا تحتاج إلى إدارة الأنظمة واحدًا واحدًا. اختر المهمة، وCoach Brain يوصلك إلى مساحة التنفيذ الصحيحة." : "You do not need to manage systems one by one. Choose the task and Coach Brain routes you to the right execution space."}</p>
          </div>
          <span className="coach-brain__dock-status"><ShieldCheck size={16} /> {language === "ar" ? "متصل بالمنظومة الحالية" : "Connected to the existing system"}</span>
        </div>
        <div className="coach-brain__capability-grid">
          {[
            ["content", "🏭", language === "ar" ? "المصنع" : "Factory", language === "ar" ? "حوّل البحث والفكرة إلى محتوى." : "Turn research and ideas into content."],
            ["media", "🖼️", language === "ar" ? "الوسائط" : "Media", language === "ar" ? "راجع الأصول والمصادر والموافقات." : "Review assets, sources and approvals."],
            ["inbox", "📥", language === "ar" ? "Inbox" : "Inbox", language === "ar" ? "تعامل مع المحادثات التي تحتاجك." : "Handle conversations that need you."],
            ["planner", "📅", language === "ar" ? "الحجوزات" : "Bookings", language === "ar" ? "راجع الطلبات والمواعيد." : "Review requests and appointments."],
            ["crm", "👥", language === "ar" ? "العملاء" : "Customers", language === "ar" ? "تابع العملاء والمتابعات." : "Follow customers and follow-ups."],
            ["automations", "⚙️", language === "ar" ? "التشغيل" : "Operations", language === "ar" ? "راقب التشغيل والطوابير." : "Monitor operations and queues."],
            ["analytics", "📊", language === "ar" ? "النتائج" : "Analytics", language === "ar" ? "اقرأ نبض النشاط والنتائج." : "Read business pulse and results."],
            ["connections", "🔌", language === "ar" ? "الاتصالات" : "Connections", language === "ar" ? "راجع حالة المزودين والاتصالات." : "Review provider and connection truth."]
          ].map(([section, icon, title, description]) => (
            <button type="button" className="coach-brain__capability" key={section} onClick={() => onNavigate(section)}>
              <span className="coach-brain__capability-icon" aria-hidden="true">{icon}</span>
              <span className="coach-brain__capability-copy"><strong>{title}</strong><small>{description}</small></span>
              <span className="coach-brain__capability-arrow" aria-hidden="true">←</span>
            </button>
          ))}
        </div>
      </section>

      <nav className="coach-brain__subnav" aria-label={language === "ar" ? "أقسام Coach Brain" : "Coach Brain sections"}>
        <a href="#coach-question">{language === "ar" ? "سؤال جديد" : "New question"}</a>
        <a href="#coach-examples">{language === "ar" ? "أمثلة جاهزة" : "Examples"}</a>
        <a href="#coach-results">{language === "ar" ? "النتائج" : "Results"}</a>
      </nav>

      <section className="coach-brain__card coach-brain__actions-card" aria-labelledby="coach-actions-title">
        <div className="coach-brain__section-heading"><span className="coach-brain__step">1</span><div><strong id="coach-actions-title">{t.actionsTitle}</strong><p>{t.actionsHint}</p></div></div>
        <div className="coach-brain__action-grid">{t.actions.map((action, index) => {
          const isSummaryAction = index === t.actions.length - 1;
          const isImageDesignAction = index === 2;
          const isVideoDesignAction = index === 3;
          return <button key={action} type="button" disabled={busy || (isSummaryAction && (!result || result.isSummary))} onClick={() => {
            if (isSummaryAction) {
              if (!result || result.isSummary) return;
              setSummaryRequested(true);
              setQuestion(t.summaryPrompt);
            } else if (isImageDesignAction) {
              setSummaryRequested(false);
              setQuestion(t.designImagePrompt);
              setResult(null);
            } else if (isVideoDesignAction) {
              setSummaryRequested(false);
              setQuestion(t.designVideoPrompt);
              setResult(null);
            } else {
              setSummaryRequested(false);
              setQuestion(action);
              setResult(null);
            }
            setError("");
            document.getElementById("coach-brain-question")?.focus();
          }}>{action}<Sparkles size={15} /></button>;
        })}</div>
      </section>



      <section className="coach-brain__card coach-brain__plan-card" aria-labelledby="coach-plan-title">
        <div className="coach-brain__section-heading">
          <span className="coach-brain__step">2</span>
          <div>
            <strong id="coach-plan-title">{language === "ar" ? "خطة محتوى قبل التنفيذ" : "Content plan before execution"}</strong>
            <p>{language === "ar" ? "اختر المدة وطريقة التنفيذ، ثم شاهد عينة حقيقية قبل إنشاء الدفعة." : "Choose the window and execution preference, then see a real sample before creating the batch."}</p>
          </div>
        </div>
        <div className="coach-brain__plan-grid">
          <label><span>{language === "ar" ? "المدة" : "Window"}</span><select value={planDays} onChange={(event) => setPlanDays(event.target.value)} disabled={sampleBusy}><option value="2">2 {language === "ar" ? "يوم" : "days"}</option><option value="3">3 {language === "ar" ? "أيام" : "days"}</option><option value="4">4 {language === "ar" ? "أيام" : "days"}</option><option value="7">7 {language === "ar" ? "أيام" : "days"}</option><option value="14">14 {language === "ar" ? "يومًا" : "days"}</option><option value="30">30 {language === "ar" ? "يومًا" : "days"}</option><option value="custom">{language === "ar" ? "مخصص" : "Custom"}</option></select></label>
          {planDays === "custom" && <label><span>{language === "ar" ? "عدد الأيام" : "Days"}</span><input type="number" min={2} max={30} value={customDays} onChange={(event) => setCustomDays(event.target.value)} disabled={sampleBusy} /></label>}
          <label><span>{language === "ar" ? "نوع المحتوى" : "Content mix"}</span><select value={planMix} onChange={(event) => setPlanMix(event.target.value)} disabled={sampleBusy}><option value="varied">{language === "ar" ? "⭐ متنوع وأفضل توازن" : "⭐ Varied / best balance"}</option><option value="education">{language === "ar" ? "تعليمي" : "Education"}</option><option value="parents">{language === "ar" ? "للأهل" : "Parent tips"}</option><option value="conversion">{language === "ar" ? "تحويل وحجوزات" : "Conversion"}</option></select></label>
          <label><span>{language === "ar" ? "التنفيذ" : "Execution"}</span><select value={planExecution} onChange={(event) => setPlanExecution(event.target.value as typeof planExecution)} disabled={sampleBusy}><option value="best">⭐ {language === "ar" ? "الأفضل" : "Best"}</option><option value="value">💰 {language === "ar" ? "الأوفر" : "Best value"}</option><option value="library">📁 {language === "ar" ? "من مكتبتي" : "From my library"}</option><option value="design">🎨 {language === "ar" ? "أفضل تصميم" : "Best design"}</option><option value="manual">⚙️ {language === "ar" ? "يدوي" : "Manual"}</option></select></label>
        </div>
        <div className="coach-brain__plan-actions">
          <button type="button" className="coach-brain__primary" disabled={sampleBusy} onClick={async () => {
            setSampleBusy(true); setSampleError(""); setSample(null);
            try {
              const raw = sessionStorage.getItem("relaxfix-command-session");
              const parsed = raw ? JSON.parse(raw) as { accessToken?: unknown } : {};
              const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : "";
              if (!accessToken) throw new Error("AUTH_REQUIRED");
              const provider: BatchAiProvider = planExecution === "value" ? "gemini" : "auto";
              const promptContext: GeminiBatchPromptContext = {
                academyKnowledge: [],
                coachBrainResearch: result ? { question: result.question, answer: result.answer, sources: result.sources } : null,
                businessStrategy: { brand: {} as GeminiBatchPromptContext["businessStrategy"]["brand"], platformGuidance: { instagram: { focus: planMix, format: "social post" }, facebook: { focus: planMix, format: "social post" }, tiktok: { focus: planMix, format: "short video" }, all: { focus: planMix, format: "mixed" } }, strategySummary: { audience: "Abu Dhabi parents", goals: [], publishingIntent: "education and conversion", currentBatchStrategy: planMix, platforms: [], trustConversionBalance: { trust: 70, conversion: 30 } } },
                performanceGuidance: [],
              };
              const generated = await generateCoachAymanSampleWithProvider({ accessToken }, provider, 0, crypto.randomUUID(), new Date(), promptContext);
              if (!generated) throw new Error("SAMPLE_FAILED");
              setSample(generated);
            } catch (cause) {
              setSampleError(cause instanceof Error && cause.message === "AUTH_REQUIRED"
                ? (language === "ar" ? "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.")
                : (language === "ar" ? "تعذر إنشاء العينة الآن. لم يتم حفظ أي دفعة أو نشر أي شيء." : "The sample could not be generated. No batch was saved and nothing was published."));
            } finally { setSampleBusy(false); }
          }}>
            {sampleBusy ? (language === "ar" ? "جاري إنشاء عينة حقيقية…" : "Creating a real sample…") : (language === "ar" ? "شاهد عينة حقيقية" : "Show a real sample")}
          </button>
          <button type="button" className="coach-brain__reset" disabled={!sample && !result} onClick={sendResultToFactory}>{language === "ar" ? "أعجبني — إلى المصنع" : "I like it — send to Factory"}</button>
        </div>
        {sampleError && <p className="coach-brain__error" role="alert">{sampleError}</p>}
        {sample && <article className="coach-brain__sample" aria-live="polite">
          <div className="coach-brain__result-title"><Sparkles size={18} /><h3>{language === "ar" ? "العينة الحقيقية" : "Real sample"}</h3></div>
          <strong>{sample.topic}</strong>
          <p>{sample.hook}</p>
          <div className="coach-brain__sample-caption">{sample.caption}</div>
          <small>{sample.platform} · {sample.contentType}</small>
          <details><summary>{language === "ar" ? "تفاصيل التصميم" : "Design brief"}</summary><p>{sample.visualPrompt}</p></details>
        </article>}
      </section>

      <section id="coach-question" className="coach-brain__card coach-brain__research-card">
        <div className="coach-brain__section-heading"><span className="coach-brain__step">3</span><div><strong>{language === "ar" ? "راجع المهمة أو اكتب سؤالك" : "Review the task or write your question"}</strong><p>{language === "ar" ? "يمكنك تعديل النص قبل تشغيل البحث." : "You can edit the prompt before running research."}</p></div></div>
        <form onSubmit={research}>
          <label className="coach-brain__question-label" htmlFor="coach-brain-question">{language === "ar" ? "ماذا تريد أن تعرف؟" : "What do you want to know?"}</label>
          <textarea id="coach-brain-question" value={question} onChange={(event) => { setQuestion(event.target.value); setSummaryRequested(false); }} placeholder={t.placeholder} rows={6} maxLength={5000} disabled={busy} />
          <div className="coach-brain__actions">
            <button className="coach-brain__primary" type="submit" disabled={busy || !question.trim()}>
              {busy ? <Sparkles size={17} className="coach-brain__spin" /> : <Search size={17} />}
              {busy ? t.searching : t.search}
            </button>
            <span className="coach-brain__privacy-note">{t.privacyNote}</span>
          </div>
        </form>
        <div id="coach-examples" className="coach-brain__examples">
          <div className="coach-brain__examples-heading"><span className="coach-brain__step">4</span><strong>{language === "ar" ? "أو اختر مثالًا تدريبيًا" : "Or choose a coaching example"}</strong></div>
          {t.examples.map((example) => <button key={example} type="button" disabled={busy} onClick={() => setQuestion(example)}>{example}</button>)}
        </div>
      </section>

      {error && <section className="coach-brain__error" role="alert"><AlertTriangle size={18} /> {error}</section>}

      {!result && !busy && !error && <section className="coach-brain__empty"><BookOpen size={32} /><strong>{t.empty}</strong></section>}

      {busy && <section className="coach-brain__empty"><Sparkles size={30} className="coach-brain__spin" /><strong>{t.searching}</strong><span>{language === "ar" ? "يتم البحث أولًا ثم تحويل النتائج إلى خطة عملية للمدرب." : "Research comes first, then the findings are turned into a practical coaching plan."}</span></section>}

      {result && (
        <section id="coach-results" className="coach-brain__results" aria-live="polite">
          <div className="coach-brain__results-heading"><span className="coach-brain__step">5</span><div><strong>{language === "ar" ? "النتيجة العملية" : "Practical result"}</strong><p>{language === "ar" ? "اقرأ الإجابة، راجع المصادر، ثم أرسلها لمصنع المحتوى عند الحاجة." : "Read the answer, review the sources, then send it to Content Factory when useful."}</p></div><div className="coach-brain__results-actions"><button type="button" className="coach-brain__reset" onClick={() => { setResult(null); setQuestion(""); setSummaryRequested(false); setError(""); }}>{language === "ar" ? "مهمة جديدة" : "New task"}</button><button type="button" className="coach-brain__reset" onClick={sendResultToFactory}>{language === "ar" ? "إرسال إلى مصنع المحتوى" : "Send to Content Factory"}</button></div></div>
          <article className="coach-brain__card coach-brain__answer">
            <div className="coach-brain__result-title"><Sparkles size={18} /> <h2>{t.direct}</h2></div>
            <div className="coach-brain__answer-text">{result.answer}</div>
          </article>
          <article className="coach-brain__card coach-brain__usage" aria-label={t.usageTitle}>
            <div className="coach-brain__result-title"><strong>{t.usageTitle}</strong></div>
            {usage ? <>
              <dl className="coach-brain__usage-grid">
                <div><dt>{t.modelLabel}</dt><dd>{usage.requestedModel}</dd></div>
                <div><dt>{t.inputTokens}</dt><dd>{formatTokenCount(usage.inputTokens, language)}</dd></div>
                <div><dt>{t.responseTokens}</dt><dd>{formatTokenCount(responseTokens, language)}</dd></div>
                <div><dt>{t.totalTokens}</dt><dd>{formatTokenCount(usage.totalTokens, language)}</dd></div>
                <div><dt>{t.searchQueries}</dt><dd>{usage.groundingSearchQueries === null ? t.searchUsageUnknown : formatTokenCount(usage.groundingSearchQueries, language)}</dd></div>
              </dl>
              {usage.estimatedTokenCostUsd === null
                ? <p role="status">{t.usageUnavailable}</p>
                : <p className="coach-brain__usage-cost"><strong>{t.usageEstimate}:</strong> {formatUsd(usage.estimatedTokenCostUsd, language)}</p>}
              <p className="coach-brain__usage-note">{t.usageCaveat} {t.rateAsOf}: {usage.pricingAsOf}.</p>
              <a href={usage.pricingSource} target="_blank" rel="noreferrer">{t.pricingSource}</a>
            </> : <p role="status">{t.usageUnavailable}</p>}
          </article>
          <article className="coach-brain__card coach-brain__sources">
            <div className="coach-brain__result-title"><BookOpen size={18} /> <h2>{t.sources}</h2></div>
            {result.sources.length ? result.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="coach-brain__source-link"><strong>{source.title}</strong><span>{source.url}</span></a>) : <p>{language === "ar" ? "لم يعرض مزود البحث مصادر مباشرة لهذه الإجابة." : "The research provider did not return direct source links for this answer."}</p>}
          </article>
          <div className="coach-brain__safety"><AlertTriangle size={17} /><strong>{t.safety}:</strong><span>{language === "ar" ? "Coach Brain لا يشخّص ولا يقدم علاجًا طبيًا، ولا يوصي بالغمر القسري. في الإصابة أو الألم أو التأهيل السريري يجب الرجوع للمختص المناسب." : "Coach Brain does not diagnose or provide medical treatment, and it does not recommend forced submersion. For injury, pain or clinical rehabilitation, use the appropriate licensed professional."}</span></div>
        </section>
      )}
    </main>
  );
}
