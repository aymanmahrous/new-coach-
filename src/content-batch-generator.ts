export const COACH_AYMAN_BATCH_SIZE = 10;
export const COACH_AYMAN_MONTH_BATCH_SIZE = 30;
export const COACH_AYMAN_PROVIDER_ID = "command-center-coach-ayman-2026";

const BRAND_LINE = "Relax Fix UAE Swimming Academy";
const BRAND_WITH_COACH = "Relax Fix UAE Swimming Academy — Coach Ayman";
const WHATSAPP_OPENER =
  "Hi Relax Fix UAE — I saw Coach Ayman's swimming content and would like a free initial assessment.";

const WHATSAPP = "058 821 9130";
const PHONE = "055 137 8660";

export const CONFIRMED_CTA = [
  `WhatsApp ${WHATSAPP} — messages & booking`,
  `Call ${PHONE} — admin team (phone calls only)`,
  "Free initial assessment.",
].join("\n");

export type DbContentPillar =
  | "water_fear"
  | "parent_concerns"
  | "confidence"
  | "swimming_education"
  | "coach_authority"
  | "real_progress"
  | "safety_awareness"
  | "aqua_training"
  | "behind_the_scenes"
  | "offer_booking";

export type DbContentSlot = "trust_morning" | "education_midday" | "conversion_evening";

export type MarketingFunnel = "attraction" | "education" | "trust" | "engagement" | "conversion";

export type GeneratedBatchItem = {
  platform: "instagram" | "facebook" | "tiktok";
  contentType: string;
  language: "en";
  contentPillar: DbContentPillar;
  contentSlot: DbContentSlot;
  plannedFor: string;
  topic: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  visualPrompt: string;
  contentFingerprint: string;
  mediaAssetId?: string | null;
  mediaSource?: "real" | "ai_generated" | "pending";
  mediaPlan?: Record<string, unknown> | null;
  knowledgeContext?: {
    source: "approved_knowledge" | "fallback";
    verified: boolean;
    categories: string[];
    guidance: string[];
  };
};

export type CoachBrainFactoryContext = {
  question: string;
  answer: string;
  sources: Array<{ title: string; url: string }>;
};

export type CoachKnowledgeContext = {
  source: "approved_knowledge" | "fallback";
  verified: boolean;
  entries: Array<{ category: string; question: string | null; content: string; language: "ar" | "en" }>;
  researchContext?: CoachBrainFactoryContext;
};

const EMPTY_COACH_KNOWLEDGE: CoachKnowledgeContext = { source: "fallback", verified: false, entries: [] };

export function parseCoachKnowledgeContext(value: unknown): CoachKnowledgeContext {
  if (!value || typeof value !== "object") return EMPTY_COACH_KNOWLEDGE;
  const rawEntries = Array.isArray((value as { entries?: unknown }).entries) ? (value as { entries: unknown[] }).entries : [];
  const entries = rawEntries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const content = typeof row.content === "string" ? row.content.trim().slice(0, 500) : "";
    const language = row.language === "ar" ? "ar" : row.language === "en" ? "en" : null;
    if (!category || !content || !language || row.is_active === false) return [];
    return [{ category, question: typeof row.question === "string" ? row.question.trim().slice(0, 180) || null : null, content, language: language as "ar" | "en" }];
  }).slice(0, 24);
  return entries.length ? { source: "approved_knowledge", verified: true, entries } : EMPTY_COACH_KNOWLEDGE;
}

type SlotTemplate = Omit<GeneratedBatchItem, "plannedFor" | "contentFingerprint"> & {
  dayOffset: number;
  slotHourGst: number;
  funnel: MarketingFunnel;
  primaryCta: string;
  topicHashtags: string[];
};

const FORBIDDEN_CLAIMS = /\b(guarantee|guaranteed|award-winning|#1|testimonial|before and after results|100% success|olympic coach|world record)\b/i;

const PRIMARY_CTAS = {
  save: "Save this tip for your next pool visit.",
  share: "Share this with another Abu Dhabi parent.",
  follow: "Follow for calm swimming tips from Coach Ayman.",
  ask: "Ask a swimming question in the comments.",
  whatsapp: "Send us a WhatsApp message to chat about your child's comfort in the water.",
  book: "Book a free initial assessment — no pressure, just clarity.",
} as const;

function knowledgeForSlot(slot: SlotTemplate, context: CoachKnowledgeContext) {
  const searchText = `${slot.contentPillar} ${slot.topic} ${slot.primaryCta}`.toLowerCase();
  const matched = context.entries.filter((entry) => `${entry.category} ${entry.question ?? ""} ${entry.content}`.toLowerCase().split(/\s+/).some((term) => term.length > 3 && searchText.includes(term))).slice(0, 3);
  const selected = matched.length ? matched : context.entries.slice(0, 2);
  const guidance = selected.map((entry) => entry.content.slice(0, 240));
  if (context.researchContext?.answer) {
    guidance.push(`Coach Brain research (supporting context only): ${context.researchContext.answer.slice(0, 600)}`);
  }
  return {
    source: context.source,
    verified: context.verified,
    categories: [...new Set(selected.map((entry) => entry.category))],
    guidance: guidance.slice(0, 4),
  };
}

function gstSlotUtc(dayOffset: number, hourGst: number, start: Date): string {
  const base = new Date(start);
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffset + 1);
  base.setUTCHours(hourGst - 4, 0, 0, 0);
  return base.toISOString();
}

function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized === "reel" || normalized === "short_video" || normalized === "video";
}

function buildVideoBrief(parts: {
  hook: string;
  scene: string;
  strategyLabel: string;
  cta: string;
}): string {
  return [
    "VIDEO BRIEF:",
    `HOOK: ${parts.hook}`,
    "DURATION: 10 seconds (allowed 5–15 seconds)",
    `SCENE: ${parts.scene} — real Abu Dhabi pool context with Coach Ayman, no staged testimonials.`,
    `ON-SCREEN TEXT: ${parts.hook}`,
    `CAPTION LEAD: ${parts.strategyLabel} for kids swimming lessons in Abu Dhabi.`,
    `CTA: ${parts.cta}`,
    "REQUIRED MEDIA: real pool b-roll or coach footage; burned-in captions; no AI-generated child faces; no fake before/after.",
  ].join("\n");
}

function mediaBrief(parts: {
  format: string;
  visualConcept: string;
  headline: string;
  supportingText: string;
  sceneIdea: string;
  cta: string;
  canva: string;
  capcut: string;
  runway?: string;
  videoBrief?: string;
}): string {
  return [
    `FORMAT: ${parts.format}`,
    `VISUAL CONCEPT: ${parts.visualConcept}`,
    `HEADLINE: ${parts.headline}`,
    `SUPPORTING TEXT: ${parts.supportingText}`,
    `SCENE IDEA: ${parts.sceneIdea}`,
    `CTA: ${parts.cta}`,
    parts.videoBrief ?? null,
    `CANVA: ${parts.canva}`,
    parts.runway ? `RUNWAY (optional): ${parts.runway}` : null,
    `CAPCUT: ${parts.capcut}`,
  ].filter(Boolean).join("\n");
}

