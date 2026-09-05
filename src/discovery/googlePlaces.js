import { logDebug, logError, logWarn } from "../utils/logger.js";

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Queries Google Places API (New) Text Search for a query + location string.
 * Mirrors searchSerpApiLocal's interface so index.js can treat both sources
 * interchangeably: mandatory error-field checking, --debug dump of the
 * first raw result, no silent empty-result failures.
 *
 * Requires GOOGLE_PLACES_API_KEY in .env. Get one at:
 * https://console.cloud.google.com/apis/credentials (enable "Places API (New)").
 *
 * NOT verified against a live response — this sandbox has no network access
 * to Google's API. Test with --debug on a small batch first.
 */
export async function searchGooglePlaces({ query, location, limit, apiKey, debug }) {
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is missing. Add it to .env to use Google Places as a fallback source."
    );
  }

  const body = { textQuery: `${query} in ${location}` };

  let response;
  try {
    response = await fetch(PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.id,places.location",
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    logError(`Network request to Google Places failed for "${query}" in "${location}"`, {
      message: networkErr.message,
    });
    throw networkErr;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    logError(`Google Places response was not valid JSON for "${query}" in "${location}"`, {
      status: response.status,
      statusText: response.statusText,
    });
    throw parseErr;
  }

  if (data.error) {
    logError(`Google Places returned an error for "${query}" in "${location}"`, {
      error: data.error,
      http_status: response.status,
    });
    throw new Error(`Google Places error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  if (!response.ok) {
    logError(`Google Places HTTP error for "${query}" in "${location}"`, {
      http_status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Google Places HTTP ${response.status}: ${response.statusText}`);
  }

  const rawResults = data.places || [];

  if (rawResults.length === 0) {
    logWarn(
      `Zero results from Google Places for "${query}" in "${location}" — no error field present, looks like a genuine empty search.`
    );
  }

  if (debug && rawResults.length > 0) {
    logDebug(true, `Raw first Google Places result for "${query}" in "${location}"`, rawResults[0]);
  }

  return rawResults.slice(0, limit);
}
