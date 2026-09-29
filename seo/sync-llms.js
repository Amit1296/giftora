/**
 * sync-llms.js — Guards llms.txt against drifting away from the site.
 *
 * Why this exists: llms.txt is hand-maintained and had no generator, so its
 * city-count silently disagreed with the pages it described. This script does
 * NOT rewrite the curated quotes — those are deliberately written to be
 * citable summaries, not copies of the meta description, and they are already
 * grounded in the pages' visible copy.
 *
 * It enforces only what can be verified mechanically:
 *   1. Every link resolves to a file that exists in the repo.
 *   2. The file keeps its llms.txt shape (title, summary block, valid UTF-8).
 *
 * It deliberately does NOT rewrite numbers. A "N+ cities" claim is scoped to a
 * service: the gift-delivery network has 99 city landing pages, but
 * surprise-acts legitimately claims 100+. Auto-rewriting every match would
 * make the file contradict the page it describes, so numeric claims are
 * reported for a human to confirm instead.
 *
 * Read-only. This script never writes.
 *
 * Usage:
 *   node seo/sync-llms.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "llms.txt");

/* The number the gift-delivery network can actually prove. */
function cityCount() {
  return fs.readdirSync(ROOT).filter((f) => /^gift-delivery-[a-z0-9-]+\.html$/.test(f) && f !== "gift-delivery-india.html").length;
}

const cityTotal = cityCount();
const truth = cityTotal + "+";

const text = fs.readFileSync(FILE, "utf8");

console.log("=== llms.txt audit (read-only) ===");
console.log("  city landing pages on disk : " + cityTotal);
console.log("  gift-delivery claim        : " + truth + "\n");

/* 1. numeric claims — reported, never rewritten */
console.log("  numeric claims (verify by service, not auto-fixed):");
const lines = text.split("\n");
lines.forEach((l, i) => {
  for (const m of l.matchAll(/(\d+)\+\s+(cities|rose)/gi)) {
    const page = (l.match(/gift-ora\.online\/([^)#\s]*)/) || [, "?"])[1];
    console.log("    line " + String(i + 1).padStart(3) + "  " + m[0].padEnd(14) +
      " in " + page);
  }
});

/* 2. links resolve */
console.log("\n  link check:");
const links = [...text.matchAll(/\]\((https:\/\/gift-ora\.online\/[^)#]*)(#[^)]*)?\)/g)];
let broken = 0;
for (const [, raw] of links) {
  const rel = raw.replace("https://gift-ora.online/", "");
  const candidates = [rel, rel + "index.html"].filter(Boolean);
  if (!candidates.some((c) => fs.existsSync(path.join(ROOT, c)))) {
    console.log("    BROKEN: " + raw);
    broken++;
  }
}
console.log("    " + links.length + " links checked, " + broken + " broken");

/* 3. format sanity */
console.log("\n  format:");
console.log("    starts with '# '        : " + /^#\s+\S/m.test(text));
console.log("    has a summary '>' block  : " + /^>\s+\S/m.test(text));
const stray = [...text].filter((c) => c.charCodeAt(0) > 0x2fff && c.charCodeAt(0) < 0xfeff);
console.log("    stray non-ASCII symbols : " + stray.length);
console.log("    valid UTF-8             : " +
  (Buffer.compare(Buffer.from(text, "utf8"), fs.readFileSync(FILE)) === 0 ? "yes" : "no"));
console.log("    bytes                   : " + Buffer.byteLength(text, "utf8"));

console.log("\n  audit only — llms.txt not modified");

