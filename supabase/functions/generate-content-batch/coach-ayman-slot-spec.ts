export const COACH_AYMAN_PROVIDER_ID = "command-center-coach-ayman-2026";
export const COACH_AYMAN_BATCH_SIZE = 10;

export const BRAND_WITH_COACH = "Relax Fix UAE Swimming Academy — Coach Ayman";
export const BRAND_LINE = "Relax Fix UAE Swimming Academy";
export const WHATSAPP = "058 821 9130";
export const PHONE = "055 137 8660";
export const WHATSAPP_OPENER =
  "Hi Relax Fix UAE — I saw Coach Ayman's swimming content and would like a free initial assessment.";

export const PRIMARY_CTAS = {
  save: "Save this tip for your next pool visit.",
  share: "Share this with another Abu Dhabi parent.",
  follow: "Follow for calm swimming tips from Coach Ayman.",
  ask: "Ask a swimming question in the comments.",
  whatsapp: "Send us a WhatsApp message to chat about your child's comfort in the water.",
  book: "Book a free initial assessment — no pressure, just clarity.",
} as const;

export type PrimaryCtaKey = keyof typeof PRIMARY_CTAS;
export type MarketingFunnel = "attraction" | "education" | "trust" | "engagement" | "conversion";

export type CoachAymanSlotSpec = {
  dayOffset: number;
  hourGst: number;
  platform: "instagram" | "facebook" | "tiktok";
  contentType: string;
  contentPillar: string;
  contentSlot: "trust_morning" | "education_midday" | "conversion_evening";
  funnel: MarketingFunnel;
  topicSeed: string;
  hookSeed: string;
  topicHashtags: string[];
  primaryCtaKey: PrimaryCtaKey;
  arabicHint?: string;
  briefFormat: string;
  strategyLabel: string;
};

