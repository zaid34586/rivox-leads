/**
 * Best-effort website enrichment: for a lead's own public website, pull
 *   - description: <meta name="description"> or og:description
 *   - email: any mailto: link or email-shaped text found on the page
 *   - contact_link: an <a> tag whose href or text mentions "contact"
 *
 * This only ever visits a business's OWN website (the URL already
 * discovered for that lead) — nothing here scrapes third-party or
 * unrelated sites.
 */

const TIMEOUT_MS = 8000;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_BLOCKLIST_DOMAINS = ["example.com", "sentry.io", "wixpress.com", "godaddy.com"];

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function extractDescription(html) {
  const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (metaDesc) return metaDesc[1].trim();
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (ogDesc) return ogDesc[1].trim();
  return null;
}

function extractEmail(html) {
  const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailtoMatch) return mailtoMatch[1];

  const found = html.match(EMAIL_REGEX) || [];
  const valid = found.find(
    (e) => !EMAIL_BLOCKLIST_DOMAINS.some((d) => e.toLowerCase().endsWith(d))
  );
  return valid || null;
}

function extractContactLink(html, baseUrl) {
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
    if (href.toLowerCase().includes("contact") || text.includes("contact")) {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function enrichWebsite(websiteUrl) {
  if (!websiteUrl) return { description: null, email: null, contact_link: null };

  const html = await fetchHtml(websiteUrl);
  if (!html) return { description: null, email: null, contact_link: null };

  return {
    description: extractDescription(html),
    email: extractEmail(html),
    contact_link: extractContactLink(html, websiteUrl),
  };
}

export async function enrichLeads(leads, concurrency = 5) {
  const withWebsite = leads.filter((l) => l.website);
  let gotDescription = 0;
  let gotEmail = 0;

  for (let i = 0; i < withWebsite.length; i += concurrency) {
    const batch = withWebsite.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (lead) => {
        const result = await enrichWebsite(lead.website);
        lead.description = result.description;
        lead.email = result.email;
        lead.contact_link = result.contact_link;
        if (result.description) gotDescription += 1;
        if (result.email) gotEmail += 1;
      })
    );
  }

  return { attempted: withWebsite.length, gotDescription, gotEmail };
}
