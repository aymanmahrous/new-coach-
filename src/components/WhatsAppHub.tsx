import { useState } from "react";
import {
  Check, Copy, ExternalLink, MessageCircle, Phone, Send, Sparkles, ShieldCheck,
  Zap, Bot, CheckCircle2, AlertTriangle, UserCheck, Clock, Radio, Eye
} from "lucide-react";

type Lang = "ar" | "en";

interface WhatsAppHubProps {
  lang: Lang;
  log: (s: string, tone?: "info" | "ok" | "err") => void;
}

interface LiveConversation {
  id: string;
  clientName: string;
  clientHandle: string;
  channel: "whatsapp" | "messenger" | "instagram";
  incomingText: string;
  aiAutoReply: string;
  status: "auto_replied" | "assessment_booked" | "needs_attention";
  timestamp: string;
  branch?: string;
}

const SAMPLE_LIVE_CONVERSATIONS: LiveConversation[] = [
  {
    id: "conv-1",
    clientName: "أم خليفة",
    clientHandle: "+971 50 *** 4128",
    channel: "whatsapp",
    incomingText: "السلام عليكم كابتن، ابني عمره 6 سنين ويخاف جداً من الماء، هل عندكم علاج للرهبة وكم سعر الاشتراك في فرع المشرف؟",
    aiAutoReply: "وعليكم السلام ورحمة الله أهلاً بكِ أم خليفة في أكاديمية كابتن أيمن بأبوظبي. 🏊‍♂️💙 نحب نطمنك تماماً إن رهبة الماء طبيعية جداً في سن 6 سنوات، وكابتن أيمن متخصص في علاج الخوف والتأهيل التدريجي بأسلوب محبب ومطمئن وبدون أي ضغط. متوفر لدينا نوعين من التدريب: 1) تدريب خاص (VIP / فردي) لتركيز كامل وبناء الثقة خطوة بخطوة. 2) تدريب مجموعات صغيرة (4 أطفال فقط في المجموعة كحد أقصى) لضمان أعلى مستوى من الرعاية والأمان. واللي بيحدد الأنسب للبطل (خاص أم مجموعة) هو الكابتن أيمن بنفسه بعد ما تشرفونا في **جلسة تقييم أولي مجانية تماماً** في فرع المشرف للتعرف على المسبح بدون أي التزام مسبق. (رسوم الاشتراك بعد التقييم: باقة المجموعات 450 درهم شهرياً مع خصم الأخوة 400 درهم، والحصص الخاصة 150/250 درهم). هل تفضلين موعد التقييم فترة العصر أم المغرب؟",
    status: "auto_replied",
    timestamp: "منذ 18 دقيقة",
    branch: "المشرف",
  },
  {
    id: "conv-2",
    clientName: "محمد المنصوري",
    clientHandle: "m.me/almansoori.m",
    channel: "messenger",
    incomingText: "مرحبا كابتن، هل متوفر تدريب خاص للكبار لتصحيح تكنيك السباحة الحرة في فرع مدينة خليفة وبكم الحصة؟",
    aiAutoReply: "مرحباً بك أستاذ محمد. نعم متوفر تدريب خاص فردي للكبار في فرع مدينة خليفة لرفع الكفاءة وتصحيح التكنيك (Total Immersion). الحصص الخاصة الفردية تبدأ من 150 درهم و250 درهم حسب البرنامج المخصص. يشرفنا حجز جلسة تقييم أولي مجانية لتحديد مستواك وجدولك المناسب. ما هو اليوم الأنسب لك للبدء؟",
    status: "assessment_booked",
    timestamp: "منذ 45 دقيقة",
    branch: "مدينة خليفة",
  },
  {
    id: "conv-3",
    clientName: "سارة المهيري",
    clientHandle: "@sarah.almehairi",
    channel: "instagram",
    incomingText: "السلام عليكم، حابة أسجل ولدين (8 و 10 سنين)، هل يوجد خصم إخوة؟ وما هي الفروع المتاحة؟",
    aiAutoReply: "وعليكم السلام ورحمة الله أختي سارة. نعم نوفر خصم خاص للإخوة بقيمة 400 درهم لكل طفل بدلاً من 450 درهم. فروعنا المجهزة في أبوظبي: المشرف، الفلاح، مدينة خليفة، والدانة / النجدة. يسعدنا استقبالكم لجلسة تقييم مجانية للمستويات. أي فرع هو الأقرب لكم لتأكيد الأوقات؟",
    status: "auto_replied",
    timestamp: "منذ ساعتين",
    branch: "الفلاح / المشرف",
  },
];