const SLOT_TEMPLATES: SlotTemplate[] = [
  {
    dayOffset: 0,
    slotHourGst: 9,
    platform: "instagram",
    contentType: "reel",
    language: "en",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "attraction",
    topic: "Short Reel: why kids panic at the pool edge",
    hook: "Most water fear starts before they even get wet.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Short Reel (10 seconds):",
      '0–2s hook on screen: "Most water fear starts before they get wet."',
      "3–8s: child and parent at pool edge, calm coach cue, no pressure.",
      "9–10s: soft CTA text — follow for calm swimming tips.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.follow,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#KidsSwimming", "#WaterConfidence"],
    visualPrompt: mediaBrief({
      format: "Instagram reel · 9:16 · 10s default (5–15s)",
      visualConcept: "Attention reel about a common water-fear moment at the pool edge.",
      headline: "Most water fear starts before they get wet",
      supportingText: "Kids swimming lessons in Abu Dhabi — calm coaching, no pressure.",
      sceneIdea: "Pool edge, parent reassurance, coach nearby, no fake results.",
      cta: PRIMARY_CTAS.follow,
      videoBrief: buildVideoBrief({
        hook: "Most water fear starts before they even get wet.",
        scene: "Child hesitating at the pool edge while Coach Ayman gives one calm cue",
        strategyLabel: "Short Reel — common swimming problem",
        cta: PRIMARY_CTAS.follow,
      }),
      canva: "Cover frame with bold hook text on calm pool background.",
      capcut: "Vertical 9:16, 10-second default pacing, burned-in captions.",
      runway: "Optional b-roll only if real footage is unavailable — no AI-generated child faces.",
    }),
  },
  {
    dayOffset: 1,
    slotHourGst: 12,
    platform: "instagram",
    contentType: "carousel",
    language: "en",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "education",
    topic: "3 calm breathing habits before your child enters the pool",
    hook: "Most kids rush into the water before their body is ready.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Parents in Abu Dhabi often ask where to start with kids swimming lessons.",
      "",
      "Before the first lane or play session, try these three calm habits:",
      "1) Stand together at the pool edge and name three things you both see.",
      "2) Practice slow nose/mouth breathing away from the splash zone.",
      "3) Let your child choose one small goal for the session — not a race, just one skill.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.save,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#SwimmingTips", "#ParentTips"],
    visualPrompt: mediaBrief({
      format: "Instagram carousel · 5 slides · 1080×1350",
      visualConcept: "Education carousel for parents about calm breathing habits.",
      headline: "3 calm habits before the pool",
      supportingText: "Parent-friendly swimming education for Abu Dhabi families.",
      sceneIdea: "Pool-edge education slides, no fabricated progress claims.",
      cta: PRIMARY_CTAS.save,
      canva: "5-slide carousel with numbered parent tips.",
      capcut: "Optional reel cut-down with one tip every 3 seconds.",
    }),
  },
  {
    dayOffset: 2,
    slotHourGst: 9,
    platform: "instagram",
    contentType: "reel",
    language: "en",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "attraction",
    topic: "Short Reel: the rushed kick mistake parents miss",
    hook: "If the kick is frantic, the breath will never settle.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Short Reel (10 seconds):",
      'Hook: "If the kick is frantic, the breath will never settle."',
      "Show one calm correction at the wall — small splashes, relaxed ankles.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.save,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#SwimReel", "#LearnToSwim"],
    visualPrompt: mediaBrief({
      format: "Instagram reel · 9:16 · 10s default (5–15s)",
      visualConcept: "Common kick mistake parents miss during swimming lessons.",
      headline: "If the kick is frantic, the breath will never settle",
      supportingText: "Swimming skills coaching in Abu Dhabi — calm technique first.",
      sceneIdea: "Legs-only kick demo with coach support, no exaggerated claims.",
      cta: PRIMARY_CTAS.save,
      videoBrief: buildVideoBrief({
        hook: "If the kick is frantic, the breath will never settle.",
        scene: "Close-up of a frantic kick then a calm corrected kick at the wall",
        strategyLabel: "Short Reel — common mistake",
        cta: PRIMARY_CTAS.save,
      }),
      canva: "Bold hook title card on pool lane background.",
      capcut: "10-second vertical edit with hook in first 2 seconds.",
      runway: "Optional legs-only b-roll — no AI-generated child faces.",
    }),
  },
  {
    dayOffset: 3,
    slotHourGst: 9,
    platform: "facebook",
    contentType: "post",
    language: "en",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "trust",
    topic: "FAQ: how long until my child feels safe in the water?",
    hook: "Parents ask this every week in Abu Dhabi.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "FAQ for Abu Dhabi parents:",
      "Q: How long until my child feels safe in the water?",
      "A: It depends on comfort, listening skills, and consistency — not age alone.",
      "",
      "We start with small, structured steps: wait spot, calm breathing, one skill at a time.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.share,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#AbuDhabiParents"],
    visualPrompt: mediaBrief({
      format: "Facebook static post · 1200×630",
      visualConcept: "FAQ layout for parents about water confidence timelines.",
      headline: "How long until my child feels safe?",
      supportingText: "Honest parent FAQ — no guaranteed timelines.",
      sceneIdea: "Simple Q&A graphic with pool context photo placeholder.",
      cta: PRIMARY_CTAS.share,
      canva: "FAQ graphic with question headline and short answer bullets.",
      capcut: "Static post — no video required.",
    }),
  },
  {
    dayOffset: 4,
    slotHourGst: 12,
    platform: "instagram",
    contentType: "reel",
    language: "en",
    contentPillar: "safety_awareness",
    contentSlot: "education_midday",
    funnel: "attraction",
    topic: "Short Reel: pool-edge safety check in 10 seconds",
    hook: "Safety first does not mean fear — it means clear rules.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Short Reel (10 seconds):",
      "Quick pool-edge safety check parents can do in 10 seconds.",
      "Supervision · clear entry area · calm wait spot.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.save,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#PoolSafety", "#SwimmingSkills"],
    visualPrompt: mediaBrief({
      format: "Instagram reel · 9:16 · 10s default (5–15s)",
      visualConcept: "Water safety reel for parents at the pool edge.",
      headline: "10-second pool-edge safety check",
      supportingText: "Water safety and swimming skills for Abu Dhabi families.",
      cta: PRIMARY_CTAS.save,
      sceneIdea: "Supervised pool entry area, calm wait spot, no fear-based messaging.",
      videoBrief: buildVideoBrief({
        hook: "Safety first does not mean fear — it means clear rules.",
        scene: "Parent and child at a supervised pool edge with three quick safety checks on screen",
        strategyLabel: "Short Reel — swimming skill / safety",
        cta: PRIMARY_CTAS.save,
      }),
      canva: "Safety checklist cover frame.",
      capcut: "10-second checklist reel with burned-in captions.",
      runway: "Optional pool-edge b-roll only.",
    }),
  },
  {
    dayOffset: 5,
    slotHourGst: 9,
    platform: "instagram",
    contentType: "post",
    language: "en",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "trust",
    topic: "What to tell a nervous child before lesson one",
    hook: "Your child does not need bravery — they need a plan.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Parent advice for lesson one:",
      '• "The coach stays with you the whole time."',
      '• "You can pause on the step whenever you need."',
      '• "We practice small skills before anything new."',
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.share,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#ParentSupport", "#AbuDhabiParents"],
    visualPrompt: mediaBrief({
      format: "Instagram static post · 1080×1350",
      visualConcept: "Parent advice post about nervous first swimming lessons.",
      headline: "Your child needs a plan, not pressure",
      supportingText: "Confidence-building language for Abu Dhabi parents.",
      sceneIdea: "Supportive parent-child tone, no comparison language.",
      cta: PRIMARY_CTAS.share,
      canva: "Quote card with three reassurance bullets.",
      capcut: "Optional story version with text per bullet.",
    }),
  },
  {
    dayOffset: 6,
    slotHourGst: 18,
    platform: "instagram",
    contentType: "post",
    language: "en",
    contentPillar: "offer_booking",
    contentSlot: "conversion_evening",
    funnel: "conversion",
    topic: "Start with a free initial assessment",
    hook: "Not sure which lesson format fits your child?",
    caption: [
      BRAND_WITH_COACH,
      "",
      "🇦🇪 للأهل في أبوظبي: ابدأوا بتقييم أولي مجاني قبل اختيار نوع الحصة.",
      "",
      "Private coaching or small groups up to 4 learners — we help families choose the right starting point.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.book,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#FreeAssessment", "#AbuDhabiSwimming"],
    visualPrompt: mediaBrief({
      format: "Instagram conversion post · 1080×1350",
      visualConcept: "Free initial assessment CTA for swimming lessons.",
      headline: "Free initial assessment",
      supportingText: "WhatsApp for messages · phone line for admin calls only.",
      sceneIdea: "Clean CTA graphic — no fabricated reviews.",
      cta: PRIMARY_CTAS.book,
      canva: "Conversion template with WhatsApp and phone roles separated.",
      capcut: "Optional 10s CTA bumper with contact details on screen.",
    }),
  },
  {
    dayOffset: 7,
    slotHourGst: 12,
    platform: "instagram",
    contentType: "reel",
    language: "en",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "education",
    topic: "Short Reel: bubble line to calm breathing",
    hook: "Watch the shoulders drop when breathing is calm.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Short Reel (10 seconds):",
      "Bubble line at the wall → calm exhale → relaxed shoulders.",
      "Educational reel for parents watching swimming skills develop safely.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.save,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#SwimReel", "#CoachAyman"],
    visualPrompt: mediaBrief({
      format: "Instagram reel · 9:16 · 10s default (5–15s)",
      visualConcept: "Educational reel about calm breathing at the wall.",
      headline: "Watch the shoulders drop when breathing is calm",
      supportingText: "Swimming education for kids in Abu Dhabi.",
      sceneIdea: "Bubble line drill with coach support, calm pacing.",
      cta: PRIMARY_CTAS.save,
      videoBrief: buildVideoBrief({
        hook: "Watch the shoulders drop when breathing is calm.",
        scene: "Bubble line drill at the pool wall with visible calm exhale",
        strategyLabel: "Short Reel — educational",
        cta: PRIMARY_CTAS.save,
      }),
      canva: "Hook cover frame with pool-wall context.",
      capcut: "10-second educational reel with captions on each step.",
      runway: "Optional slow-motion exhale b-roll only.",
    }),
  },
  {
    dayOffset: 8,
    slotHourGst: 9,
    platform: "facebook",
    contentType: "carousel",
    language: "en",
    contentPillar: "real_progress",
    contentSlot: "education_midday",
    funnel: "trust",
    topic: "Structured swimming progress parents can track",
    hook: "Small skills build confidence before speed.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Structured swimming progress parents can notice:",
      "1) Calm wait spot at the pool edge",
      "2) Comfortable exhale at the wall",
      "3) One new skill per session",
      "",
      "Progress is personal — we track skills, not comparisons.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.save,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#BeginnerSwimming"],
    visualPrompt: mediaBrief({
      format: "Facebook carousel · 4 slides · 1080×1080",
      visualConcept: "Structured progress carousel — trust and proof without fake results.",
      headline: "Structured swimming progress parents can track",
      supportingText: "Confidence and skills over speed.",
      sceneIdea: "Skill-step slides, no before/after claims.",
      cta: PRIMARY_CTAS.save,
      canva: "Four-slide progress checklist carousel.",
      capcut: "Optional reel cut-down with one skill per slide.",
    }),
  },
  {
    dayOffset: 9,
    slotHourGst: 18,
    platform: "instagram",
    contentType: "post",
    language: "en",
    contentPillar: "coach_authority",
    contentSlot: "conversion_evening",
    funnel: "conversion",
    topic: "Coach Ayman on building water confidence in Abu Dhabi",
    hook: "Calm coaching beats pressure every time.",
    caption: [
      BRAND_WITH_COACH,
      "",
      "Trust + next step:",
      "Coach Ayman focuses on structured swimming progress, water safety, and confidence for children in Abu Dhabi.",
      "",
      "Start with a free initial assessment — no pressure, just clarity.",
    ].join("\n"),
    primaryCta: PRIMARY_CTAS.book,
    cta: CONFIRMED_CTA,
    hashtags: [],
    topicHashtags: ["#SwimmingCoach", "#AbuDhabiSwimming"],
    visualPrompt: mediaBrief({
      format: "Instagram conversion post · 1080×1350",
      visualConcept: "Authority + conversion post for Coach Ayman swimming academy.",
      headline: "Calm coaching beats pressure every time",
      supportingText: "Swimming coach Abu Dhabi — structured lessons for kids.",
      sceneIdea: "Coach authority portrait with calm pool context, no fake testimonials.",
      cta: PRIMARY_CTAS.book,
      canva: "Trust + conversion layout with assessment CTA.",
      capcut: "Optional 10s authority bumper with CTA end card.",
    }),
  },
];

