/**
 * Best-effort cleanup of business names that have marketing taglines
 * appended, e.g.:
 *   "Whissel Strategies - Toronto Marketing Agency" -> "Whissel Strategies"
 *   "Direct Clicks | Digital Marketing Agency"       -> "Direct Clicks"
 *   "Reef Digital Agency"                            -> "Reef Digital Agency" (unchanged — no separator)
 *
 * Approach: split on common separators (|, –, —, hyphen-with-spaces),
 * keep the FIRST segment as the core name UNLESS that segment is itself
 * just generic filler, and only drop later segments that look like a
 * generic service/location descriptor (not a real distinguishing name).
 *
 * This is heuristic and imperfect — always keep `raw_name` alongside
 * `clean_name` so nothing is silently lost.
 */

const GENERIC_DESCRIPTOR_WORDS = new Set([
  "agency", "marketing", "digital", "seo", "branding", "brand", "design",
  "consulting", "staffing", "recruitment", "recruiting", "group", "studio",
  "solutions", "services", "creative", "media", "advertising", "pr",
  "communications", "web", "the", "and", "&", "of", "a", "an", "in",
  "ppc", "sem", "smm", "b2b", "b2c", "ux", "ui", "crm",
]);

// A tiny set of common location words so "Toronto Marketing Agency" is
// recognized as filler even though "Toronto" isn't in the generic list.
const COMMON_LOCATION_HINTS = /\b(london|toronto|sydney|berlin|austin|new york|nyc|la|los angeles|uk|usa|australia|canada|germany)\b/i;

function looksGeneric(segment) {
  const words = segment
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const genericCount = words.filter(
    (w) => GENERIC_DESCRIPTOR_WORDS.has(w) || COMMON_LOCATION_HINTS.test(w)
  ).length;
  // Segment counts as "generic filler" if most of its words are generic/location terms
  return genericCount / words.length >= 0.6;
}

export function cleanCompanyName(rawName) {
  if (!rawName) return { clean_name: null, raw_name: rawName };

  // Split on |, –, —, or " - " (hyphen surrounded by spaces, to avoid
  // breaking hyphenated words like "co-founder" or "e-commerce")
  const parts = rawName
    .split(/\s*[|–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    // No separator found — leave as-is, nothing safe to strip
    return { clean_name: rawName.trim(), raw_name: rawName };
  }

  const [first, ...rest] = parts;
  // Only drop trailing segments that look like generic descriptors.
  // Keep any segment that doesn't look generic (could be a real second brand name).
  const keptRest = rest.filter((seg) => !looksGeneric(seg));

  const cleanName = [first, ...keptRest].join(" - ").trim();
  return { clean_name: cleanName || rawName.trim(), raw_name: rawName };
}
