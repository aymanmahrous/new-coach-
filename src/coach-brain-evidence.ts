export type EvidenceLevel = "moderate" | "low-to-moderate" | "limited";

export type CoachEvidence = {
  id: string;
  title: string;
  year: number;
  evidenceLevel: EvidenceLevel;
  populations: string[];
  practicalUse: string;
  limitation: string;
  url: string;
};

/** Curated sources for coaching context; not medical clearance or diagnosis. */
export const COACH_BRAIN_EVIDENCE: CoachEvidence[] = [
  {
    id: "autism-swimming-systematic-review-2026",
    title: "Teaching Swimming and Water Safety Skills to Individuals with Autism Spectrum Disorder: A Systematic Review",
    year: 2026,
    evidenceLevel: "moderate",
    populations: ["autism", "swimming", "water safety"],
    practicalUse: "Structured behavioral teaching, modeling, prompting and feedback can inform adaptive swimming instruction.",
    limitation: "Evidence has gaps in generalization, maintenance, instructor training and treatment fidelity.",
    url: "https://link.springer.com/article/10.1007/s40489-026-00576-8",
  },
  {
    id: "disability-swimming-systematic-review-2026",
    title: "Teaching swimming and water safety skills to children with disability: A systematic review",
    year: 2026,
    evidenceLevel: "low-to-moderate",
    populations: ["children with disability", "autism", "cerebral palsy", "water safety"],
    practicalUse: "Supports structured swimming and water-safety interventions while matching instruction to the learner and skill level.",
    limitation: "Overall certainty is low-to-moderate and the review calls for stronger designs and standardized outcomes.",
    url: "https://pubmed.ncbi.nlm.nih.gov/42458788/",
  },
  {
    id: "motor-learning-swimming-2025",
    title: "Learning how to swim in 5- to 12-year-old children: a scoping review of evidence-based motor learning methods",
    year: 2025,
    evidenceLevel: "limited",
    populations: ["children 5-12", "swimming skill acquisition", "motor learning"],
    practicalUse: "Encourages deliberate practice, feedback and careful selection of learning methods rather than assuming one method is universally superior.",
    limitation: "The evidence base is small and methodologically limited, especially for retention and transfer.",
    url: "https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1505301/full",
  },
  {
    id: "aquatic-physiotherapy-guidance-2025",
    title: "Service Provision Recommendations for Aquatic Physiotherapy in Rehabilitation",
    year: 2025,
    evidenceLevel: "limited",
    populations: ["aquatic physiotherapy", "rehabilitation"],
    practicalUse: "Use as a boundary reference for when aquatic rehabilitation belongs with an appropriately qualified physiotherapy service.",
    limitation: "This is professional rehabilitation guidance, not authorization for a swimming coach to provide clinical therapy.",
    url: "https://atacp.csp.org.uk/documents/service-provision-recommendations-aquatic-physiotherapy-rehabilitation",
  },
];

export function evidenceForCoachBrain(context: string) {
  const normalized = context.toLowerCase();
  return COACH_BRAIN_EVIDENCE.filter((item) =>
    item.populations.some((population) => normalized.includes(population.toLowerCase())),
  );
}
