/**
 * Scores a lead against the RIVOX ICP:
 *   agency owners/founders, marketing/digital/creative agencies,
 *   consulting & client-service businesses, staffing/recruiting with a
 *   clear client-billing model.
 *
 * This is a FIRST PASS based on the business `category` field SerpApi
 * returns (e.g. "Marketing agency", "Internet marketing service").
 * Per the roadmap: spot-check 15-20 of these against real judgment and
 * adjust the keyword weights below if they don't match.
 */

// Strong, unambiguous ICP-fit categories -> straight to Perfect.
const STRONG_MATCH = [
  "marketing agency",
  "digital marketing",
  "digital agency",
  "creative agency",
  "advertising agency",
  "branding agency",
  "web design agency",
  "seo agency",
  "internet marketing service",
  "public relations",
  "pr agency",
  "consulting firm",
  "management consultant",
  "business consultant",
  "recruitment agency",
  "staffing agency",
  "employment agency",
];

// Looser/generic terms -> could go either way, needs a human glance -> Maybe.
const WEAK_MATCH = [
  "marketing",
  "advertising",
  "consultant",
  "consulting",
  "agency",
  "creative",
  "design",
  "media",
  "recruiting",
  "recruitment",
  "staffing",
];

// Categories that are almost never a fit, even if a weak keyword happens
// to appear nearby. Forces Skip regardless of weak-match hits.
const HARD_SKIP = [
  "restaurant",
  "retail",
  "store",
  "shop",
  "clothing",
  "salon",
  "spa",
  "gym",
  "fitness",
  "real estate agency", // real estate is a different vertical than the ICP
  "law firm", // legal services, not a marketing/staffing client-service fit
  "school",
  "hospital",
  "clinic",
  "restaurant",
  "hotel",
];

function normalize(str) {
  return (str || "").toLowerCase();
}

/**
 * @param {Object} lead - a normalized lead (has `.category`)
 * @returns {{ tier: "Perfect"|"Maybe"|"Skip", score: number, reason: string }}
 */
export function scoreLead(lead) {
  const category = normalize(lead.category);

  if (!category) {
    return { tier: "Skip", score: 0, reason: "No category field to evaluate" };
  }

  const hardSkipHit = HARD_SKIP.find((kw) => category.includes(kw));
  if (hardSkipHit) {
    return { tier: "Skip", score: 0, reason: `Matched hard-skip category: "${hardSkipHit}"` };
  }

  const strongHit = STRONG_MATCH.find((kw) => category.includes(kw));
  if (strongHit) {
    return { tier: "Perfect", score: 3, reason: `Matched strong ICP category: "${strongHit}"` };
  }

  const weakHits = WEAK_MATCH.filter((kw) => category.includes(kw));
  if (weakHits.length > 0) {
    return {
      tier: "Maybe",
      score: 1,
      reason: `Matched weak/generic term(s): ${weakHits.join(", ")} — verify manually`,
    };
  }

  return { tier: "Skip", score: 0, reason: `No ICP keyword match in category: "${lead.category}"` };
}

/**
 * Scores an array of leads in place, attaching `.tier`, `.score`, `.score_reason`.
 * @returns {{ perfect: number, maybe: number, skip: number }} counts
 */
export function scoreLeads(leads) {
  const counts = { perfect: 0, maybe: 0, skip: 0 };
  for (const lead of leads) {
    const { tier, score, reason } = scoreLead(lead);
    lead.tier = tier;
    lead.score = score;
    lead.score_reason = reason;
    counts[tier.toLowerCase()] += 1;
  }
  return counts;
}
