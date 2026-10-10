export type ResearchBriefInput = {
  age?: string;
  level?: string;
  stroke?: string;
  issue: string;
  observation?: string;
  goal: string;
  diagnosis?: string;
};

/** Build de-identified research terms; never include names, contacts, or addresses. */
export function buildCoachResearchBrief(input: ResearchBriefInput) {
  const context = [input.diagnosis, input.issue, input.observation, input.goal]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const terms = new Set<string>([
    "adaptive swimming evidence",
    "swimming water safety children disability systematic review",
    "motor learning swimming children evidence",
  ]);
  if (/autism|autistic|asd|توحد/.test(context)) {
    terms.add("autism swimming water safety systematic review");
    terms.add("autism swimming behavioral skills training modeling prompting visual schedule");
  }
  if (/bubble|blow|breath|breathing|نفخ|تنفس/.test(context)) {
    terms.add("swimming breathing instruction bubble blowing children");
    terms.add("water familiarization breathing skill swimming children");
  }
  if (/cry|scream|distress|refus|صرخ|بكاء|رفض/.test(context)) {
    terms.add("adaptive swim instruction behavior support water familiarization");
    terms.add("visual schedule prompting swimming instruction");
  }
  if (/rehab|rehabilitation|physio|therapy|تأهيل|علاج طبيعي/.test(context)) {
    terms.add("aquatic physiotherapy rehabilitation professional guidance");
  }
  return {
    ageBand: input.age?.trim() || null,
    level: input.level?.trim() || null,
    strokeOrSkill: input.stroke?.trim() || null,
    goal: input.goal.trim(),
    searchTerms: [...terms],
    privacy: {
      identifiersRequired: false,
      excludeNames: true,
      excludeContactDetails: true,
      excludeExactAddresses: true,
    },
  };
}
