export const QUESTION_KEYS = [
  "child_age",
  "location",
  "swimming_level",
  "fear_of_water",
  "lesson_type",
  "goal",
  "preferred_language",
  "other_relevant_fact",
];

export const EMPTY_LEDGER = {
  questions_asked: [],
  questions_answered: [],
  known_facts: {},
};

const ALREADY_TOLD_PATTERN =
  /(already told you|i told you|i said|as i said|قلت لك|سبق وقلت|قلت(?:ه|ها)? قبل|ذكرت(?:ه|ها)?|سبق(?:\s|$))/i;
const CONFUSION_FAILURE_PATTERN =
  /(don['’]t understand|didn['’]t understand|what do you mean|not clear|ما فهمت|مش فاهم|مافهمت|مو واضح|غير واضح)/i;
const HUMAN_REQUEST_PATTERN =
  /(human|person|coach|ayman|speak to someone|talk to someone|real person|موظف|بشري|كوتش|أيمن|مدرب|تحدث مع|شخص حقيقي)/i;

const CHILD_AGE_PATTERNS = [
  /(?:my\s+)?(?:son|daughter|child|kid|boy|girl|ابن(?:ي)?|ابنت(?:ي)?|طفل(?:ي)?|ولد(?:ي)?|بنت(?:ي)?)?\s*(?:is\s+|عمر(?:ه|ها)?\s+|عنده?\s+|عندها\s+)?(\d{1,2})\s*(?:years?\s*old|year(?:s)?|yo|سنين|سنوات|سنة)(?:\b|$)/i,
  /(?:age|عمر)(?:\s+is|\s*[:=])?\s*(\d{1,2})\b/i,
  /(\d{1,2})\s*(?:years?\s*old|سنين|سنوات|سنة)(?:\b|$)/i,
];

const LOCATION_PATTERNS = [
  /\b(dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|al ain|jumeirah|marina|mirdif|deira|business bay|jlt|jvc|arabian ranches|motor city|silicon oasis)\b/i,
  /(دبي|أبو\s*ظبي|ابو\s*ظبي|الشارقة|عجمان|رأس\s*ال\s*خيمة|الفجيرة|أم\s*ال\s*قيوين|العين|جميرا|مارينا|مردف|ديرة)/i,
];

const SWIMMING_LEVEL_PATTERNS = [
  /\b(beginner|intermediate|advanced|never swam|no experience|first time|can't swim|cannot swim|مبتدئ|متوسط|متقدم|ما سبق|لم يسبح|أول مرة|ما يعرف يسبح)\b/i,
];

const GOAL_PATTERNS = [
  /\b(confidence|overcome fear|learn to swim|competition|fitness|water safety|ثقة|تغلب على الخوف|تعلم السباحة|لياقة|أمان(?:\s|$))/i,
];

const LESSON_TYPE_PATTERNS = {
  private: /(private|individual|one[\s-]?on[\s-]?one|خاص|فردي|حصة خاصة)/i,
  group: /(group|family|up to 5|مجموعة|عائلة|جماعي)/i,
  siblings: /(sibling|brother|sister|brothers|sisters|إخوة|أخوات|أشقاء|أخ|أخت)/i,
};

const FEAR_POSITIVE = /(fear|afraid|scared|خوف|خايف|خائف|خايف(?:ة)? من الماء)/i;
const FEAR_NEGATIVE = /(comfortable|fine|no fear|not afraid|مرتاح|ما في خوف|لا خوف|مو خايف)/i;

const STATE_TO_QUESTION = {
  awaiting_offer_type: "lesson_type",
  awaiting_fear_of_water: "fear_of_water",
};

export function emptyLedger() {
  return structuredClone(EMPTY_LEDGER);
}

export function normalizeLedger(ledger) {
  const base = emptyLedger();
  if (!ledger || typeof ledger !== "object") return base;
  return {
    questions_asked: Array.isArray(ledger.questions_asked) ? [...new Set(ledger.questions_asked)] : [],
    questions_answered: Array.isArray(ledger.questions_answered) ? [...new Set(ledger.questions_answered)] : [],
    known_facts: ledger.known_facts && typeof ledger.known_facts === "object" ? { ...ledger.known_facts } : {},
  };
}

export function mergeKnownFacts(existing = {}, extracted = {}) {
  const merged = { ...(existing ?? {}) };
  const conflicts = [];

  for (const [key, value] of Object.entries(extracted ?? {})) {
    if (value == null || value === "") continue;
    const next = String(value).trim();
    if (!next) continue;
    if (merged[key] && String(merged[key]).trim() !== next) {
      conflicts.push({ key, existing: String(merged[key]), incoming: next });
      continue;
    }
    merged[key] = next;
  }

  return { knownFacts: merged, conflicts };
}

export function extractFactsFromMessage(messageBody, language = "en") {
  const body = String(messageBody ?? "").trim();
  if (!body) return {};

  const facts = {};

  for (const pattern of CHILD_AGE_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[1]) {
      const age = Number.parseInt(match[1], 10);
      if (age >= 2 && age <= 18) {
        facts.child_age = String(age);
        break;
      }
    }
  }

  for (const pattern of LOCATION_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[0]) {
      facts.location = match[0].trim();
      break;
    }
  }

  for (const pattern of SWIMMING_LEVEL_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[0]) {
      facts.swimming_level = match[0].trim();
      break;
    }
  }

  if (FEAR_POSITIVE.test(body)) facts.fear_of_water = language === "ar" ? "yes" : "true";
  else if (FEAR_NEGATIVE.test(body)) facts.fear_of_water = language === "ar" ? "no" : "false";

  for (const [lessonType, pattern] of Object.entries(LESSON_TYPE_PATTERNS)) {
    if (pattern.test(body)) {
      facts.lesson_type = lessonType;
      break;
    }
  }

  for (const pattern of GOAL_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[0]) {
      facts.goal = match[0].trim();
      break;
    }
  }

  if (/[ء-ي]/.test(body)) facts.preferred_language = "ar";
  else if (/[a-z]/i.test(body)) facts.preferred_language = "en";

  return facts;
}

