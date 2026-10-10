import {
  applyMemoryToConciergeInput,
  buildClarificationReply,
  detectConfusion,
  shouldAskQuestion,
  updateQuestionLedger,
} from "./memory.mjs";

const APPROVED_PRICING = {
  private: {
    en: "Private lesson: 150 AED instead of 200 AED — limited-time offer.",
    ar: "حصة خاصة: 150 درهم بدل 200 درهم — عرض لفترة محدودة.",
  },
  group: {
    en: "Group lesson: up to 5 people — 450 AED.",
    ar: "حصة جماعية: حتى 5 أشخاص — 450 درهم.",
  },
  siblings: {
    en: "Siblings discount: 50 AED off per sibling. Example: eligible sibling group = 400 AED instead of 450 AED.",
    ar: "خصم الإخوة: 50 درهم لكل أخ/أخت. مثال: مجموعة إخوة مؤهلة = 400 درهم بدل 450 درهم.",
  },
};

const HUMAN_HANDOFF_PATTERN =
  /(human|person|coach|ayman|speak to someone|talk to someone|موظف|بشري|كوتش|أيمن|مدرب|تحدث مع)/i;
const PRICING_PATTERN = /(price|cost|how much|fee|aed|dirham|سعر|كم|تكلفة|درهم)/i;
const PRIVATE_PATTERN = /(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)/i;
const GROUP_PATTERN = /(group|family|up to 5|مجموعة|عائلة|جماعي)/i;
const SIBLING_PATTERN = /(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)/i;
const BOOKING_PATTERN = /(book|booking|reserve|appointment|subscribe|حجز|موعد|اشتراك|أحجز|احجز)/i;
const AFFIRMATIVE_PATTERN = /^(yes|yep|yeah|sure|ok|okay|نعم|أيوه|ايوه|تمام|موافق)\b/i;
const NEGATIVE_FEAR_PATTERN = /(fear|afraid|scared|خوف|خايف|خائف)/i;
const COMFORTABLE_PATTERN = /(comfortable|fine|no fear|not afraid|مرتاح|ما في خوف|لا خوف)/i;

export function detectLanguage(text) {
  return /[ء-ي]/.test(text) ? "ar" : "en";
}

function t(language, en, ar) {
  return language === "ar" ? ar : en;
}

function parseConciergeState(intent) {
  if (!intent || !intent.startsWith("concierge:")) return "greeting";
  return intent.slice("concierge:".length) || "greeting";
}

function formatIntent(state) {
  return `concierge:${state}`;
}

function pricingBlock(language, offerType) {
  const lines = [APPROVED_PRICING[offerType][language]];
  if (offerType !== "private") lines.unshift(APPROVED_PRICING.private[language]);
  if (offerType !== "group") lines.push(APPROVED_PRICING.group[language]);
  if (offerType !== "siblings") lines.push(APPROVED_PRICING.siblings[language]);
  return lines.join("\n");
}

function skipStateIfKnown(state, knownFacts, ledger, conflicts) {
  if (state === "awaiting_offer_type" && shouldAskQuestion("lesson_type", knownFacts, ledger, conflicts) === "skip") {
    const lessonType = knownFacts.lesson_type ?? ledger.known_facts?.lesson_type;
    if (lessonType === "private") return "awaiting_fear_of_water";
    if (lessonType === "group" || lessonType === "siblings") return "presented_pricing";
  }

  if (state === "awaiting_fear_of_water" && shouldAskQuestion("fear_of_water", knownFacts, ledger, conflicts) === "skip") {
    return "presented_pricing";
  }

  return state;
}

function questionKeyForState(state) {
  if (state === "awaiting_offer_type") return "lesson_type";
  if (state === "awaiting_fear_of_water") return "fear_of_water";
  return null;
}

function buildHandoffResult(input, language, memory, reason) {
  return {
    processed: true,
    skipped: false,
    language,
    detectedIntent: "human_handoff",
    draftReply: null,
    nextIntent: formatIntent("human_handoff"),
    nextService: input.service ?? null,
    nextStage: input.stage === "new" ? "contacted" : input.stage,
    nextScore: (input.score ?? 0) + 10,
    nextFearOfWater: input.fearOfWater ?? null,
    humanHandoff: true,
    handoffReason: reason,
    alertCode: memory.confusion?.alertCode ?? "human_required",
    questionLedger: memory.ledger,
    knownFacts: memory.knownFacts,
    outboundEnabled: false,
  };
}

