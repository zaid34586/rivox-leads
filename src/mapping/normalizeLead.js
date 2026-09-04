/**
 * Maps a raw SerpApi google_local result into a clean, consistent lead shape.
 *
 * Confirmed against a REAL --debug response (Austin, TX, "marketing agency"):
 *   - Website + phone live under `links.website` / `links.phone`, NOT top-level.
 *     (`phone` also exists top-level, unformatted — we keep the top-level one.)
 *   - `title` = business name, `type` = category, `address`, `rating`, `reviews`,
 *     `gps_coordinates`, `place_id` are all top-level.
 *
 * IMPORTANT: this mapping was verified for a US (Austin, TX) result only.
 * Per the roadmap's known pitfalls, re-check with --debug for UK and AU
 * results too — field shapes can differ by region — before trusting this
 * mapping across all regions.
 */

// Tracking params commonly appended by Google Business Profile links.
// Strip these so the same business's URL doesn't look "different" across leads.
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
];

/**
 * Removes tracking query params from a URL. Returns null if the URL is
 * missing, unparseable, or is actually a Google redirect/maps link rather
 * than the business's own site (per pitfall: "don't treat a Google redirect
 * link as a real website — filter those out at the source, not after").
 */
export function isGoogleHost(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    return host.includes("google.com") || host.includes("google.co");
  } catch {
    return false;
  }
}

export function cleanWebsiteUrl(rawUrl) {
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (isGoogleHost(rawUrl)) return null;

  TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));

  // Drop a trailing "?" left over if all params were stripped
  let cleaned = url.toString();
  if (cleaned.endsWith("?")) cleaned = cleaned.slice(0, -1);

  return cleaned;
}

/**
 * @param {Object} raw - one entry from SerpApi's local_results array
 * @param {string} sourceLocation - the location string this result came from
 * @returns {Object} normalized lead
 */
export function normalizeSerpApiLead(raw, sourceLocation, sourceQuery) {
  const rawWebsite = raw.links?.website || null;
  const isRedirect = rawWebsite ? isGoogleHost(rawWebsite) : false;

  return {
    name: raw.title || null,
    category: raw.type || null,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    review_count: typeof raw.reviews === "number" ? raw.reviews : null,
    phone: raw.phone || raw.links?.phone?.replace(/^tel:/, "") || null,
    website: isRedirect ? null : cleanWebsiteUrl(rawWebsite),
    _pending_redirect: isRedirect ? rawWebsite : null,
    address: raw.address || null,
    place_id: raw.place_id || null,
    gps: raw.gps_coordinates || null,
    source_location: sourceLocation,
    source_query: sourceQuery || null,
    _raw_type: raw.type || null,
  };
}