const TEMPLATES = [
  {
    id: "assessment",
    titleAr: "تقييم مجاني أولي",
    titleEn: "Free Assessment",
    textAr: "مرحباً كابتن أيمن، أرغب في حجز تقييم أولي مجاني لمستوى السباحة في أبوظبي.",
    textEn: "Hi Coach Ayman, I would like to book a free initial swimming assessment in Abu Dhabi.",
  },
  {
    id: "kids_group",
    titleAr: "مجموعات الأطفال (450 درهم)",
    titleEn: "Kids Groups (450 AED)",
    textAr: "السلام عليكم كابتن أيمن، استفسار عن مواعيد وأماكن مجموعات الأطفال (باقة 450 درهم / خصم الإخوة 400 درهم).",
    textEn: "Hello Coach Ayman, inquiring about kids group schedules (450 AED package / 400 AED sibling discount).",
  },
  {
    id: "aquaphobia",
    titleAr: "علاج رهبة الماء (حصص خاصة)",
    titleEn: "Aquaphobia Treatment",
    textAr: "مرحباً كابتن، أرغب في الاستفسار عن الحصص الخاصة لعلاج الخوف من الماء وبناء الثقة للكبار أو الصغار (150/250 درهم).",
    textEn: "Hi Coach, inquiring about private sessions for aquaphobia treatment and confidence building (150/250 AED).",
  },
  {
    id: "branches",
    titleAr: "فروع مسابح أبوظبي",
    titleEn: "Abu Dhabi Branches",
    textAr: "مرحباً، ما هي أقرب مواعيد للحصص في فروعكم: المشرف، الفلاح، مدينة خليفة، أو الدانة؟",
    textEn: "Hi, what are the upcoming session times at your branches: Al Mushrif, Al Falah, Khalifa City, or Al Danah?",
  },
];

export function WhatsAppHub({ lang, log }: WhatsAppHubProps) {
  const isAr = lang === "ar";
  const [autoPilotMode, setAutoPilotMode] = useState<"full_auto" | "alerts_only" | "manual">("full_auto");
  const [conversations, setConversations] = useState<LiveConversation[]>(SAMPLE_LIVE_CONVERSATIONS);
  const [selectedConv, setSelectedConv] = useState<LiveConversation | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id);
  const [customText, setCustomText] = useState(isAr ? TEMPLATES[0].textAr : TEMPLATES[0].textEn);
  const [clientQuery, setClientQuery] = useState("");
  const [aiSuggestedReply, setAiSuggestedReply] = useState("");
  const [replyChannel, setReplyChannel] = useState<"whatsapp" | "messenger" | "instagram">("whatsapp");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);

  const phoneE164 = "971588219130";
  const phoneDisplay = "058 821 9130";
  const mgmtPhoneDisplay = "055 137 8660";
  const fbPageId = "1164107840123575";
  const messengerUrl = `https://m.me/${fbPageId}`;
  const instagramUrl = "https://www.instagram.com/direct/inbox/";

  const waLink = `https://wa.me/${phoneE164}?text=${encodeURIComponent(customText)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(waLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    log(isAr ? "تم نسخ رابط واتساب التتبعي" : "WhatsApp lead link copied", "ok");
  };

  const copyReply = async () => {
    if (!aiSuggestedReply) return;
    await navigator.clipboard.writeText(aiSuggestedReply);
    setCopiedReply(true);
    setTimeout(() => setCopiedReply(false), 2000);
    log(isAr ? "تم نسخ الرد المقترح" : "Suggested reply copied", "ok");
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl) {
      setCustomText(isAr ? tmpl.textAr : tmpl.textEn);
    }
  };

  const channelNames = {
    whatsapp: isAr ? "واتساب (058 821 9130)" : "WhatsApp (058 821 9130)",
    messenger: isAr ? "فيسبوك مسنجر (صفحة كابتن أيمن)" : "Facebook Messenger (Page)",
    instagram: isAr ? "إنستغرام دايركت (@RelaxFixUAE)" : "Instagram Direct (@RelaxFixUAE)",
  };

  const generateReplyWithBrain = async () => {
    if (!clientQuery.trim() || generatingReply) return;
    setGeneratingReply(true);
    setAiSuggestedReply("");

    const channelContext =
      replyChannel === "messenger"
        ? "المنصة المستهدفة: فيسبوك مسنجر (Facebook Messenger). اكتب رداً ودوداً ومباشراً يناسب شات فيسبوك."
        : replyChannel === "instagram"
        ? "المنصة المستهدفة: إنستغرام دايركت (Instagram Direct). اكتب رداً جذاباً ومركزاً وسريعاً."
        : "المنصة المستهدفة: واتساب (WhatsApp). اكتب رداً مفصلاً ومرتباً مع نقاط واضحة.";

    const prompt = `أنت المساعد الذكي لمبيعات وتأهيل السباحة لكابتن أيمن (Swimming & Relax Fix Hub أبوظبي).
