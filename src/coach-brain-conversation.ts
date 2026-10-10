export const COACH_BRAIN_REFERENCE_QUESTION_LIMIT = 1_000;
export const COACH_BRAIN_REFERENCE_ANSWER_LIMIT = 4_000;

export function buildCoachBrainSummaryRequest(question: string, answer: string) {
  return {
    question: question.trim().slice(0, COACH_BRAIN_REFERENCE_QUESTION_LIMIT),
    referenceAnswer: answer.trim().slice(0, COACH_BRAIN_REFERENCE_ANSWER_LIMIT),
  };
}
