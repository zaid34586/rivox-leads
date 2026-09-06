import { inferCountryParams } from "./inferCountryParams.js";

// flag-icons uses standard ISO 3166-1 alpha-2 codes. Google's `gl` param
// uses "uk" for the United Kingdom, which is NOT the ISO code (that's "gb") —
// translate the few places these diverge.
const GL_TO_ISO = { uk: "gb" };

const COUNTRY_DISPLAY_NAMES = {
  us: "United States",
  gb: "United Kingdom",
  au: "Australia",
  ca: "Canada",
  de: "Germany",
  fr: "France",
  nl: "Netherlands",
  ie: "Ireland",
  es: "Spain",
  it: "Italy",
};

/**
 * @param {string} location - e.g. "Austin, Texas, United States"
 * @returns {{ flagCode: string, countryName: string }}
 */
export function getFlagAndCountryName(location) {
  const { gl } = inferCountryParams(location);
  const flagCode = GL_TO_ISO[gl] || gl;
  const countryName =
    COUNTRY_DISPLAY_NAMES[flagCode] ||
    (location || "").split(",").pop().trim() ||
    "Unknown";
  return { flagCode, countryName };
}