export const FORBIDDEN_CLAIMS =
  /\b(guarantee|guaranteed|award-winning|#1|testimonial|before and after results|100% success|olympic coach|world record)\b/i;

/** Slot order and strategy mix — keep aligned with src/content-batch-generator.ts */
export const COACH_AYMAN_SLOT_SPEC: CoachAymanSlotSpec[] = [
  {
    dayOffset: 0,
    hourGst: 9,
    platform: "instagram",
    contentType: "reel",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "attraction",
    strategyLabel: "Short Reel — common swimming problem",
    topicSeed: "Short Reel: why kids panic at the pool edge",
    hookSeed: "Most water fear starts before they even get wet.",
    topicHashtags: ["#KidsSwimming", "#WaterConfidence"],
    primaryCtaKey: "follow",
    briefFormat: "Instagram reel · 9:16 · 10s default (5–15s)",
  },
  {
    dayOffset: 1,
    hourGst: 12,
    platform: "instagram",
    contentType: "carousel",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "education",
    strategyLabel: "Education for parents",
    topicSeed: "3 calm breathing habits before your child enters the pool",
    hookSeed: "Most kids rush into the water before their body is ready.",
    topicHashtags: ["#SwimmingTips", "#ParentTips"],
    primaryCtaKey: "save",
    briefFormat: "Instagram carousel · 5 slides · 1080×1350",
  },
  {
    dayOffset: 2,
    hourGst: 9,
    platform: "instagram",
    contentType: "reel",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "attraction",
    strategyLabel: "Short Reel — common mistake",
    topicSeed: "Short Reel: the rushed kick mistake parents miss",
    hookSeed: "If the kick is frantic, the breath will never settle.",
    topicHashtags: ["#SwimReel", "#LearnToSwim"],
    primaryCtaKey: "save",
    briefFormat: "Instagram reel · 9:16 · 10s default (5–15s)",
  },
  {
    dayOffset: 3,
    hourGst: 9,
    platform: "facebook",
    contentType: "post",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "trust",
    strategyLabel: "FAQ for parents",
    topicSeed: "FAQ: how long until my child feels safe in the water?",
    hookSeed: "Parents ask this every week in Abu Dhabi.",
    topicHashtags: ["#AbuDhabiParents"],
    primaryCtaKey: "share",
    briefFormat: "Facebook static post · 1200×630",
  },
  {
    dayOffset: 4,
    hourGst: 12,
    platform: "instagram",
    contentType: "reel",
    contentPillar: "safety_awareness",
    contentSlot: "education_midday",
    funnel: "attraction",
    strategyLabel: "Short Reel — swimming skill / safety",
    topicSeed: "Short Reel: pool-edge safety check in 10 seconds",
    hookSeed: "Safety first does not mean fear — it means clear rules.",
    topicHashtags: ["#PoolSafety", "#SwimmingSkills"],
    primaryCtaKey: "save",
    briefFormat: "Instagram reel · 9:16 · 10s default (5–15s)",
  },
  {
    dayOffset: 5,
    hourGst: 9,
    platform: "instagram",
    contentType: "post",
    contentPillar: "parent_concerns",
    contentSlot: "trust_morning",
    funnel: "trust",
    strategyLabel: "Parent advice",
    topicSeed: "What to tell a nervous child before lesson one",
    hookSeed: "Your child does not need bravery — they need a plan.",
    topicHashtags: ["#ParentSupport", "#AbuDhabiParents"],
    primaryCtaKey: "share",
    briefFormat: "Instagram static post · 1080×1350",
  },
  {
    dayOffset: 6,
    hourGst: 18,
    platform: "instagram",
    contentType: "post",
    contentPillar: "offer_booking",
    contentSlot: "conversion_evening",
    funnel: "conversion",
    strategyLabel: "Free Initial Assessment CTA",
    topicSeed: "Start with a free initial assessment",
    hookSeed: "Not sure which lesson format fits your child?",
    topicHashtags: ["#FreeAssessment", "#AbuDhabiSwimming"],
    primaryCtaKey: "book",
    arabicHint: "Include one short Arabic parent line for Abu Dhabi families.",
    briefFormat: "Instagram conversion post · 1080×1350",
  },
  {
    dayOffset: 7,
    hourGst: 12,
    platform: "instagram",
    contentType: "reel",
    contentPillar: "swimming_education",
    contentSlot: "education_midday",
    funnel: "education",
    strategyLabel: "Short Reel — educational",
    topicSeed: "Short Reel: bubble line to calm breathing",
    hookSeed: "Watch the shoulders drop when breathing is calm.",
    topicHashtags: ["#SwimReel", "#CoachAyman"],
    primaryCtaKey: "save",
    briefFormat: "Instagram reel · 9:16 · 10s default (5–15s)",
  },
  {
    dayOffset: 8,
    hourGst: 9,
    platform: "facebook",
    contentType: "carousel",
    contentPillar: "real_progress",
    contentSlot: "education_midday",
    funnel: "trust",
    strategyLabel: "Structured Swimming Progress / Trust",
    topicSeed: "Structured swimming progress parents can track",
    hookSeed: "Small skills build confidence before speed.",
    topicHashtags: ["#BeginnerSwimming"],
    primaryCtaKey: "save",
    briefFormat: "Facebook carousel · 4 slides · 1080×1080",
  },
  {
    dayOffset: 9,
    hourGst: 18,
    platform: "instagram",
    contentType: "post",
    contentPillar: "coach_authority",
    contentSlot: "conversion_evening",
    funnel: "conversion",
    strategyLabel: "Trust + Conversion",
    topicSeed: "Coach Ayman on building water confidence in Abu Dhabi",
    hookSeed: "Calm coaching beats pressure every time.",
    topicHashtags: ["#SwimmingCoach", "#AbuDhabiSwimming"],
    primaryCtaKey: "book",
    briefFormat: "Instagram conversion post · 1080×1350",
  },
];

export function gstSlotUtc(dayOffset: number, hourGst: number, start: Date): string {
  const base = new Date(start);
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffset + 1);
  base.setUTCHours(hourGst - 4, 0, 0, 0);
  return base.toISOString();
}

export async function contentFingerprint(seed: string): Promise<string> {
  const data = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildBatchTrackedCta(platform: string, pillar: string): string {
  const params = new URLSearchParams();
  params.set("utm_source", platform.toLowerCase());
  params.set("utm_medium", "social");
  params.set("utm_campaign", "relaxfix-content-batch");
  params.set("utm_content", pillar);
  params.set("text", WHATSAPP_OPENER);
  const leadUrl = `https://wa.me/971588219130?${params.toString()}`;
  return [
    BRAND_LINE,
    `WhatsApp ${WHATSAPP} — messages & booking`,
    `Call ${PHONE} — admin team (phone calls only)`,
    "Free initial assessment.",
    `WhatsApp link: ${leadUrl}`,
  ].join("\n");
}

export function buildHashtags(
  platform: CoachAymanSlotSpec["platform"],
  topicHashtags: string[],
): string[] {
  const unique = ["#RelaxFixUAE", ...topicHashtags];
  const deduped = [...new Set(unique.map((tag) => tag.trim()).filter(Boolean))];
  if (platform === "facebook") return deduped.slice(0, 1);
  return deduped.slice(0, 5);
}

export function ensureRelaxFixBrandLead(caption: string): string {
  if (/relax fix uae/i.test(caption)) return caption;
  return `${BRAND_WITH_COACH}\n\n${caption}`;
}

export function primaryCtaForSlot(slot: CoachAymanSlotSpec): string {
  return PRIMARY_CTAS[slot.primaryCtaKey];
}

function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized === "reel" || normalized === "short_video" || normalized === "video";
}