function ensureRelaxFixBrandLead(caption: string): string {
  if (/relax fix uae/i.test(caption)) return caption;
  return `${BRAND_WITH_COACH}\n\n${caption}`;
}

function buildHashtags(platform: GeneratedBatchItem["platform"], contentType: string, topicHashtags: string[]): string[] {
  const normalized = platform.toLowerCase();
  const unique = ["#RelaxFixUAE", ...topicHashtags];
  const deduped = [...new Set(unique.map((tag) => tag.trim()).filter(Boolean))];
  if (normalized === "facebook") return deduped.slice(0, 1);
  return deduped.slice(0, 5);
}

export async function contentFingerprint(seed: string): Promise<string> {
  const data = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildBatchTrackedCta(platform: string, pillar: string): string {
  const params = new URLSearchParams();
  params.set("utm_source", platform.toLowerCase());
  params.set("utm_medium", "social");
  params.set("utm_campaign", "relaxfix-content-batch");
  params.set("utm_content", pillar);
  params.set("text", WHATSAPP_OPENER);
  const leadUrl = `https://wa.me/971588219130?${params.toString()}`;
  return [
    BRAND_LINE,
    "WhatsApp 058 821 9130 — messages & booking",
    "Call 055 137 8660 — admin team (phone calls only)",
    "Free initial assessment.",
    `WhatsApp link: ${leadUrl}`,
  ].join("\n");
}

function buildCaptionBody(slot: SlotTemplate): string {
  const branded = ensureRelaxFixBrandLead(slot.caption);
  return `${branded}\n\n${slot.primaryCta}`;
}

export async function buildCoachAyman2026BatchItems(start = new Date(), batchNonce = start.toISOString(), knowledgeContext: CoachKnowledgeContext = EMPTY_COACH_KNOWLEDGE): Promise<GeneratedBatchItem[]> {
  const items: GeneratedBatchItem[] = [];
  for (let index = 0; index < SLOT_TEMPLATES.length; index += 1) {
    const slot = SLOT_TEMPLATES[index];
    const fingerprintSeed = `${COACH_AYMAN_PROVIDER_ID}:${batchNonce}:${index}:${slot.platform}:${slot.topic}`;
    const trackedCta = buildBatchTrackedCta(slot.platform, slot.contentPillar);
    const captionBody = buildCaptionBody(slot);
    items.push({
      platform: slot.platform,
      contentType: slot.contentType,
      language: slot.language,
      contentPillar: slot.contentPillar,
      contentSlot: slot.contentSlot,
      plannedFor: gstSlotUtc(slot.dayOffset, slot.slotHourGst, start),
      topic: slot.topic,
      hook: slot.hook,
      caption: `${captionBody}\n\n${trackedCta}`,
      cta: trackedCta,
      hashtags: buildHashtags(slot.platform, slot.contentType, slot.topicHashtags),
      visualPrompt: slot.visualPrompt,
      contentFingerprint: await contentFingerprint(fingerprintSeed),
      knowledgeContext: knowledgeForSlot(slot, knowledgeContext),
    });
  }
  return items;
}

const FUNNEL_BY_PILLAR: Partial<Record<DbContentPillar, MarketingFunnel>> = {
  offer_booking: "conversion",
  water_fear: "attraction",
  confidence: "engagement",
  parent_concerns: "trust",
  safety_awareness: "trust",
  coach_authority: "trust",
  behind_the_scenes: "engagement",
  real_progress: "education",
  swimming_education: "education",
  aqua_training: "attraction",
};

function funnelForTemplate(slot: SlotTemplate): MarketingFunnel {
  return slot.funnel ?? FUNNEL_BY_PILLAR[slot.contentPillar] ?? "education";
}

export function validateCoachAymanBatch(items: GeneratedBatchItem[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (items.length !== COACH_AYMAN_BATCH_SIZE) errors.push(`expected ${COACH_AYMAN_BATCH_SIZE} items`);

  const fingerprints = new Set<string>();
  const planned = new Set<string>();
  const contentTypes = new Set<string>();
  const primaryCtas = new Set<string>();
  const funnels = new Set<MarketingFunnel>();
  let conversionCount = 0;
  let staticPostCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const slot = SLOT_TEMPLATES[index];

    if (fingerprints.has(item.contentFingerprint)) errors.push("duplicate fingerprint");
    fingerprints.add(item.contentFingerprint);
    if (planned.has(item.plannedFor)) errors.push("duplicate plannedFor");
    planned.add(item.plannedFor);

    contentTypes.add(item.contentType.toLowerCase());
    if (item.contentType.toLowerCase() === "post") staticPostCount += 1;
    if (slot) {
      funnels.add(funnelForTemplate(slot));
      primaryCtas.add(slot.primaryCta);
    }

    if (item.contentPillar === "offer_booking") conversionCount += 1;
    if (!item.cta.includes(WHATSAPP) || !item.cta.includes(PHONE)) errors.push("missing confirmed CTA");
    if (!/messages & booking/i.test(item.caption)) errors.push("missing whatsapp role label");
    if (!/phone calls only/i.test(item.caption)) errors.push("missing call role label");
    if (/wa\.me\/971551378660/i.test(item.caption)) errors.push("8660 must not be used as whatsapp link");
    if (!/relax fix uae/i.test(item.caption)) errors.push("missing Relax Fix UAE brand lead");
    if (item.hashtags[0] !== "#RelaxFixUAE") errors.push("primary hashtag must be RelaxFixUAE");
    if (item.platform === "facebook" && item.hashtags.length > 1) errors.push("facebook should use at most one hashtag");
    if (item.platform === "instagram" && item.hashtags.length > 5) errors.push("instagram hashtag count out of range");
    if (item.platform === "tiktok" && item.hashtags.length > 5) errors.push("tiktok hashtag count out of range");
    if (item.hashtags.length < 1) errors.push("missing hashtags");
    if (FORBIDDEN_CLAIMS.test(`${item.topic} ${item.hook} ${item.caption}`)) errors.push("forbidden claim language");
    if (!/FORMAT:/i.test(item.visualPrompt) || !/CANVA:/i.test(item.visualPrompt) || !/CAPCUT:/i.test(item.visualPrompt)) {
      errors.push("missing production brief");
    }
    if (slot && !item.caption.includes(slot.primaryCta)) errors.push("missing primary CTA variety line");
  }

  if (conversionCount < 1 || conversionCount > 3) errors.push("conversion mix out of range");
  if (staticPostCount > 4) errors.push("too many static posts");
  if (contentTypes.size < 3) errors.push("content type diversity too low");
  if (primaryCtas.size < 4) errors.push("CTA variety too low");
  if (funnels.size < 4) errors.push("funnel diversity too low");

  const reelCount = items.filter((item) => ["reel", "short_video", "video"].includes(item.contentType.toLowerCase())).length;
  if (reelCount < 4) errors.push("expected at least 4 short reels");

  const sorted = [...items].sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));
  for (let index = 1; index < sorted.length; index += 1) {
    const previousDay = sorted[index - 1].plannedFor.slice(0, 10);
    const currentDay = sorted[index].plannedFor.slice(0, 10);
    const previousDate = new Date(`${previousDay}T00:00:00.000Z`);
    const currentDate = new Date(`${currentDay}T00:00:00.000Z`);
    const diffDays = (currentDate.getTime() - previousDate.getTime()) / 86_400_000;
    if (diffDays !== 1) errors.push("plannedFor days are not consecutive calendar days");
  }

  const publishDays = new Set(sorted.map((item) => item.plannedFor.slice(0, 10)));
  if (publishDays.size !== items.length) errors.push("duplicate publish days in batch");
  for (const item of sorted) {
    if (!["instagram", "facebook"].includes(item.platform)) {
      errors.push("each batch day must use instagram or facebook for daily publishing");
      break;
    }
  }

  const platforms = new Set(items.map((item) => item.platform));
  if (!platforms.has("instagram") || !platforms.has("facebook")) {
    errors.push("missing instagram or facebook coverage");
  }

  return { valid: errors.length === 0, errors };
}

