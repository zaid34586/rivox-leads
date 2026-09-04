import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import minimist from "minimist";
import { searchSerpApiLocal } from "./discovery/serpapi.js";
import { normalizeSerpApiLead } from "./mapping/normalizeLead.js";
import { inferCountryParams } from "./mapping/inferCountryParams.js";
import { resolvePendingRedirects } from "./enrichment/resolveRedirect.js";
import { scoreLeads } from "./scoring/scoreLead.js";
import { logInfo, logWarn, logError } from "./utils/logger.js";

const args = minimist(process.argv.slice(2), {
  string: ["query", "locations", "limit", "out"],
  boolean: ["debug"],
  default: { limit: "5", debug: false },
});

function printUsageAndExit() {
  console.log(`
Usage:
  npm run leads -- --query "marketing agency" --locations "Austin, Texas, United States" --limit 5 [--debug] [--out results.json]

  --query       SEMICOLON-separated list of search phrases, e.g.:
                "marketing agency;creative agency;branding agency;consulting firm;staffing agency"
  --locations   SEMICOLON-separated list of locations (each location itself has commas), e.g.:
                "Austin, Texas, United States;London, England, United Kingdom;Sydney, New South Wales, Australia"
  --limit       Max results PER query+location combo (default 5).
  --debug       Print the raw API response for the first result of each combo.
  --out         Optional. Path to save all normalized+scored leads as JSON (for later dedupe/merge/export).

Rule of thumb: test small (limit 5, one query, one location) before combining everything into a big run.
`);
  process.exit(1);
}

async function main() {
  if (!args.query || !args.locations) {
    printUsageAndExit();
  }

  const apiKey = process.env.SERPAPI_KEY;
  const queries = args.query.split(";").map((q) => q.trim()).filter(Boolean);
  const locations = args.locations.split(";").map((l) => l.trim()).filter(Boolean);
  const limit = parseInt(args.limit, 10) || 5;

  logInfo(`Queries (${queries.length}): ${queries.join(" | ")}`);
  logInfo(`Locations (${locations.length}): ${locations.join(" | ")}`);
  logInfo(`Limit per combo: ${limit}${args.debug ? " (debug ON)" : ""}`);
  logInfo(`Total combos to run: ${queries.length * locations.length}`);

  const allRawResults = [];
  const failedCombos = [];

  for (const query of queries) {
    for (const location of locations) {
      logInfo(`\n--- Searching "${query}" in "${location}" ---`);
      const { gl, google_domain, _unmapped } = inferCountryParams(location);
      if (_unmapped) {
        logWarn(`  No country mapping found for "${location}" — defaulting to gl=us.`);
      } else {
        logInfo(`  Using gl=${gl}, google_domain=${google_domain}`);
      }
      try {
        const raw = await searchSerpApiLocal({
          query,
          location,
          limit,
          apiKey,
          debug: args.debug,
          gl,
          googleDomain: google_domain,
        });
        logInfo(`  -> ${raw.length} raw result(s) returned`);
        const normalized = raw.map((r) => normalizeSerpApiLead(r, location, query));
        allRawResults.push(...normalized);
      } catch (err) {
        failedCombos.push({ query, location, message: err.message });
        logError(`  -> Skipped "${query}" in "${location}" due to error above.`);
      }
    }
  }

  const seenPlaceIds = new Set();
  const deduped = [];
  let duplicatesRemoved = 0;
  for (const lead of allRawResults) {
    const key = lead.place_id || `${lead.name}|${lead.address}`;
    if (seenPlaceIds.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenPlaceIds.add(key);
    deduped.push(lead);
  }

  const pendingCount = deduped.filter((r) => r._pending_redirect).length;
  if (pendingCount > 0) {
    logInfo(`\nResolving ${pendingCount} Google redirect link(s) to find real websites...`);
    const { resolved, failed } = await resolvePendingRedirects(deduped);
    logInfo(`  -> resolved: ${resolved}, still unresolved: ${failed}`);
  }

  const tierCounts = scoreLeads(deduped);

  console.log("\n================ SUMMARY ================");
  logInfo(`Total raw results collected: ${allRawResults.length}`);
  logInfo(`Duplicates removed within this run: ${duplicatesRemoved}`);
  logInfo(`Unique leads: ${deduped.length}`);
  if (failedCombos.length > 0) {
    logWarn(`${failedCombos.length} combo(s) failed:`);
    failedCombos.forEach((f) => console.log(`   - "${f.query}" in "${f.location}": ${f.message}`));
  }

  const withWebsite = deduped.filter((r) => r.website).length;
  if (deduped.length > 0) {
    const pct = Math.round((withWebsite / deduped.length) * 100);
    logInfo(`Leads with a working website link: ${withWebsite}/${deduped.length} (${pct}%)`);
    logInfo(
      `\nScoring breakdown: Perfect ${tierCounts.perfect} | Maybe ${tierCounts.maybe} | Skip ${tierCounts.skip}`
    );
    ["Perfect", "Maybe", "Skip"].forEach((tier) => {
      const sample = deduped.filter((r) => r.tier === tier).slice(0, 5);
      if (sample.length === 0) return;
      console.log(`\n  -- ${tier} (showing up to 5) --`);
      sample.forEach((r) => {
        console.log(`     ${r.name} | category: "${r.category}" | ${r.score_reason}`);
      });
    });
  }

  if (args.out) {
    const outPath = path.resolve(args.out);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(deduped, null, 2));
    logInfo(`\nSaved ${deduped.length} leads to ${outPath}`);
  } else {
    logWarn(`\nNo --out path given — results were NOT saved to a file, only printed above.`);
  }
}

main().catch((err) => {
  logError("Fatal error, stopping run.", { message: err.message });
  process.exit(1);
});
