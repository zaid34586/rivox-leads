import { logDebug, logError, logWarn } from "../utils/logger.js";

const SERPAPI_BASE_URL = "https://serpapi.com/search.json";

/**
 * Queries SerpApi's Google Local Results engine for a single query + location.
 *
 * Pitfalls this deliberately guards against (see roadmap "Known pitfalls"):
 *  - "0 results" can mean a real empty search, an exhausted quota, or a
 *    swallowed error. We ALWAYS check `data.error` first and surface it —
 *    we never silently return an empty array without knowing why.
 *  - Field names can differ across regions. `--debug` dumps the raw first
 *    result so you can inspect real field names before trusting the mapping.
 *  - We do not paginate here by default. One request = one page of results
 *    (SerpApi's local engine returns up to ~20 per page). Scale volume only
 *    after correctness is confirmed for a region, per the roadmap's Day 1
 *    "test small, then combine" step.
 *
 * @param {Object} opts
 * @param {string} opts.query - e.g. "marketing agency"
 * @param {string} opts.location - e.g. "Austin, Texas, United States"
 * @param {number} opts.limit - max number of raw results to return (<=20 recommended for a single page)
 * @param {string} opts.apiKey - SerpApi key
 * @param {boolean} opts.debug - if true, dumps the raw response for the first result
 * @returns {Promise<Array<Object>>} raw local_results entries (unmapped, as SerpApi returns them)
 */
export async function searchSerpApiLocal({ query, location, limit, apiKey, debug, gl, googleDomain }) {
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY is missing. Copy .env.example to .env and add your real key."
    );
  }

  const params = new URLSearchParams({
    engine: "google_local",
    q: query,
    location,
    api_key: apiKey,
  });
  if (gl) params.set("gl", gl);
  if (googleDomain) params.set("google_domain", googleDomain);

  const url = `${SERPAPI_BASE_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    logError(`Network request to SerpApi failed for "${query}" in "${location}"`, {
      message: networkErr.message,
    });
    throw networkErr;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    logError(`SerpApi response was not valid JSON for "${query}" in "${location}"`, {
      status: response.status,
      statusText: response.statusText,
    });
    throw parseErr;
  }

  // --- MANDATORY error-field check (pitfall #1) ---
  // Never trust an empty/missing local_results array without checking this first.
  if (data.error) {
    logError(`SerpApi returned an error for "${query}" in "${location}"`, {
      error: data.error,
      http_status: response.status,
    });
    throw new Error(`SerpApi error: ${data.error}`);
  }

  if (!response.ok) {
    logError(`SerpApi HTTP error for "${query}" in "${location}"`, {
      http_status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`SerpApi HTTP ${response.status}: ${response.statusText}`);
  }

  const rawResults = data.local_results || [];

  if (rawResults.length === 0) {
    logWarn(
      `Zero results for "${query}" in "${location}" — no error field was present, ` +
        `so this looks like a genuine empty search. If this seems wrong, re-run with --debug.`
    );
  }

  // Dump the raw shape of the FIRST result only, so field-name differences
  // across regions can be inspected before writing/trusting a mapping.
  if (debug && rawResults.length > 0) {
    logDebug(true, `Raw first result for "${query}" in "${location}"`, rawResults[0]);
  }

  return rawResults.slice(0, limit);
}