export function summarizeCoachAymanBatch(items: GeneratedBatchItem[]) {
  const educational = items.filter((item) => item.contentPillar !== "offer_booking").length;
  return {
    total: items.length,
    educational,
    conversion: items.length - educational,
    reels: items.filter((item) => ["reel", "short_video", "video"].includes(item.contentType.toLowerCase())).length,
    platforms: [...new Set(items.map((item) => item.platform))],
    contentTypes: [...new Set(items.map((item) => item.contentType))],
  };
}

function buildStoryBrief(parts: {
  hook: string;
  frames: string[];
  cta: string;
}): string {
  const frameLines = parts.frames.map((frame, index) => `FRAME ${index + 1}: ${frame}`);
  return [
    "STORY BRIEF:",
    `HOOK: ${parts.hook}`,
    "FORMAT: Instagram Story sequence · 9:16 · manual publish",
    ...frameLines,
    `CTA: ${parts.cta}`,
    "NOTE: Brief only — no automatic Stories publish with current Meta/n8n integration.",
  ].join("\n");
}

function reelBrief(parts: {
  format: string;
  headline: string;
  hook: string;
  scene: string;
  strategyLabel: string;
  supportingText: string;
  cta: string;
  canva: string;
  capcut: string;
}): string {
  return [
    `FORMAT: ${parts.format}`,
    `VISUAL CONCEPT: ${parts.strategyLabel}`,
    `HEADLINE: ${parts.headline}`,
    `SUPPORTING TEXT: ${parts.supportingText}`,
    `SCENE IDEA: ${parts.scene}`,
    `CTA: ${parts.cta}`,
    [
      "VIDEO BRIEF:",
      `HOOK: ${parts.hook}`,
      "DURATION: 10 seconds (allowed 5–15 seconds)",
      `SCENE: ${parts.scene} — real Abu Dhabi pool context with Coach Ayman, no staged testimonials.`,
      `ON-SCREEN TEXT: ${parts.hook}`,
      `CAPTION LEAD: ${parts.strategyLabel} for kids swimming lessons in Abu Dhabi.`,
      `CTA: ${parts.cta}`,
      "REQUIRED MEDIA: real pool b-roll or coach footage; burned-in captions; no AI-generated child faces; no fake before/after.",
    ].join("\n"),
    `CANVA: ${parts.canva}`,
    `CAPCUT: ${parts.capcut}`,
  ].join("\n");
}

function postBrief(parts: {
  format: string;
  headline: string;
  supportingText: string;
  sceneIdea: string;
  cta: string;
  canva: string;
  capcut?: string;
}): string {
  return [
    `FORMAT: ${parts.format}`,
    `VISUAL CONCEPT: ${parts.headline}`,
    `HEADLINE: ${parts.headline}`,
    `SUPPORTING TEXT: ${parts.supportingText}`,
    `SCENE IDEA: ${parts.sceneIdea}`,
    `CTA: ${parts.cta}`,
    `CANVA: ${parts.canva}`,
    `CAPCUT: ${parts.capcut ?? "Static post — optional 10s cut-down."}`,
  ].join("\n");
}

const BRAND = "Relax Fix UAE Swimming Academy — Coach Ayman";
const CTA_BLOCK = [
  "WhatsApp 058 821 9130 — messages & booking",
  "Call 055 137 8660 — admin team (phone calls only)",
  "Free initial assessment.",
].join("\n");