export function buildSalesConciergeTurn(input) {
  const memory = applyMemoryToConciergeInput(input);
  const language = memory.language;
  const body = input.messageBody.trim();
  const mode = input.mode;
  const stage = input.stage;
  let score = input.score ?? 0;
  let service = input.service ?? null;
  let fearOfWater = input.fearOfWater ?? null;
  let humanHandoff = false;
  let nextStage = stage;
  let state = parseConciergeState(input.intent);
  let ledger = memory.ledger;
  const knownFacts = memory.knownFacts;
  const conflicts = memory.conflicts;

  if (mode !== "ai_active") {
    return {
      processed: false,
      skipped: true,
      skipReason: "CONVERSATION_NOT_AI_ACTIVE",
      language,
      detectedIntent: state,
      draftReply: null,
      nextIntent: input.intent ?? formatIntent(state),
      nextService: service,
      nextStage: stage,
      nextScore: score,
      nextFearOfWater: fearOfWater,
      humanHandoff: false,
      questionLedger: ledger,
      knownFacts,
      outboundEnabled: false,
    };
  }

  if (conflicts.length > 0) {
    const conflictKey = conflicts[0].key;
    return {
      processed: true,
      skipped: false,
      language,
      detectedIntent: formatIntent("clarification"),
      draftReply: buildClarificationReply(language, conflictKey),
      nextIntent: formatIntent(state),
      nextService: service,
      nextStage,
      nextScore: score,
      nextFearOfWater: fearOfWater,
      humanHandoff: false,
      needsClarification: true,
      clarificationKey: conflictKey,
      questionLedger: ledger,
      knownFacts,
      outboundEnabled: false,
    };
  }

  if (memory.confusion.confused) {
    return buildHandoffResult(input, language, memory, memory.confusion.reason);
  }

  if (HUMAN_HANDOFF_PATTERN.test(body)) {
    return buildHandoffResult(input, language, memory, "customer_requested_human");
  }

  if (knownFacts.lesson_type && !service) {
    service = knownFacts.lesson_type;
  }

  if (knownFacts.fear_of_water === "true" || knownFacts.fear_of_water === "yes") fearOfWater = true;
  if (knownFacts.fear_of_water === "false" || knownFacts.fear_of_water === "no") fearOfWater = false;

  if (state === "greeting") {
    if (PRICING_PATTERN.test(body)) state = "presented_pricing";
    else if (PRIVATE_PATTERN.test(body)) {
      service = "private";
      state = "awaiting_fear_of_water";
    } else if (SIBLING_PATTERN.test(body)) {
      service = "siblings";
      state = "presented_pricing";
    } else if (GROUP_PATTERN.test(body)) {
      service = "group";
      state = "awaiting_fear_of_water";
    } else if (BOOKING_PATTERN.test(body)) state = "booking_guidance";
    else state = "awaiting_offer_type";
    nextStage = stage === "new" ? "contacted" : stage;
  } else if (state === "awaiting_offer_type") {
    if (PRIVATE_PATTERN.test(body)) {
      service = "private";
      state = "awaiting_fear_of_water";
      nextStage = "qualified";
      score += 10;
    } else if (SIBLING_PATTERN.test(body)) {
      service = "siblings";
      state = "presented_pricing";
      nextStage = "qualified";
      score += 10;
    } else if (GROUP_PATTERN.test(body)) {
      service = "group";
      state = "awaiting_fear_of_water";
      nextStage = "qualified";
      score += 10;
    }
  } else if (state === "awaiting_fear_of_water") {
    if (NEGATIVE_FEAR_PATTERN.test(body)) fearOfWater = true;
    else if (COMFORTABLE_PATTERN.test(body) || AFFIRMATIVE_PATTERN.test(body)) fearOfWater = false;
    state = "presented_pricing";
    score += 10;
    nextStage = nextStage === "new" || nextStage === "contacted" ? "qualified" : nextStage;
  } else if (state === "presented_pricing" && BOOKING_PATTERN.test(body)) {
    state = "booking_guidance";
    nextStage = "booking_intent";
    score += 20;
  } else if (state === "booking_guidance" && AFFIRMATIVE_PATTERN.test(body)) {
    nextStage = "booking_intent";
    score += 20;
  }

  state = skipStateIfKnown(state, knownFacts, ledger, conflicts);

  let draftReply = null;
  let draftQuestionKey = questionKeyForState(state);

  if (state === "awaiting_offer_type") {
    const askDecision = shouldAskQuestion("lesson_type", knownFacts, ledger, conflicts);
    if (askDecision === "clarify") {
      draftReply = buildClarificationReply(language, "lesson_type");
    } else if (askDecision === "skip") {
      state = skipStateIfKnown("awaiting_offer_type", knownFacts, ledger, conflicts);
      draftQuestionKey = questionKeyForState(state);
    } else {
      draftReply = t(
        language,
        "Welcome to Coach Ayman Swimming. Would you like a private swimming lesson or a group lesson (up to 5 people)?",
        "أهلًا بك في Coach Ayman Swimming. هل تفضّل حصة سباحة خاصة أم مجموعة (حتى 5 أشخاص)؟",
      );
      ledger = updateQuestionLedger(ledger, { asked: ["lesson_type"] });
    }
  }

  if (!draftReply && state === "awaiting_fear_of_water") {
    const askDecision = shouldAskQuestion("fear_of_water", knownFacts, ledger, conflicts);
    if (askDecision === "clarify") {
      draftReply = buildClarificationReply(language, "fear_of_water");
    } else if (askDecision === "skip") {
      state = "presented_pricing";
      draftQuestionKey = null;
    } else {
      draftReply = t(
        language,
        "Quick question: is the swimmer comfortable in water, or is there fear of water?",
        "سؤال سريع: هل السبّاح مرتاح في الماء، أم يوجد خوف من الماء؟",
      );
      ledger = updateQuestionLedger(ledger, { asked: ["fear_of_water"] });
    }
  }

  if (!draftReply && state === "presented_pricing") {
    const offerType = service === "private" ? "private" : service === "siblings" ? "siblings" : service === "group" ? "group" : "private";
    draftReply = [
      pricingBlock(language, offerType),
      t(language, "Would you like to proceed with booking?", "هل تود المتابعة للحجز؟"),
    ].join("\n\n");
  } else if (!draftReply && state === "booking_guidance") {
    draftReply = t(
      language,
      "Great — I can guide you toward booking with Coach Ayman. Reply yes to continue.",
      "ممتاز — يمكنني توجيهك للحجز مع الكوتش أيمن. اكتب نعم للمتابعة.",
    );
  } else if (!draftReply && state !== "awaiting_offer_type" && state !== "awaiting_fear_of_water") {
    draftReply = t(
      language,
      "Welcome to Coach Ayman Swimming. I can help with private or group swimming lessons. What would you like?",
      "أهلًا بك في Coach Ayman Swimming. أستطيع مساعدتك في حصص السباحة الخاصة أو الجماعية. ماذا تفضّل؟",
    );
    state = "awaiting_offer_type";
    nextStage = stage === "new" ? "contacted" : stage;
  }

  if (draftQuestionKey) {
    const repeatCheck = detectConfusion({
      messageBody: body,
      ledger,
      recentCustomerMessages: input.recentCustomerMessages ?? [],
      draftQuestionKey,
    });
    if (repeatCheck.confused) {
      return buildHandoffResult(input, language, { ...memory, confusion: repeatCheck }, repeatCheck.reason);
    }
  }

  if (knownFacts.child_age && draftReply && /\b(age|year|سنة|عمر)\b/i.test(draftReply)) {
    return buildHandoffResult(
      input,
      language,
      { ...memory, confusion: { confused: true, reason: "repeated_question", alertCode: "customer_at_risk" } },
      "repeated_question",
    );
  }

  return {
    processed: true,
    skipped: false,
    language,
    detectedIntent: state,
    draftReply,
    nextIntent: formatIntent(state),
    nextService: service,
    nextStage,
    nextScore: score,
    nextFearOfWater: fearOfWater,
    humanHandoff,
    questionLedger: ledger,
    knownFacts,
    outboundEnabled: false,
  };
}

export { APPROVED_PRICING };
