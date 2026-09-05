# RIVOX Lead Generation Engine

Discovers public business leads (SerpApi Google Local, with automatic Google Places fallback), cleans and enriches them, scores against the RIVOX ICP, and exports a categorized list.

## Setup
```
npm install
copy .env.example .env      # Windows PowerShell
```
Fill in `.env`:
- `SERPAPI_KEY` — required (primary source)
- `GOOGLE_PLACES_API_KEY` — optional. If set, the pipeline automatically falls back to Google Places for any query+location combo where SerpApi fails.

## Running it
```
npm run leads -- --query "marketing agency;creative agency;branding agency;consulting firm;staffing agency" --locations "Austin, Texas, United States;London, England, United Kingdom;Sydney, New South Wales, Australia;Toronto, Ontario, Canada;Berlin, Germany" --limit 10 --enrich --out output/batchN.json
```

Flags:
- `--query` — semicolon-separated search phrases
- `--locations` — semicolon-separated locations (each itself has commas, e.g. "Austin, Texas, United States")
- `--limit` — max results per query+location combo
- `--debug` — dumps raw API response for the first result of each combo
- `--enrich` — visits each lead's own website for description/email/contact link (slower, off by default)
- `--out` — path to save results as JSON

## What the pipeline does, in order
1. **Discovery** — SerpApi Google Local per query×location combo, with the correct `gl`/`google_domain` per country (`src/mapping/inferCountryParams.js`). Falls back to Google Places automatically if SerpApi errors and a Places key is configured (`src/discovery/googlePlaces.js`).
2. **Redirect resolution** — non-US Google domains (UK, AU, etc.) return a `google.com/goto` redirect instead of a direct URL. `src/enrichment/resolveRedirect.js` follows it to the real site.
3. **Cleaning** — tracking params (`utm_*`, `gclid`, `fbclid`) stripped from every URL (`src/mapping/normalizeLead.js`); marketing taglines stripped from business names, e.g. "X - Toronto Marketing Agency" → "X" (`src/mapping/cleanCompanyName.js`). Original name preserved as `raw_name`.
4. **Dedup** — within a single run, by `place_id` (or name+address fallback).
5. **Scoring** — Perfect / Maybe / Skip against the RIVOX ICP (`src/scoring/scoreLead.js`). Spot-check new query/region combos — the keyword list is tuned on US/UK/AU/CA/DE data so far.
6. **Enrichment** (`--enrich`) — description, public email, contact page link, pulled from each lead's own website (`src/enrichment/enrichWebsite.js`).
7. **Export** — `--out path.json` saves everything for later merge into the master Excel.

## Merging into the master Excel/DOCX
The existing outreach contact list (`RIVOX_Outreach_Master_Lead_List.docx`) is at the PERSON level (name, role, company) — a different shape than this pipeline's BUSINESS-level output (company, category, website, email). They can't be reliably merged into one deduplicated table (no shared unique ID), so the master workbook keeps them as separate tabs, with a best-effort company-name overlap flag for manual review.

To rebuild the master Excel/DOCX after a new `--out` run, share the new JSON file and ask for it to be merged in.

## Known limitations / not yet built
- Google Places fallback is untested against a live response (this dev environment has no network access to Google's API) — test with `--debug` before relying on it.
- Scoring keywords are a first pass; expand `STRONG_MATCH`/`WEAK_MATCH`/`HARD_SKIP` in `src/scoring/scoreLead.js` as new categories show up.
- No CRM integration (intentionally out of scope).
- No LinkedIn/WhatsApp/Facebook automation (intentionally out of scope, ToS risk — stays manual).