const COACH_AYMAN_30DAY_SLOT_TEMPLATES: SlotTemplate[] = [
  {
    dayOffset: 0, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "parent_concerns", contentSlot: "trust_morning", funnel: "attraction",
    topic: "Short Reel: why kids panic at the pool edge",
    hook: "Most water fear starts before they even get wet.",
    caption: `${BRAND}\n\nShort Reel (10s): pool-edge hesitation with one calm coach cue.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#KidsSwimming", "#WaterConfidence"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Most water fear starts before they get wet", hook: "Most water fear starts before they even get wet.", scene: "Child at pool edge with Coach Ayman nearby", strategyLabel: "Short Reel — water confidence", supportingText: "Kids swimming lessons Abu Dhabi", cta: "Save this tip", canva: "Bold hook on calm pool background", capcut: "10s vertical with burned-in captions" }),
  },
  {
    dayOffset: 1, slotHourGst: 12, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "swimming_education", contentSlot: "education_midday", funnel: "education",
    topic: "Story sequence: 3 breathing cues before entering the pool",
    hook: "Calm breath before calm water.",
    caption: `${BRAND}\n\nStory sequence for parents: three breathing cues before your child enters the pool.\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingTips", "#ParentTips"],
    visualPrompt: buildStoryBrief({ hook: "Calm breath before calm water.", frames: ["Text: Name three things you see at the pool edge", "Text: Slow nose/mouth breath away from splash", "Poll sticker: Which cue helps your child most?"], cta: "Share with another Abu Dhabi parent" }),
  },
  {
    dayOffset: 2, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "swimming_education", contentSlot: "education_midday", funnel: "attraction",
    topic: "Short Reel: frantic kick vs calm kick",
    hook: "If the kick is frantic, the breath will never settle.",
    caption: `${BRAND}\n\nShort Reel (10s): one calm kick correction at the wall.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimReel", "#LearnToSwim"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Frantic kick vs calm kick", hook: "If the kick is frantic, the breath will never settle.", scene: "Legs-only kick demo at the wall", strategyLabel: "Short Reel — swimming skills", supportingText: "Swimming coach Abu Dhabi", cta: "Save this tip", canva: "Hook title on lane background", capcut: "Hook in first 2 seconds" }),
  },
  {
    dayOffset: 3, slotHourGst: 12, platform: "facebook", contentType: "post", language: "en",
    contentPillar: "parent_concerns", contentSlot: "trust_morning", funnel: "trust",
    topic: "FAQ: how long until my child feels safe in the water?",
    hook: "Parents ask this every week in Abu Dhabi.",
    caption: `${BRAND}\n\nFAQ: How long until my child feels safe?\nIt depends on comfort, listening skills, and consistency — not age alone.\nWe use structured small steps: wait spot, calm breathing, one skill at a time.\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#AbuDhabiParents"],
    visualPrompt: postBrief({ format: "Facebook static post · 1200×630", headline: "How long until my child feels safe?", supportingText: "Honest parent FAQ — no guaranteed timelines", sceneIdea: "Q&A graphic with pool photo placeholder", cta: "Share with another parent", canva: "FAQ layout with question headline" }),
  },
  {
    dayOffset: 4, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "safety_awareness", contentSlot: "education_midday", funnel: "attraction",
    topic: "Short Reel: 10-second pool-edge safety check",
    hook: "Safety first does not mean fear — it means clear rules.",
    caption: `${BRAND}\n\nShort Reel (10s): supervision · clear entry · calm wait spot.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#PoolSafety", "#SwimmingSkills"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "10-second pool-edge safety check", hook: "Safety first does not mean fear — it means clear rules.", scene: "Supervised pool entry with three on-screen checks", strategyLabel: "Short Reel — water safety", supportingText: "Kids swimming lessons Abu Dhabi", cta: "Save this tip", canva: "Safety checklist cover frame", capcut: "Checklist reel with captions" }),
  },
  {
    dayOffset: 5, slotHourGst: 18, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "offer_booking", contentSlot: "conversion_evening", funnel: "conversion",
    topic: "Story sequence: free initial assessment reminder",
    hook: "Not sure which lesson format fits your child?",
    caption: `${BRAND}\n\nStory CTA: free initial assessment — no pressure, just clarity.\n\nBook a free initial assessment — no pressure, just clarity.`,
    primaryCta: "Book a free initial assessment — no pressure, just clarity.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#FreeAssessment", "#AbuDhabiSwimming"],
    visualPrompt: buildStoryBrief({ hook: "Not sure which lesson format fits your child?", frames: ["Text: Private coaching or small groups up to 4", "Text: Free initial assessment — WhatsApp for messages", "Link sticker placeholder: wa.me/971588219130"], cta: "Book free initial assessment via WhatsApp" }),
  },
  {
    dayOffset: 6, slotHourGst: 9, platform: "instagram", contentType: "post", language: "en",
    contentPillar: "parent_concerns", contentSlot: "trust_morning", funnel: "trust",
    topic: "What to tell a nervous child before lesson one",
    hook: "Your child does not need bravery — they need a plan.",
    caption: `${BRAND}\n\nBefore lesson one:\n• The coach stays with you the whole time.\n• You can pause on the step whenever you need.\n• We practice small skills before anything new.\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#ParentSupport", "#AbuDhabiParents"],
    visualPrompt: postBrief({ format: "Instagram static post · 1080×1350", headline: "Your child needs a plan, not pressure", supportingText: "Parent education for Abu Dhabi families", sceneIdea: "Three reassurance bullets on calm background", cta: "Share with another parent", canva: "Quote card with three bullets" }),
  },
  {
    dayOffset: 7, slotHourGst: 12, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "confidence", contentSlot: "education_midday", funnel: "engagement",
    topic: "Short Reel: wait spot builds confidence",
    hook: "Confidence starts with knowing where to stand.",
    caption: `${BRAND}\n\nShort Reel (10s): calm wait spot at the pool edge before skills begin.\n\nFollow for calm swimming tips from Coach Ayman.`,
    primaryCta: "Follow for calm swimming tips from Coach Ayman.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#WaterConfidence", "#KidsSwimming"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Wait spot builds confidence", hook: "Confidence starts with knowing where to stand.", scene: "Child at designated wait spot with coach", strategyLabel: "Short Reel — children's confidence", supportingText: "Structured swimming progress", cta: "Follow for calm tips", canva: "Wait spot label on pool deck", capcut: "10s with on-screen wait spot text" }),
  },
  {
    dayOffset: 8, slotHourGst: 9, platform: "facebook", contentType: "carousel", language: "en",
    contentPillar: "real_progress", contentSlot: "education_midday", funnel: "trust",
    topic: "Structured swimming progress parents can track",
    hook: "Small skills build confidence before speed.",
    caption: `${BRAND}\n\nStructured progress parents can notice:\n1) Calm wait spot\n2) Comfortable exhale at the wall\n3) One new skill per session\nProgress is personal — we track skills, not comparisons.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#BeginnerSwimming"],
    visualPrompt: postBrief({ format: "Facebook carousel · 4 slides · 1080×1080", headline: "Structured swimming progress parents can track", supportingText: "Trust through skill steps, not comparisons", sceneIdea: "Four skill-step slides", cta: "Save this tip", canva: "Four-slide progress checklist" }),
  },
  {
    dayOffset: 9, slotHourGst: 12, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "safety_awareness", contentSlot: "education_midday", funnel: "education",
    topic: "Story sequence: water safety rules for families",
    hook: "Clear rules keep pool time calm.",
    caption: `${BRAND}\n\nStory: three family water safety rules for Abu Dhabi pool visits.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#PoolSafety"],
    visualPrompt: buildStoryBrief({ hook: "Clear rules keep pool time calm.", frames: ["Text: Always know who is supervising", "Text: Enter only at the designated area", "Quiz: True/False — safety means fear? (Answer: False)"], cta: "Save for your next pool visit" }),
  },
  {
    dayOffset: 10, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "swimming_education", contentSlot: "education_midday", funnel: "education",
    topic: "Short Reel: bubble line to calm breathing",
    hook: "Watch the shoulders drop when breathing is calm.",
    caption: `${BRAND}\n\nShort Reel (10s): bubble line at the wall → calm exhale.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimReel", "#CoachAyman"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Bubble line to calm breathing", hook: "Watch the shoulders drop when breathing is calm.", scene: "Bubble line drill at pool wall", strategyLabel: "Short Reel — parent education", supportingText: "Swimming skills for kids", cta: "Save this tip", canva: "Hook cover with pool-wall context", capcut: "Educational reel with step captions" }),
  },
  {
    dayOffset: 11, slotHourGst: 12, platform: "facebook", contentType: "post", language: "en",
    contentPillar: "coach_authority", contentSlot: "trust_morning", funnel: "trust",
    topic: "Why structured swimming lessons beat random pool play",
    hook: "Play is fun — structure builds skills.",
    caption: `${BRAND}\n\nStructured swimming lessons give children repeatable steps: wait spot, breathing, one skill focus per session.\nCoach Ayman builds water confidence and safety for Abu Dhabi families.\n\nFollow for calm swimming tips from Coach Ayman.`,
    primaryCta: "Follow for calm swimming tips from Coach Ayman.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingCoach"],
    visualPrompt: postBrief({ format: "Facebook static post · 1200×630", headline: "Structure builds skills", supportingText: "Coach authority — swimming coach Abu Dhabi", sceneIdea: "Coach with structured lesson plan visual", cta: "Follow for calm tips", canva: "Authority post with structured steps graphic" }),
  },
  {
    dayOffset: 12, slotHourGst: 18, platform: "instagram", contentType: "post", language: "en",
    contentPillar: "offer_booking", contentSlot: "conversion_evening", funnel: "conversion",
    topic: "Start with a free initial assessment",
    hook: "Not sure which lesson format fits your child?",
    caption: `${BRAND}\n\n🇦🇪 للأهل في أبوظبي: ابدأوا بتقييم أولي مجاني قبل اختيار نوع الحصة.\nPrivate coaching or small groups up to 4 learners.\n\nBook a free initial assessment — no pressure, just clarity.`,
    primaryCta: "Book a free initial assessment — no pressure, just clarity.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#FreeAssessment", "#AbuDhabiSwimming"],
    visualPrompt: postBrief({ format: "Instagram conversion post · 1080×1350", headline: "Free initial assessment", supportingText: "WhatsApp for messages · phone for admin calls", sceneIdea: "Clean CTA graphic — no fabricated reviews", cta: "Book free assessment", canva: "Conversion template with contact roles separated" }),
  },
  {
    dayOffset: 13, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "water_fear", contentSlot: "trust_morning", funnel: "attraction",
    topic: "Short Reel: splashing is not the same as swimming",
    hook: "Splashing looks active — but skills need calm.",
    caption: `${BRAND}\n\nShort Reel (10s): splashing vs controlled exhale at the wall.\n\nAsk a swimming question in the comments.`,
    primaryCta: "Ask a swimming question in the comments.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#KidsSwimming", "#LearnToSwim"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Splashing is not swimming", hook: "Splashing looks active — but skills need calm.", scene: "Contrast splashing with calm wall exhale", strategyLabel: "Short Reel — swimming education", supportingText: "Parent education Abu Dhabi", cta: "Ask a question in comments", canva: "Split-frame hook graphic", capcut: "10s contrast edit" }),
  },
  {
    dayOffset: 14, slotHourGst: 12, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "parent_concerns", contentSlot: "education_midday", funnel: "trust",
    topic: "Story sequence: what to pack for lesson one",
    hook: "Lesson one goes smoother with a simple checklist.",
    caption: `${BRAND}\n\nStory checklist for Abu Dhabi parents before the first swimming lesson.\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#ParentTips"],
    visualPrompt: buildStoryBrief({ hook: "Lesson one goes smoother with a simple checklist.", frames: ["Text: Towel + swimwear + water bottle", "Text: Arrive 10 minutes early for calm start", "Question sticker: What does your child ask before lessons?"], cta: "Share with another Abu Dhabi parent" }),
  },
  {
    dayOffset: 15, slotHourGst: 9, platform: "facebook", contentType: "post", language: "en",
    contentPillar: "swimming_education", contentSlot: "education_midday", funnel: "education",
    topic: "Myth vs fact: younger is always better for swimming",
    hook: "Readiness matters more than age alone.",
    caption: `${BRAND}\n\nMyth: younger is always better for swimming.\nFact: readiness — listening, comfort, and consistency — matters more than age alone.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingTips"],
    visualPrompt: postBrief({ format: "Facebook static post · 1200×630", headline: "Readiness matters more than age", supportingText: "Parent education — no age guarantees", sceneIdea: "Myth vs fact split graphic", cta: "Save this tip", canva: "Myth/Fact two-column layout" }),
  },
  {
    dayOffset: 16, slotHourGst: 12, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "aqua_training", contentSlot: "education_midday", funnel: "attraction",
    topic: "Short Reel: floating starts with relaxed shoulders",
    hook: "Tense shoulders sink — relaxed shoulders float easier.",
    caption: `${BRAND}\n\nShort Reel (10s): shoulder relaxation cue at the wall.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimReel", "#WaterConfidence"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Relaxed shoulders float easier", hook: "Tense shoulders sink — relaxed shoulders float easier.", scene: "Shoulder relaxation demo with coach support", strategyLabel: "Short Reel — swimming skills", supportingText: "Kids swimming lessons Abu Dhabi", cta: "Save this tip", canva: "Shoulder cue title card", capcut: "Slow-motion shoulder drop" }),
  },
  {
    dayOffset: 17, slotHourGst: 18, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "confidence", contentSlot: "conversion_evening", funnel: "engagement",
    topic: "Story sequence: celebrate small swimming wins",
    hook: "Small wins build big confidence.",
    caption: `${BRAND}\n\nStory: celebrate one small swimming win after each session.\n\nFollow for calm swimming tips from Coach Ayman.`,
    primaryCta: "Follow for calm swimming tips from Coach Ayman.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#WaterConfidence"],
    visualPrompt: buildStoryBrief({ hook: "Small wins build big confidence.", frames: ["Text: Name one skill your child tried today", "Text: No comparisons — one skill at a time", "Emoji slider: How proud are you of today's effort?"], cta: "Follow for calm swimming tips" }),
  },
  {
    dayOffset: 18, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "coach_authority", contentSlot: "trust_morning", funnel: "trust",
    topic: "Short Reel: Coach Ayman's calm correction style",
    hook: "One cue. One skill. One calm repeat.",
    caption: `${BRAND}\n\nShort Reel (10s): Coach Ayman's one-cue correction at the wall.\n\nFollow for calm swimming tips from Coach Ayman.`,
    primaryCta: "Follow for calm swimming tips from Coach Ayman.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingCoach", "#CoachAyman"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "One cue. One skill. One repeat.", hook: "One cue. One skill. One calm repeat.", scene: "Coach giving single calm correction", strategyLabel: "Short Reel — coach authority", supportingText: "Swimming coach Abu Dhabi", cta: "Follow for calm tips", canva: "Coach authority cover frame", capcut: "10s authority reel" }),
  },
  {
    dayOffset: 19, slotHourGst: 12, platform: "facebook", contentType: "post", language: "en",
    contentPillar: "parent_concerns", contentSlot: "education_midday", funnel: "trust",
    topic: "What happens in a free initial assessment",
    hook: "No pressure — just clarity on where to start.",
    caption: `${BRAND}\n\nFree initial assessment:\n• Meet Coach Ayman\n• Discuss comfort level and goals\n• Recommend private coaching or small group (up to 4)\nNo pressure — just clarity.\n\nBook a free initial assessment — no pressure, just clarity.`,
    primaryCta: "Book a free initial assessment — no pressure, just clarity.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#FreeAssessment"],
    visualPrompt: postBrief({ format: "Facebook static post · 1200×630", headline: "What happens in a free initial assessment", supportingText: "Conversion with trust — no pressure", sceneIdea: "Three-step assessment outline", cta: "Book free assessment", canva: "Assessment steps infographic" }),
  },
  {
    dayOffset: 20, slotHourGst: 9, platform: "instagram", contentType: "post", language: "en",
    contentPillar: "safety_awareness", contentSlot: "trust_morning", funnel: "trust",
    topic: "Supervision rules every Abu Dhabi parent should know",
    hook: "Active supervision beats assumptions.",
    caption: `${BRAND}\n\nWater safety for families:\n• Know who is watching at all times\n• Stay within arm's reach for beginners\n• Review pool rules before play begins\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#PoolSafety", "#AbuDhabiParents"],
    visualPrompt: postBrief({ format: "Instagram static post · 1080×1350", headline: "Active supervision beats assumptions", supportingText: "Water safety parent education", sceneIdea: "Three supervision rules on pool background", cta: "Share with another parent", canva: "Safety rules checklist graphic" }),
  },
  {
    dayOffset: 21, slotHourGst: 12, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "behind_the_scenes", contentSlot: "education_midday", funnel: "engagement",
    topic: "Story sequence: a calm lesson setup",
    hook: "Calm setup before calm swimming.",
    caption: `${BRAND}\n\nBehind the scenes: how a structured lesson starts calmly.\n\nAsk a swimming question in the comments.`,
    primaryCta: "Ask a swimming question in the comments.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#CoachAyman"],
    visualPrompt: buildStoryBrief({ hook: "Calm setup before calm swimming.", frames: ["BTS photo: pool equipment laid out", "Text: Wait spot marked before learners arrive", "Text: One skill focus written on board"], cta: "Ask a swimming question in comments" }),
  },
  {
    dayOffset: 22, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "real_progress", contentSlot: "education_midday", funnel: "education",
    topic: "Short Reel: one skill per session",
    hook: "More skills at once means less calm.",
    caption: `${BRAND}\n\nShort Reel (10s): one focused skill per session.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#BeginnerSwimming"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "One skill per session", hook: "More skills at once means less calm.", scene: "Single skill focus at the wall", strategyLabel: "Short Reel — structured progress", supportingText: "Structured swimming progress", cta: "Save this tip", canva: "One skill focus title card", capcut: "10s single-skill demo" }),
  },
  {
    dayOffset: 23, slotHourGst: 12, platform: "instagram", contentType: "carousel", language: "en",
    contentPillar: "swimming_education", contentSlot: "education_midday", funnel: "education",
    topic: "5 signs your child is ready for the next swimming skill",
    hook: "Readiness shows in calm, not speed.",
    caption: `${BRAND}\n\n5 signs of readiness:\n1) Calm wait spot\n2) Comfortable exhale\n3) Listens to one cue\n4) Willing to repeat calmly\n5) Asks to try again\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingTips", "#ParentTips"],
    visualPrompt: postBrief({ format: "Instagram carousel · 5 slides · 1080×1350", headline: "5 signs of readiness", supportingText: "Parent education — structured progress", sceneIdea: "Five numbered readiness slides", cta: "Save this tip", canva: "Five-slide carousel" }),
  },
  {
    dayOffset: 24, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "parent_concerns", contentSlot: "trust_morning", funnel: "attraction",
    topic: "Short Reel: comparing siblings slows progress",
    hook: "Every child learns swimming at their own pace.",
    caption: `${BRAND}\n\nShort Reel (10s): focus on one child's skill, not sibling comparisons.\n\nShare this with another Abu Dhabi parent.`,
    primaryCta: "Share this with another Abu Dhabi parent.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#ParentSupport"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Every child learns at their own pace", hook: "Every child learns swimming at their own pace.", scene: "One child focused practice without comparison", strategyLabel: "Short Reel — parent education", supportingText: "Trust and confidence building", cta: "Share with another parent", canva: "Anti-comparison message card", capcut: "10s supportive reel" }),
  },
  {
    dayOffset: 25, slotHourGst: 18, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "offer_booking", contentSlot: "conversion_evening", funnel: "conversion",
    topic: "Story sequence: WhatsApp booking path",
    hook: "Questions about kids swimming lessons in Abu Dhabi?",
    caption: `${BRAND}\n\nStory: how to reach Coach Ayman Swimming for a free initial assessment.\n\nSend us a WhatsApp message to chat about your child's comfort in the water.`,
    primaryCta: "Send us a WhatsApp message to chat about your child's comfort in the water.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#AbuDhabiSwimming"],
    visualPrompt: buildStoryBrief({ hook: "Questions about kids swimming lessons in Abu Dhabi?", frames: ["Text: WhatsApp 058 821 9130 — messages & booking", "Text: Call 055 137 8660 — admin team only", "Countdown sticker: Free initial assessment"], cta: "WhatsApp for messages and booking" }),
  },
  {
    dayOffset: 26, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "safety_awareness", contentSlot: "education_midday", funnel: "education",
    topic: "Short Reel: enter the water feet-first",
    hook: "Feet-first entry keeps control at the edge.",
    caption: `${BRAND}\n\nShort Reel (10s): feet-first pool entry demo.\n\nSave this tip for your next pool visit.`,
    primaryCta: "Save this tip for your next pool visit.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#PoolSafety", "#SwimReel"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Feet-first entry keeps control", hook: "Feet-first entry keeps control at the edge.", scene: "Feet-first entry demonstration", strategyLabel: "Short Reel — water safety", supportingText: "Kids swimming lessons Abu Dhabi", cta: "Save this tip", canva: "Feet-first entry diagram overlay", capcut: "10s safety demo reel" }),
  },
  {
    dayOffset: 27, slotHourGst: 12, platform: "facebook", contentType: "post", language: "en",
    contentPillar: "coach_authority", contentSlot: "conversion_evening", funnel: "conversion",
    topic: "Coach Ayman on building water confidence in Abu Dhabi",
    hook: "Calm coaching beats pressure every time.",
    caption: `${BRAND}\n\nCoach Ayman focuses on structured swimming progress, water safety, and confidence for children in Abu Dhabi.\nStart with a free initial assessment — no pressure, just clarity.\n\nBook a free initial assessment — no pressure, just clarity.`,
    primaryCta: "Book a free initial assessment — no pressure, just clarity.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#SwimmingCoach", "#AbuDhabiSwimming"],
    visualPrompt: postBrief({ format: "Facebook conversion post · 1200×630", headline: "Calm coaching beats pressure", supportingText: "Coach authority + conversion CTA", sceneIdea: "Coach portrait with assessment CTA", cta: "Book free assessment", canva: "Trust + conversion layout" }),
  },
  {
    dayOffset: 28, slotHourGst: 9, platform: "instagram", contentType: "reel", language: "en",
    contentPillar: "confidence", contentSlot: "trust_morning", funnel: "engagement",
    topic: "Short Reel: praise effort not speed",
    hook: "Effort today builds confidence tomorrow.",
    caption: `${BRAND}\n\nShort Reel (10s): praise calm effort after one skill attempt.\n\nFollow for calm swimming tips from Coach Ayman.`,
    primaryCta: "Follow for calm swimming tips from Coach Ayman.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#WaterConfidence", "#CoachAyman"],
    visualPrompt: reelBrief({ format: "Instagram reel · 9:16 · 10s", headline: "Praise effort not speed", hook: "Effort today builds confidence tomorrow.", scene: "Coach praising calm effort after one attempt", strategyLabel: "Short Reel — children's confidence", supportingText: "Trust-building coaching", cta: "Follow for calm tips", canva: "Effort-over-speed message card", capcut: "10s encouragement reel" }),
  },
  {
    dayOffset: 29, slotHourGst: 18, platform: "instagram", contentType: "story", language: "en",
    contentPillar: "offer_booking", contentSlot: "conversion_evening", funnel: "conversion",
    topic: "Story sequence: month-end free assessment reminder",
    hook: "Ready to start structured swimming lessons?",
    caption: `${BRAND}\n\nMonth-end reminder: book your free initial assessment with Coach Ayman Swimming.\n\nBook a free initial assessment — no pressure, just clarity.`,
    primaryCta: "Book a free initial assessment — no pressure, just clarity.",
    cta: CTA_BLOCK, hashtags: [], topicHashtags: ["#FreeAssessment", "#KidsSwimming"],
    visualPrompt: buildStoryBrief({ hook: "Ready to start structured swimming lessons?", frames: ["Text: Kids swimming lessons Abu Dhabi", "Text: Free initial assessment — WhatsApp 058 821 9130", "Link sticker placeholder + Coach Ayman branding"], cta: "Book free initial assessment" }),
  },
];

