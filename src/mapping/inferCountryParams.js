/**
 * Infers SerpApi's `gl` (country) and `google_domain` params from a
 * location string like "London, England, United Kingdom".
 *
 * WHY THIS EXISTS: without an explicit `gl`, SerpApi defaults to gl=us.
 * Searching a UK/AU location while telling Google the searcher is in the
 * US appears to make Google wrap outbound business links in a
 * "google.com/goto?url=..." redirect instead of returning the direct
 * website URL — which is what we saw in the London and Sydney --debug
 * output (0% usable websites, all wrapped in goto links).
 *
 * This is a best-effort fix based on that observed pattern — re-run
 * --debug for each region after this change to confirm the goto-redirect
 * wrapping actually goes away.
 */
const COUNTRY_MAP = [
  { match: "united kingdom", gl: "uk", google_domain: "google.co.uk" },
  { match: ", uk", gl: "uk", google_domain: "google.co.uk" },
  { match: "australia", gl: "au", google_domain: "google.com.au" },
  { match: "canada", gl: "ca", google_domain: "google.ca" },
  { match: "united states", gl: "us", google_domain: "google.com" },
  { match: "germany", gl: "de", google_domain: "google.de" },
  { match: "france", gl: "fr", google_domain: "google.fr" },
  { match: "netherlands", gl: "nl", google_domain: "google.nl" },
  { match: "ireland", gl: "ie", google_domain: "google.ie" },
  { match: "spain", gl: "es", google_domain: "google.es" },
  { match: "italy", gl: "it", google_domain: "google.it" },
];

export function inferCountryParams(location) {
  const loc = (location || "").toLowerCase();
  for (const entry of COUNTRY_MAP) {
    if (loc.includes(entry.match)) {
      return { gl: entry.gl, google_domain: entry.google_domain };
    }
  }
  // Fallback: keep prior default behavior (US) rather than leaving unset,
  // but flag it so an unmapped country doesn't fail silently.
  return { gl: "us", google_domain: "google.com", _unmapped: true };
}
