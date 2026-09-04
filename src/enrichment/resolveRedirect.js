import { isGoogleHost, cleanWebsiteUrl } from "../mapping/normalizeLead.js";

/**
 * Follows a Google "goto" redirect link (seen on non-US Google domains like
 * google.co.uk, google.com.au) and returns the final business URL it lands
 * on. Returns null if the request fails, times out, or the redirect never
 * actually leaves google's domain (meaning it couldn't be resolved).
 *
 * NOT verified against a live response yet — this environment has no
 * network access to google.co.uk / google.com.au. Test this against real
 * UK/AU results and report back what % resolve successfully.
 */
export async function resolveGoogleRedirect(redirectUrl, timeoutMs = 6000) {
  if (!redirectUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(redirectUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Some redirect endpoints behave differently without a normal UA
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    clearTimeout(timer);

    const finalUrl = res.url;
    if (!finalUrl || isGoogleHost(finalUrl)) {
      // Either fetch gave us nothing, or the redirect chain kept us on
      // google's own domain (e.g. landed on a consent/interstitial page).
      return null;
    }
    return finalUrl;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Resolves _pending_redirect on a batch of normalized leads in place,
 * with limited concurrency so we don't fire 100 requests at once.
 * @param {Array<Object>} leads - normalized leads (from normalizeSerpApiLead)
 * @param {number} concurrency
 * @returns {Promise<{resolved: number, failed: number}>}
 */
export async function resolvePendingRedirects(leads, concurrency = 5) {
  const pending = leads.filter((l) => l._pending_redirect);
  let resolved = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (lead) => {
        const finalUrl = await resolveGoogleRedirect(lead._pending_redirect);
        if (finalUrl) {
          lead.website = cleanWebsiteUrl(finalUrl);
          resolved += 1;
        } else {
          failed += 1;
        }
      })
    );
  }

  return { resolved, failed };
}