function buildMonthCaptionBody(slot: SlotTemplate): string {
  const branded = ensureRelaxFixBrandLead(slot.caption);
  if (branded.includes(slot.primaryCta)) return branded;
  return `${branded}\n\n${slot.primaryCta}`;
}

export async function buildCoachAyman30DayCalendarItems(
  start = new Date(),
  batchNonce = start.toISOString(),
  knowledgeContext: CoachKnowledgeContext = EMPTY_COACH_KNOWLEDGE,
): Promise<GeneratedBatchItem[]> {
  const items: GeneratedBatchItem[] = [];
  for (let index = 0; index < COACH_AYMAN_30DAY_SLOT_TEMPLATES.length; index += 1) {
    const slot = COACH_AYMAN_30DAY_SLOT_TEMPLATES[index];
    const fingerprintSeed = `${COACH_AYMAN_PROVIDER_ID}:month:${batchNonce}:${index}:${slot.platform}:${slot.topic}`;
    const trackedCta = buildBatchTrackedCta(slot.platform, slot.contentPillar);
    const captionBody = buildMonthCaptionBody(slot);
    items.push({
      platform: slot.platform,
      contentType: slot.contentType,
      language: slot.language,
      contentPillar: slot.contentPillar,
      contentSlot: slot.contentSlot,
      plannedFor: gstSlotUtc(slot.dayOffset, slot.slotHourGst, start),
      topic: slot.topic,
      hook: slot.hook,
      caption: `${captionBody}\n\n${trackedCta}`,
      cta: trackedCta,
      hashtags: buildHashtags(slot.platform, slot.contentType, slot.topicHashtags),
      visualPrompt: slot.visualPrompt,
      contentFingerprint: await contentFingerprint(fingerprintSeed),
      knowledgeContext: knowledgeForSlot(slot, knowledgeContext),
    });
  }
  return items;
}

