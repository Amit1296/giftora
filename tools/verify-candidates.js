/* Verify a candidate keyword batch against:
   1. every <meta name="keywords"> in root + products/ (normalized, case-insensitive)
   2. seo/keyword-master.txt entries
   Reports EXACT duplicates and NEAR duplicates (one is a token-subset of the other).
   Dry run only — writes nothing. */
const fs = require("fs");
const path = require("path");

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(norm(s).split(" ").filter(Boolean));

const CANDIDATES = [
  "diwali gift hampers for corporate",
  "buy dry fruits online",
  "premium nuts in India",
  "dry fruit gift packs",
  "dry fruits online delivery",
  "dry fruits delivery [City]",
  "buy dry fruits online in [City]",
  "corporate Diwali gifting in India",
  "gifts with free shipping",
  "expedited shipping for gifts",
  "guaranteed delivery by [date]",
  "cheap birthday flowers delivery",
  "affordable dry fruit gift basket",
  "budget cake delivery [city]",
  "florist near me",
  "flower shop near me",
  "flowers near me",
  "flower shop",
  "flower delivery",
  "send flowers",
  "same day flower delivery",
  "wedding flowers",
  "flowers online",
];

/* collect existing keywords: file -> list */
const existing = []; // {kw, norm, file}
const htmlFiles = fs.readdirSync(".").filter((f) => f.endsWith(".html"))
  .concat(fs.readdirSync("products").filter((f) => f.endsWith(".html")).map((f) => "products/" + f));
for (const f of htmlFiles) {
  const h = fs.readFileSync(f, "utf8");
  const m = h.match(/<meta\s+name="keywords"\s+content="([^"]*)"/i);
  if (!m) continue;
  m[1].split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((kw) => existing.push({ kw, norm: norm(kw), file: f }));
}

/* master list */
const master = fs.readFileSync("seo/keyword-master.txt", "utf8").split(/\r?\n/)
  .map((l) => { const m = l.match(/^(.+?)\s*\|/); return m ? m[1].trim() : null; })
  .filter(Boolean)
  .map((kw) => ({ kw, norm: norm(kw), file: "keyword-master.txt" }));

const all = existing.concat(master);

/* also candidates against each other */
console.log("existing keywords scanned: " + existing.length + " meta + " + master.length + " master\n");

const results = [];
for (const c of CANDIDATES) {
  const nc = norm(c);
  const tc = tokens(c);
  const exact = all.filter((e) => e.norm === nc);
  const near = all.filter((e) => {
    if (e.norm === nc) return false;
    const te = tokens(e.kw);
    /* token-subset either direction, min 2 shared tokens */
    const shared = [...tc].filter((t) => te.has(t)).length;
    if (shared < 2) return false;
    return [...te].every((t) => tc.has(t)) || [...tc].every((t) => te.has(t));
  });
  results.push({ c, nc, exact, near });
}

for (const r of results) {
  if (r.exact.length) {
    console.log("EXACT DUP  : " + r.c);
    const files = [...new Set(r.exact.map((e) => e.file))];
    console.log("           already in -> " + files.join(", "));
  } else if (r.near.length) {
    console.log("NEAR  DUP  : " + r.c);
    r.near.slice(0, 6).forEach((e) => console.log('           ~ "' + e.kw + '" (' + e.file + ")"));
    if (r.near.length > 6) console.log("           ... +" + (r.near.length - 6) + " more");
  } else {
    console.log("FREE       : " + r.c);
  }
}

const dupes = results.filter((r) => r.exact.length).length;
const near = results.filter((r) => !r.exact.length && r.near.length).length;
const free = results.filter((r) => !r.exact.length && !r.near.length).length;
console.log("\n--- summary: " + free + " free / " + near + " near-dup / " + dupes + " exact dup of " + CANDIDATES.length + " candidates");