export function inferAnsweredQuestions(extractedFacts) {
  const answered = [];
  for (const key of QUESTION_KEYS) {
    if (extractedFacts[key] != null && extractedFacts[key] !== "") answered.push(key);
  }
  return answered;
}

export function updateQuestionLedger(ledger, { asked = [], answered = [] } = {}) {
  const next = normalizeLedger(ledger);
  for (const key of asked) {
    if (!next.questions_asked.includes(key)) next.questions_asked.push(key);
  }
  for (const key of answered) {
    if (!next.questions_answered.includes(key)) next.questions_answered.push(key);
    if (!next.questions_asked.includes(key)) next.questions_asked.push(key);
  }
  return next;
}

export function isFactKnown(questionKey, knownFacts = {}, ledger = EMPTY_LEDGER) {
  const normalized = normalizeLedger(ledger);
  if (knownFacts?.[questionKey]) return true;
  if (normalized.known_facts?.[questionKey]) return true;
  if (normalized.questions_answered.includes(questionKey)) return true;
  return false;
}

export function shouldAskQuestion(questionKey, knownFacts = {}, ledger = EMPTY_LEDGER, conflicts = []) {
  if (conflicts.some((item) => item.key === questionKey)) return "clarify";
  return isFactKnown(questionKey, knownFacts, ledger) ? "skip" : "ask";
}

export function detectConfusion({ messageBody, ledger, recentCustomerMessages = [], draftQuestionKey = null }) {
  const body = String(messageBody ?? "").trim();
  const normalized = normalizeLedger(ledger);

  if (HUMAN_REQUEST_PATTERN.test(body)) {
    return { confused: true, reason: "customer_requested_human", alertCode: "human_required" };
  }

  if (ALREADY_TOLD_PATTERN.test(body)) {
    return { confused: true, reason: "customer_already_told", alertCode: "customer_at_risk" };
  }

  if (draftQuestionKey && normalized.questions_answered.includes(draftQuestionKey)) {
    return { confused: true, reason: "repeated_question", alertCode: "customer_at_risk" };
  }

  const recentFailures = recentCustomerMessages
    .slice(-2)
    .filter((item) => CONFUSION_FAILURE_PATTERN.test(String(item ?? "")));
  if (recentFailures.length >= 2) {
    return { confused: true, reason: "understanding_failed_twice", alertCode: "customer_at_risk" };
  }

  return { confused: false, reason: null, alertCode: null };
}

export function questionKeyForState(state) {
  return STATE_TO_QUESTION[state] ?? null;
}

export function buildClarificationReply(language, conflictKey) {
  const labels = {
    child_age: ["your child's age", "عمر طفلك"],
    location: ["your location", "موقعك"],
    swimming_level: ["the swimmer's level", "مستوى السباح"],
    fear_of_water: ["comfort in water", "الارتياح في الماء"],
    lesson_type: ["lesson type", "نوع الحصة"],
    goal: ["your goal", "هدفك"],
    preferred_language: ["preferred language", "اللغة المفضلة"],
    other_relevant_fact: ["that detail", "هذه المعلومة"],
  };
  const label = labels[conflictKey]?.[language === "ar" ? 1 : 0] ?? conflictKey;
  return language === "ar"
    ? `لاحظت معلومات مختلفة عن ${label}. هل يمكنك توضيح الإجابة الصحيحة؟`
    : `I noticed different details about ${label}. Could you clarify the correct answer?`;
}

export function applyMemoryToConciergeInput(input) {
  const language = input.language ?? (/[ء-ي]/.test(String(input.messageBody ?? "")) ? "ar" : "en");
  const ledger = normalizeLedger(input.questionLedger);
  const knownFacts = { ...(input.knownFacts ?? {}), ...ledger.known_facts };
  const extracted = extractFactsFromMessage(input.messageBody, language);
  const { knownFacts: mergedFacts, conflicts } = mergeKnownFacts(knownFacts, extracted);
  const answeredNow = inferAnsweredQuestions(extracted);
  const nextLedger = updateQuestionLedger(ledger, { answered: answeredNow });

  for (const key of Object.keys(mergedFacts)) nextLedger.known_facts[key] = mergedFacts[key];

  const confusion = detectConfusion({
    messageBody: input.messageBody,
    ledger: nextLedger,
    recentCustomerMessages: input.recentCustomerMessages ?? [],
  });

  return {
    language,
    ledger: nextLedger,
    knownFacts: mergedFacts,
    conflicts,
    confusion,
    extracted,
  };
}