function isPublishableMonthItem(item: GeneratedBatchItem): boolean {
  return item.contentType.toLowerCase() !== "story";
}

export function validateCoachAyman30DayBatch(items: GeneratedBatchItem[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (items.length !== COACH_AYMAN_MONTH_BATCH_SIZE) {
    errors.push(`expected ${COACH_AYMAN_MONTH_BATCH_SIZE} items`);
  }

  const fingerprints = new Set<string>();
  const planned = new Set<string>();
  let conversionCount = 0;
  let reelCount = 0;
  let storyCount = 0;
  let postLikeCount = 0;

  for (const item of items) {
    if (fingerprints.has(item.contentFingerprint)) errors.push("duplicate fingerprint");
    fingerprints.add(item.contentFingerprint);
    if (planned.has(item.plannedFor)) errors.push("duplicate plannedFor");
    planned.add(item.plannedFor);

    const normalizedType = item.contentType.toLowerCase();
    if (isVideoContentType(normalizedType)) reelCount += 1;
    if (normalizedType === "story") storyCount += 1;
    if (normalizedType === "post" || normalizedType === "carousel") postLikeCount += 1;
    if (item.contentPillar === "offer_booking") conversionCount += 1;

    if (!item.cta.includes(WHATSAPP) || !item.cta.includes(PHONE)) errors.push("missing confirmed CTA");
    if (!/messages & booking/i.test(item.caption)) errors.push("missing whatsapp role label");
    if (!/phone calls only/i.test(item.caption)) errors.push("missing call role label");
    if (/wa\.me\/971551378660/i.test(item.caption)) errors.push("8660 must not be used as whatsapp link");
    if (!/relax fix uae/i.test(item.caption)) errors.push("missing Relax Fix UAE brand lead");
    if (item.hashtags[0] !== "#RelaxFixUAE") errors.push("primary hashtag must be RelaxFixUAE");
    if (item.platform === "facebook" && item.hashtags.length > 1) errors.push("facebook should use at most one hashtag");
    if (item.platform === "instagram" && item.hashtags.length > 5) errors.push("instagram hashtag count out of range");
    if (item.hashtags.length < 1) errors.push("missing hashtags");
    if (FORBIDDEN_CLAIMS.test(`${item.topic} ${item.hook} ${item.caption}`)) errors.push("forbidden claim language");

    if (normalizedType === "story") {
      if (!/STORY BRIEF:/i.test(item.visualPrompt)) errors.push("missing story brief");
    } else if (isVideoContentType(normalizedType)) {
      if (!/VIDEO BRIEF:/i.test(item.visualPrompt)) errors.push("missing video brief");
    } else if (!/FORMAT:/i.test(item.visualPrompt) || !/CANVA:/i.test(item.visualPrompt) || !/CAPCUT:/i.test(item.visualPrompt)) {
      errors.push("missing production brief");
    }
  }

  if (reelCount !== 12) errors.push(`expected 12 reels, got ${reelCount}`);
  if (postLikeCount !== 10) errors.push(`expected 10 posts, got ${postLikeCount}`);
  if (storyCount !== 8) errors.push(`expected 8 stories, got ${storyCount}`);
  if (conversionCount < 4 || conversionCount > 8) errors.push("conversion mix out of range");

  const sorted = [...items].sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));
  for (let index = 1; index < sorted.length; index += 1) {
    const previousDay = sorted[index - 1].plannedFor.slice(0, 10);
    const currentDay = sorted[index].plannedFor.slice(0, 10);
    const previousDate = new Date(`${previousDay}T00:00:00.000Z`);
    const currentDate = new Date(`${currentDay}T00:00:00.000Z`);
    const diffDays = (currentDate.getTime() - previousDate.getTime()) / 86_400_000;
    if (diffDays !== 1) errors.push("plannedFor days are not consecutive calendar days");
  }

  const publishDays = new Set(sorted.map((item) => item.plannedFor.slice(0, 10)));
  if (publishDays.size !== items.length) errors.push("duplicate publish days in batch");

  const publishable = items.filter(isPublishableMonthItem);
  const publishPlatforms = new Set(publishable.map((item) => item.platform));
  if (!publishPlatforms.has("instagram") || !publishPlatforms.has("facebook")) {
    errors.push("missing instagram or facebook coverage for publishable items");
  }

  return { valid: errors.length === 0, errors };
}

export function summarizeCoachAyman30DayBatch(items: GeneratedBatchItem[]) {
  const summary = summarizeCoachAymanBatch(items);
  return {
    ...summary,
    stories: items.filter((item) => item.contentType.toLowerCase() === "story").length,
    posts: items.filter((item) => ["post", "carousel"].includes(item.contentType.toLowerCase())).length,
    publishable: items.filter(isPublishableMonthItem).length,
  };
}