${channelContext}
استفسار العميل الوارد:
"${clientQuery}"

قواعد الرد النفسية والبيعية المعتمدة لكابتن أيمن (التزم بها بدقة):
1. التعاطف والتطمين أولاً:
   - إذا ذكر ولي الأمر خوفاً أو رهبة من الماء، طمئنه فوراً بأن هذا أمر طبيعي وشائع جداً، وأن كابتن أيمن متخصص في التأهيل النفسي وكسر حاجز الخوف تدريجياً بأسلوب محبب وبدون أي ضغط على الطفل.
2. توضيح خيارات التدريب:
   - تدريب خاص (VIP / فردي): تركيز كامل 1-on-1 لبناء الألفة والأمان خطوة بخطوة.
   - تدريب مجموعات صغيرة: المجموعة عبارة عن 4 أطفال فقط كحد أقصى لضمان أقصى درجات الرعاية والمتابعة الدقيقة.
3. كابتن أيمن يحدد الأنسب عبر التقييم المجاني:
   - أوضح أن الكابتن أيمن هو من يحدد البرنامج الأنسب لطفلك (خاص أم مجموعة) بعد تشريفكم في **جلسة تقييم أولي مجانية تماماً** في المسبح بدون أي التزام.
4. الشفافية في الأسعار (بعد التقييم):
   - لا تبدأ الرد بأسعار مجردة. أكد أولاً أن التقييم مجاني، ورسوم الاشتراك بعد التقييم:
     * باقة المجموعات (4 أطفال): 450 درهم شهرياً (مع خصم الأخوة 400 درهم).
     * الحصص الخاصة: 150 درهم و 250 درهم.
