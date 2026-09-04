import "dotenv/config";
import minimist from "minimist";
import { searchSerpApiLocal } from "./discovery/serpapi.js";
import { logInfo, logWarn, logError } from "./utils/logger.js";

const args = minimist(process.argv.slice(2), {
  string: ["query", "locations", "limit"],
  boolean: ["debug"],
  default: { limit: "5", debug: false },
});

function printUsageAndExit() {
  console.log(`
Usage:
  npm run leads -- --query "marketing agency" --locations "Austin, Texas, United States" --limit 5 [--debug]

  --query       Search phrase (required)
  --locations   SEMICOLON-separated list of locations (each location itself has commas), e.g.:
                "Austin, Texas, United States;London, England, United Kingdom;Sydney, New South Wales, Australia"
  --limit       Max results PER location (default 5). Keep this small until a region is confirmed working.
  --debug       Print the raw API response for the first result of each location.

Day 1 rule of thumb: test ONE location at a time with --limit 5 before combining locations in one run.
`);
  process.exit(1);
}

async function main() {
  if (!args.query || !args.locations) {
    printUsageAndExit();
  }

  const apiKey = process.env.SERPAPI_KEY;
  // NOTE: split on ";" not "," — a single location string itself contains
  // commas (e.g. "Austin, Texas, United States"), so "," can't be the
  // separator between multiple locations.
  const locations = args.locations.split(";").map((l) => l.trim()).filter(Boolean);
  const limit = parseInt(args.limit, 10) || 5;

  logInfo(`Query: "${args.query}"`);
  logInfo(`Locations (${locations.length}): ${locations.join(" | ")}`);
  logInfo(`Limit per location: ${limit}${args.debug ? " (debug ON)" : ""}`);

  const allRawResults = [];
  const failedLocations = [];

  for (const location of locations) {
    logInfo(`\n--- Searching "${args.query}" in "${location}" ---`);
    try {
      const raw = await searchSerpApiLocal({
        query: args.query,
        location,
        limit,
        apiKey,
        debug: args.debug,
      });
      logInfo(`  -> ${raw.length} raw result(s) returned`);
      allRawResults.push(...raw.map((r) => ({ ...r, _source_location: location })));
    } catch (err) {
      failedLocations.push({ location, message: err.message });
      logError(`  -> Skipped "${location}" due to error above.`);
    }
  }

  console.log("\n================ SUMMARY ================");
  logInfo(`Total raw results collected: ${allRawResults.length}`);
  if (failedLocations.length > 0) {
    logWarn(`${failedLocations.length} location(s) failed:`);
    failedLocations.forEach((f) => console.log(`   - ${f.location}: ${f.message}`));
  }

  if (allRawResults.length > 0) {
    console.log("\nSample of collected results (name + whatever website field SerpApi gave us):");
    allRawResults.slice(0, 5).forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.title || "(no title field found)"} | website: ${
          r.website || "(no website field found — check --debug output)"
        } | location: ${r._source_location}`
      );
    });
  }

  console.log("\nNext step once this looks right for a region: add more locations, then move to enrichment/scoring.");
}

main().catch((err) => {
  logError("Fatal error, stopping run.", { message: err.message });
  process.exit(1);
});
