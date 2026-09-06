import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";

import { searchSerpApiLocal } from "./discovery/serpapi.js";
import { searchGooglePlaces } from "./discovery/googlePlaces.js";
import { normalizeSerpApiLead, normalizeGooglePlacesLead } from "./mapping/normalizeLead.js";
import { inferCountryParams } from "./mapping/inferCountryParams.js";
import { getFlagAndCountryName } from "./mapping/flagLookup.js";
import { cleanCompanyName } from "./mapping/cleanCompanyName.js";
import { resolvePendingRedirects } from "./enrichment/resolveRedirect.js";
import { enrichLeads } from "./enrichment/enrichWebsite.js";
import { scoreLeads } from "./scoring/scoreLead.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const DEFAULT_QUERIES = [
  "marketing agency",
  "creative agency",
  "branding agency",
  "consulting firm",
  "staffing agency",
];
const DEFAULT_LOCATIONS = [
  "Austin, Texas, United States",
  "London, England, United Kingdom",
  "Sydney, New South Wales, Australia",
  "Toronto, Ontario, Canada",
  "Berlin, Germany",
];

import { readdirSync, readFileSync, statSync } from "fs";

const app = express();
app.use(express.static(path.join(__dirname, "..", "web")));

app.get("/api/runs", (req, res) => {
  const outDir = path.join(__dirname, "..", "output");
  let files = [];
  try {
    files = readdirSync(outDir).filter((f) => f.endsWith(".json"));
  } catch {
    return res.json([]);
  }

  const runs = files
    .map((f) => {
      const fullPath = path.join(outDir, f);
      let leads = [];
      try {
        leads = JSON.parse(readFileSync(fullPath, "utf-8"));
        if (!Array.isArray(leads)) leads = [];
      } catch {
        leads = [];
      }
      const perfect = leads.filter((l) => l.tier === "Perfect").length;
      const maybe = leads.filter((l) => l.tier === "Maybe").length;
      const skip = leads.filter((l) => l.tier === "Skip").length;
      return {
        file: f,
        timestamp: statSync(fullPath).mtime.getTime(),
        total: leads.length,
        perfect,
        maybe,
        skip,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json(runs);
});

app.get("/api/generate", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const apiKey = process.env.SERPAPI_KEY;
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const limit = parseInt(req.query.limit, 10) || 10;
  const enrich = req.query.enrich === "true";
  const queries = (req.query.query ? req.query.query.split(";") : DEFAULT_QUERIES).map((s) => s.trim());
  const locations = (req.query.locations ? req.query.locations.split(";") : DEFAULT_LOCATIONS).map((s) => s.trim());

  if (!apiKey) {
    send("error", { message: "SERPAPI_KEY missing in .env on the server." });
    return res.end();
  }

  send("start", { totalCombos: queries.length * locations.length });

  const allLeads = [];

  for (const query of queries) {
    for (const location of locations) {
      const { gl, google_domain } = inferCountryParams(location);
      const { flagCode, countryName } = getFlagAndCountryName(location);
      try {
        const raw = await searchSerpApiLocal({ query, location, limit, apiKey, gl, googleDomain: google_domain });
        const normalized = raw.map((r) => normalizeSerpApiLead(r, location, query));
        for (const lead of normalized) {
          allLeads.push(lead);
          send("lead", { name: lead.name, flagCode, countryName });
        }
      } catch (err) {
        if (placesKey) {
          try {
            const rawPlaces = await searchGooglePlaces({ query, location, limit, apiKey: placesKey });
            const normalizedPlaces = rawPlaces.map((r) => normalizeGooglePlacesLead(r, location, query));
            for (const lead of normalizedPlaces) {
              allLeads.push(lead);
              send("lead", { name: lead.name, flagCode, countryName });
            }
          } catch {
            send("combo_error", { query, location, message: err.message });
          }
        } else {
          send("combo_error", { query, location, message: err.message });
        }
      }
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const lead of allLeads) {
    const key = lead.place_id || `${lead.name}|${lead.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(lead);
  }

  await resolvePendingRedirects(deduped);
  for (const lead of deduped) {
    const { clean_name, raw_name } = cleanCompanyName(lead.name);
    lead.raw_name = raw_name;
    lead.name = clean_name;
  }
  const tierCounts = scoreLeads(deduped);

  if (enrich) {
    send("enriching", { count: deduped.filter((l) => l.website).length });
    await enrichLeads(deduped);
  }

  const outDir = path.join(__dirname, "..", "output");
  mkdirSync(outDir, { recursive: true });
  const filename = `dashboard-run-${Date.now()}.json`;
  const outPath = path.join(outDir, filename);
  writeFileSync(outPath, JSON.stringify(deduped, null, 2));

  send("done", {
    total: deduped.length,
    perfect: tierCounts.perfect,
    maybe: tierCounts.maybe,
    skip: tierCounts.skip,
    savedTo: `output/${filename}`,
  });
  res.end();
});

app.listen(PORT, () => {
  console.log(`\nRIVOX dashboard running: http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop.\n`);
});