export function buildVideoBrief(slot: CoachAymanSlotSpec, hook: string, primaryCta: string): string {
  return [
    "VIDEO BRIEF:",
    `HOOK: ${hook}`,
    "DURATION: 10 seconds (allowed 5–15 seconds)",
    `SCENE: ${slot.topicSeed.replace(/^Short Reel:\s*/i, "")} — real Abu Dhabi pool context with Coach Ayman, no staged testimonials.`,
    `ON-SCREEN TEXT: ${hook}`,
    `CAPTION LEAD: ${slot.strategyLabel} for kids swimming lessons in Abu Dhabi.`,
    `CTA: ${primaryCta}`,
    "REQUIRED MEDIA: real pool b-roll or coach footage; burned-in captions; no AI-generated child faces; no fake before/after.",
  ].join("\n");
}

export function ensureMediaBrief(visualPrompt: string, slot: CoachAymanSlotSpec, primaryCta: string): string {
  const trimmed = visualPrompt.trim();
  const hasStructure = /FORMAT:/i.test(trimmed) && /CANVA:/i.test(trimmed) && /CAPCUT:/i.test(trimmed);
  if (hasStructure) return trimmed;

  const body = trimmed || `Coach Ayman ${slot.contentPillar.replace(/_/g, " ")} content for ${slot.platform}.`;
  const videoBrief = isVideoContentType(slot.contentType)
    ? buildVideoBrief(slot, slot.hookSeed, primaryCta)
    : null;

  return [
    `FORMAT: ${slot.briefFormat}`,
    `VISUAL CONCEPT: ${body.split("\n")[0]}`,
    `HEADLINE: ${slot.hookSeed}`,
    `SUPPORTING TEXT: Keep copy parent-friendly for kids swimming lessons and water safety in Abu Dhabi.`,
    `SCENE IDEA: Real pool context with Coach Ayman authority; no fabricated reviews or results.`,
    `CTA: ${primaryCta}`,
    videoBrief,
    `CANVA: ${body}`,
    isVideoContentType(slot.contentType)
      ? "RUNWAY (optional): Use only if real footage is unavailable — no AI-generated child faces."
      : null,
    isVideoContentType(slot.contentType)
      ? "CAPCUT: Vertical 9:16 edit, 10-second default pacing, burned-in captions."
      : "CAPCUT: Edit with burned-in captions and calm pacing where video applies.",
  ].filter(Boolean).join("\n");
}

export async function buildTemplateBatchItems(batchNonce: string, start: Date) {
  const items = [];
  for (let index = 0; index < COACH_AYMAN_SLOT_SPEC.length; index += 1) {
    const slot = COACH_AYMAN_SLOT_SPEC[index];
    const primaryCta = primaryCtaForSlot(slot);
    const trackedCta = buildBatchTrackedCta(slot.platform, slot.contentPillar);
    const topic = slot.topicSeed;
    const hook = slot.hookSeed;
    const brandedBody = ensureRelaxFixBrandLead(`${topic}\n\n${hook}`);
    const captionBody = brandedBody.includes(primaryCta) ? brandedBody : `${brandedBody}\n\n${primaryCta}`;
    const caption = `${captionBody}\n\n${trackedCta}`;
    const visualPrompt = ensureMediaBrief("", slot, primaryCta);
    const fingerprintSeed = `${COACH_AYMAN_PROVIDER_ID}:${batchNonce}:${index}:${slot.platform}:${topic}`;
    items.push({
      platform: slot.platform,
      contentType: slot.contentType,
      language: "en",
      contentPillar: slot.contentPillar,
      contentSlot: slot.contentSlot,
      plannedFor: gstSlotUtc(slot.dayOffset, slot.hourGst, start),
      topic,
      hook,
      caption,
      cta: trackedCta,
      hashtags: buildHashtags(slot.platform, slot.topicHashtags),
      visualPrompt,
      contentFingerprint: await contentFingerprint(fingerprintSeed),
    });
  }
  return items;
}