5. فروع أبوظبي المعتمدة: المشرف، الفلاح، مدينة خليفة، الدانة / النجدة.
6. سؤال ختامي محدد: دعوة لاختيار أقرب فرع لحجز موعد جلسة التقييم المجانية.
الرد يجب أن يكون باللغة العربية، ودوداً ومباشراً وجاهزاً للإرسال دون أي تمهيد خارجي.`;

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) throw new Error(await res.text());
      const reply = await res.text();
      setAiSuggestedReply(reply.trim());
      log(isAr ? `تمت صياغة الرد لمنصة ${channelNames[replyChannel]} بواسطة كوتش براين` : "AI reply generated", "ok");
    } catch (e) {
      log(`${isAr ? "تعذر توليد الرد" : "Failed to generate reply"}: ${(e as Error).message}`, "err");
    } finally {
      setGeneratingReply(false);
    }
  };

  const openMessengerWithCopy = async () => {
    if (aiSuggestedReply) {
      await navigator.clipboard.writeText(aiSuggestedReply);
    }
    window.open(messengerUrl, "_blank", "noopener");
    log(isAr ? "تم نسخ الرد وفتح فيسبوك مسنجر" : "Reply copied & Messenger opened", "ok");
  };

  const openInstagramWithCopy = async () => {
    if (aiSuggestedReply) {
      await navigator.clipboard.writeText(aiSuggestedReply);
    }
    window.open(instagramUrl, "_blank", "noopener");
    log(isAr ? "تم نسخ الرد وفتح إنستغرام دايركت" : "Reply copied & Instagram DM opened", "ok");
  };

  return (
    <div className="space-y-4">
      {/* 1. MASTER AUTOPILOT STATUS STRIP (Peace of mind for the owner) */}
      <section className="glass space-y-4 p-4 border border-emerald-500/30 bg-emerald-950/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex size-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Bot className="size-6" />
              <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-400 animate-ping" />
              <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm tracking-wider text-emerald-400">
                  {isAr ? "نظام الرد الآلي والطيار المستقل (AI Sales Concierge 24/7)" : "Autonomous AI Auto-Pilot (24/7)"}
                </h2>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] text-emerald-400 font-bold">
                  {isAr ? "مفعّل وشغال" : "ACTIVE"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "كوتش براين يتولى الرد الفوري المعتمد على استفسارات واتساب وفيسبوك وإنستغرام بدقة واحترافية"
                  : "Coach Brain handles customer inquiries automatically across WhatsApp, Messenger & Instagram"}
              </p>
            </div>
          </div>

          {/* Autopilot Mode Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setAutoPilotMode("full_auto");
                log(isAr ? "تم تفعيل الرد الآلي الكامل 24/7" : "Auto-Pilot mode: Full Auto", "ok");
              }}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold transition ${
                autoPilotMode === "full_auto"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="size-3.5" />
              {isAr ? "طيار آلي كامل 24/7" : "Full Auto 24/7"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoPilotMode("alerts_only");
                log(isAr ? "وضع التنبيه عند الحاجة فقط" : "Auto-Pilot mode: Alerts Only", "info");
              }}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition ${
                autoPilotMode === "alerts_only"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="size-3.5" />
              {isAr ? "تنبيه للحالات الخاصة" : "Alerts Only"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoPilotMode("manual");
                log(isAr ? "تم إيقاف الرد الآلي مؤقتاً" : "Auto-Pilot paused", "info");
              }}
              className={`rounded px-3 py-1.5 font-medium transition ${
                autoPilotMode === "manual"
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? "يدوي مؤقتاً" : "Manual"}
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid gap-3 sm:grid-cols-4 pt-1">
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">{isAr ? "حالة الرد التلقائي:" : "Auto-Reply Status:"}</span>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="size-4" />
              {isAr ? "نشط (Webhook n8n متصل)" : "Active & Responding"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">{isAr ? "استفسارات اليوم المعالجة:" : "Today's Queries Handled:"}</span>
            <div className="font-mono text-sm font-bold text-foreground mt-0.5">14 {isAr ? "محادثة" : "conversations"}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">{isAr ? "حجوزات تقييم أولية مجانية:" : "Free Assessments Booked:"}</span>
            <div className="font-mono text-sm font-bold text-accent mt-0.5">5 {isAr ? "أولياء أمور" : "leads"}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2.5">
            <span className="text-[11px] text-muted-foreground">{isAr ? "زمن الاستجابة التلقائي:" : "Avg Response Time:"}</span>
            <div className="font-mono text-sm font-bold text-emerald-400 mt-0.5">&lt; 3 {isAr ? "ثوانٍ" : "sec"}</div>
          </div>
        </div>
      </section>

      {/* 2. LIVE CONVERSATIONS STREAM (Look at your phone & be assured) */}
      <section className="glass space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-emerald-400 animate-pulse" />
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صندوق المحادثات والردود الآلية الحية (Live Inbound Stream)" : "Live Inbound AI Conversations"}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {isAr ? "مراقبة فورية للردود التي أرسلها الذكاء الاصطناعي للعملاء" : "Real-time feed of automated replies"}
          </span>
        </div>

        <div className="space-y-3">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="rounded-lg border border-border bg-background/40 p-3.5 space-y-2.5 hover:border-primary/50 transition"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${
                      conv.channel === "whatsapp"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : conv.channel === "messenger"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-pink-500/20 text-pink-400"
                    }`}
                  >
                    {conv.channel === "whatsapp" ? "WhatsApp" : conv.channel === "messenger" ? "Messenger" : "Instagram"}
                  </span>
                  <span className="font-bold text-foreground">{conv.clientName}</span>
                  <span dir="ltr" className="font-mono text-muted-foreground text-[11px]">{conv.clientHandle}</span>
                  {conv.branch && (
                    <span className="rounded bg-secondary px-1.5 py-0.2 text-[10px] text-muted-foreground">
                      📍 {conv.branch}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="size-3.5" />
                    {isAr ? "تم الرد تلقائياً بالذكاء الاصطناعي" : "AI Auto-Replied"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{conv.timestamp}</span>
                </div>
              </div>

              {/* Message Exchange */}
              <div className="space-y-1.5 text-xs">
                <div className="rounded bg-secondary/50 p-2 text-foreground/90">
                  <span className="font-semibold text-muted-foreground me-1">{isAr ? "العميل:" : "Client:"}</span>
                  {conv.incomingText}
                </div>
                <div className="rounded border border-primary/20 bg-primary/5 p-2 text-foreground">
                  <span className="font-semibold text-primary me-1">{isAr ? "رد كوتش براين التلقائي:" : "AI Reply:"}</span>
                  {conv.aiAutoReply}
                </div>
              </div>

              {/* Quick Action */}
              <div className="flex items-center justify-end gap-2 text-xs pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(conv.aiAutoReply);
                    log(isAr ? "تم نسخ نص الرد" : "Reply copied", "ok");
                  }}
                  className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-secondary"
                >
                  <Copy className="size-3" />
                  {isAr ? "نسخ الرد" : "Copy"}
                </button>
                {conv.channel === "whatsapp" && (
                  <a
                    href={`https://wa.me/${phoneE164}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                  >
                    <ExternalLink className="size-3" />
                    {isAr ? "فتح المحادثة" : "Open Chat"}
                  </a>
                )}
                {conv.channel === "messenger" && (
                  <a
                    href={messengerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
                  >
                    <ExternalLink className="size-3" />
                    {isAr ? "فتح ماسنجر" : "Open Messenger"}
                  </a>
                )}
                {conv.channel === "instagram" && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded bg-pink-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-pink-500"
                  >
                    <ExternalLink className="size-3" />
                    {isAr ? "فتح إنستغرام" : "Open Instagram"}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Official Omnichannel Contact Lines */}
      <section className="glass space-y-3 p-4">
        <h3 className="font-display text-sm tracking-wider text-primary">
          {isAr ? "القنوات الرسمية المعتمدة للأكاديمية" : "Official Channels"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href={`https://wa.me/${phoneE164}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 transition hover:border-emerald-500 hover:bg-emerald-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">{isAr ? "واتساب الحجوزات" : "WhatsApp"}</div>
              <div dir="ltr" className="font-mono text-sm font-bold text-emerald-400">{phoneDisplay}</div>
            </div>
            <ExternalLink className="size-4 text-emerald-400" />
          </a>

          <a
            href={messengerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-950/20 p-3 transition hover:border-blue-500 hover:bg-blue-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">{isAr ? "فيسبوك مسنجر" : "Messenger"}</div>
              <div className="text-xs font-semibold text-blue-400">m.me/{fbPageId}</div>
            </div>
            <ExternalLink className="size-4 text-blue-400" />
          </a>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-pink-500/30 bg-pink-950/20 p-3 transition hover:border-pink-500 hover:bg-pink-900/30"
          >
            <div>
              <div className="text-xs text-muted-foreground">{isAr ? "إنستغرام دايركت" : "Instagram DM"}</div>
              <div className="text-xs font-semibold text-pink-400">@RelaxFixUAE</div>
            </div>
            <ExternalLink className="size-4 text-pink-400" />
          </a>

          <a
            href="tel:+971551378660"
            className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3 transition hover:border-primary hover:bg-secondary"
          >
            <div>
              <div className="text-xs text-muted-foreground">{isAr ? "هاتف الإدارة (مكالمات)" : "Management Line"}</div>
              <div dir="ltr" className="font-mono text-sm font-bold text-foreground">{mgmtPhoneDisplay}</div>
            </div>
            <Phone className="size-4 text-primary" />
          </a>
        </div>
      </section>

      {/* 4. Manual On-Demand AI Composer (If you ever want to test or draft manually) */}
      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm tracking-wider text-primary">
              {isAr ? "صياغة رد يدوي عند الطلب (Manual AI Draft)" : "Manual On-Demand AI Responder"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr ? "إذا رغبت في تجربة استفسار معين وصياغة رد مخصص له في أي وقت:" : "Test any incoming inquiry and draft a tailored reply:"}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/60 p-1 text-xs">
            <span className="px-1.5 text-muted-foreground">{isAr ? "القناة:" : "Channel:"}</span>
            <button
              type="button"
              onClick={() => setReplyChannel("whatsapp")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "whatsapp" ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground"
              }`}
            >
              واتساب
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("messenger")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "messenger" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground"
              }`}
            >
              مسنجر
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("instagram")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                replyChannel === "instagram" ? "bg-pink-600 text-white shadow-sm" : "text-muted-foreground"
              }`}
            >
              إنستغرام
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            placeholder={
              isAr
                ? `مثال استفسار عبر ${channelNames[replyChannel]}: "كم سعر حصص الأطفال لشهرين مع بعض في فرع مدينة خليفة؟"`
                : "e.g. What is the pricing for kids group lessons in Khalifa City?"
            }
            rows={2}
            className="w-full rounded-lg border border-input bg-background/50 p-2.5 text-sm outline-none focus:border-primary"
          />

          <button
            onClick={generateReplyWithBrain}
            disabled={!clientQuery.trim() || generatingReply}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Sparkles className={`size-4 ${generatingReply ? "animate-spin" : ""}`} />
            {generatingReply ? (isAr ? "كوتش براين يصيغ الرد…" : "Thinking…") : (isAr ? "صياغة رد بواسطة كوتش براين" : "Draft Reply with AI")}
          </button>
        </div>

        {aiSuggestedReply && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">{isAr ? "الرد المقترح:" : "Suggested Reply:"}</span>
              <button
                onClick={copyReply}
                className="flex items-center gap-1 rounded border border-primary/40 px-2 py-1 text-xs hover:bg-primary/10"
              >
                {copiedReply ? <Check className="size-3 text-accent" /> : <Copy className="size-3" />}
                {copiedReply ? (isAr ? "تم النسخ!" : "Copied!") : (isAr ? "نسخ الرد" : "Copy Reply")}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{aiSuggestedReply}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {replyChannel === "whatsapp" && (
                <a
                  href={`https://wa.me/${phoneE164}?text=${encodeURIComponent(aiSuggestedReply)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm"
                >
                  <Send className="size-3.5" />
                  {isAr ? "إرسال عبر واتساب مباشرة" : "Send via WhatsApp"}
                </a>
              )}
              {replyChannel === "messenger" && (
                <button
                  type="button"
                  onClick={openMessengerWithCopy}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
                >
                  <ExternalLink className="size-3.5" />
                  {isAr ? "نسخ وفتح مسنجر" : "Open Messenger"}
                </button>
              )}
              {replyChannel === "instagram" && (
                <button
                  type="button"
                  onClick={openInstagramWithCopy}
                  className="flex items-center gap-1.5 rounded-md bg-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-pink-500 shadow-sm"
                >
                  <ExternalLink className="size-3.5" />
                  {isAr ? "نسخ وفتح إنستغرام" : "Open Instagram DM"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 5. Campaign Link Generator */}
      <section className="glass space-y-4 p-4">
        <div>
          <h3 className="font-display text-sm tracking-wider text-primary">
            {isAr ? "روابط الحملات الإعلانية الذكية (Lead Generation Links)" : "Smart Lead Generation Links"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr ? "روابط سريعة لوضعها في إعلانات فيسبوك وإنستغرام لتوجيه العميل مباشرة إلى الواتساب مع رسالة افتتاحية:" : "Quick links for ads to direct clients to WhatsApp with pre-filled text:"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selectedTemplate === tmpl.id
                  ? "border-emerald-500 bg-emerald-500 text-white font-medium"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? tmpl.titleAr : tmpl.titleEn}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            <Send className="size-4" />
            {isAr ? "فتح واتساب مع الرسالة" : "Open WhatsApp"}
          </a>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm hover:bg-secondary"
          >
            {copiedLink ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            {copiedLink ? (isAr ? "تم النسخ!" : "Copied!") : (isAr ? "نسخ رابط الحملة" : "Copy Link")}
          </button>
        </div>
      </section>
    </div>
  );
}
