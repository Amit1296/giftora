/**
 * inject-howto.js — Adds HowTo schema to pages that already render a real
 * ordered process in their visible HTML (.steps-grid > .step-card).
 *
 * Why the careful filtering matters:
 *   The .steps-grid class is overloaded. On most pages it holds 4 genuine
 *   process steps FOLLOWED by feature badges that reuse the same markup
 *   (e.g. <span class="step-num">📍</span> "Same-day in Delhi NCR").
 *   Some pages mix a "Top 15 gift ideas" listicle into the same class.
 *
 *   So a step only counts when its step-num is a plain integer. That cleanly
 *   separates real steps from emoji feature badges, and the contiguous 1..N
 *   check plus the step-count ceiling rejects listicles.
 *
 * Additive only: existing schema blocks are never touched. Schema text is
 * derived from the page's own visible copy, so markup cannot drift from
 * content. Idempotent — guarded by a marker comment.
 *
 * Usage:
 *   node seo/inject-howto.js          # dry run, prints the plan
 *   node seo/inject-howto.js --apply  # writes
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MARKER = "<!-- SITEWIDE-HOWTO-SCHEMA -->";
const APPLY = process.argv.includes("--apply");

const SKIP = new Set([
  "admin.html",
  "banner-template.html",
  "blog-template.html",
  "checkout-preview.html",
  "google7700e6aeefbc94c5.html",
  "product.html",
]);

/* A usable HowTo name describes a procedure, not a list of tips. */
const NAME_OK = /\bhow to\b|\border(ing)?\b|\bprocess\b|\bsteps?\b|\bworks\b|\bguide\b/i;

/* A real procedure is short. This ceiling is what rejects the 15-item listicles. */
const MIN_STEPS = 3;
const MAX_STEPS = 8;

/**
 * Guard against injecting the same HowTo across the whole site.
 * The city and collection pages all render one shared "Order in minutes"
 * block, so 110 of them would otherwise receive a byte-identical HowTo.
 * That is scaled duplicate markup, and HowTo rich results were retired by
 * Google in Aug 2023, so it buys no rich result while adding spam risk.
 *
 * Only procedures that are unique on the site are emitted. There is no
 * "first page wins" fallback on purpose: picking an arbitrary owner is the
 * same cannibalisation problem this site just fixed for keywords.
 */
const EMIT_ONLY_UNIQUE = true;

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&hellip;/gi, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Each .steps-grid is handled on its own so a page carrying two grids
 * (a listicle plus a real how-to) can keep the genuine one.
 */
function findGrids(html) {
  const idx = [];
  let i = -1;
  while ((i = html.indexOf('class="steps-grid"', i + 1)) !== -1) idx.push(i);
  return idx.map((start, n) => ({
    start,
    region: html.slice(start, n + 1 < idx.length ? idx[n + 1] : html.length),
  }));
}

function parseSteps(region) {
  return region
    .split('<div class="step-card">')
    .slice(1)
    .map((card) => {
      const num = ((card.match(/step-num">([^<]*)</) || [, ""])[1] || "").trim();
      const title = stripHtml((card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [, ""])[1] || "");
      const body = stripHtml((card.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [, ""])[1] || "");
      return { num, title, body };
    })
    .filter((s) => s.title && s.body);
}

/** Keep only integer-numbered steps, and require an unbroken 1..N run. */
function realSteps(steps) {
  const numeric = steps
    .filter((s) => /^\d{1,2}$/.test(s.num))
    .map((s) => ({ ...s, n: Number(s.num) }))
    .sort((a, b) => a.n - b.n);
  if (numeric.length < MIN_STEPS || numeric.length > MAX_STEPS) return null;
  for (let i = 0; i < numeric.length; i++) {
    if (numeric[i].n !== i + 1) return null;
  }
  return numeric;
}

/** Nearest real heading above the grid — that is the visible section title. */
function headingAbove(html, start) {
  const before = html.slice(Math.max(0, start - 2500), start);
  const h = [...before.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  if (!h.length) return "";
  return stripHtml(h[h.length - 1][1]);
}

function urlFor(page) {
  return "https://gift-ora.online/" + (page === "index.html" ? "" : page);
}

function block(name, url, steps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description: steps.map((s) => s.title).join(", "),
    step: steps.map((s) => ({
      "@type": "HowToStep",
      position: s.n,
      name: s.title,
      text: s.body,
    })),
  };
  return (
    "\n" + MARKER + "\n" +
    '<script type="application/ld+json">\n' + JSON.stringify(data, null, 2) + "\n</script>\n"
  );
}

const candidates = [];
const rejected = [];

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html") || SKIP.has(f)) continue;
  const file = path.join(ROOT, f);
  let html = fs.readFileSync(file, "utf8");

  if (html.includes(MARKER)) continue;
  if (html.includes('"@type": "HowTo"')) continue;
  if (!/class="steps-grid"/.test(html)) continue;
  if (html.includes('name="robots" content="noindex')) continue;

  let hit = null;
  for (const grid of findGrids(html)) {
    const steps = realSteps(parseSteps(grid.region));
    if (!steps) continue;
    const name = headingAbove(html, grid.start);
    if (!name || !NAME_OK.test(name)) continue;
    hit = { name, steps, start: grid.start };
    break;
  }

  if (!hit) {
    rejected.push({ f, why: "no qualifying ordered process" });
    continue;
  }
  candidates.push({ file, page: f, name: hit.name, steps: hit.steps });
}

/* Drop any procedure that more than one page renders identically. */
const freq = new Map();
for (const c of candidates) {
  const sig = c.name + "||" + c.steps.map((s) => s.title).join("|");
  c.sig = sig;
  freq.set(sig, (freq.get(sig) || 0) + 1);
}
const plan = candidates.filter((c) => {
  if (!EMIT_ONLY_UNIQUE || freq.get(c.sig) === 1) return true;
  rejected.push({ f: c.page, why: "identical procedure also on " + (freq.get(c.sig) - 1) + " other page(s)" });
  return false;
});

console.log("=== HowTo plan ===");
console.log("  pages eligible: " + plan.length);
console.log("  pages skipped  : " + rejected.length + "\n");

const byName = new Map();
for (const p of plan) {
  if (!byName.has(p.name)) byName.set(p.name, []);
  byName.get(p.name).push(p.page);
}
console.log("  distinct HowTo names:");
for (const [n, files] of [...byName.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log("    " + String(files.length).padStart(3) + "x  " + n);
  console.log("         e.g. " + files.slice(0, 2).join(", "));
}

console.log("\n  step counts: " +
  JSON.stringify(plan.reduce((a, p) => ((a[p.steps.length] = (a[p.steps.length] || 0) + 1), a), {})));

console.log("\n  skipped (first 12):");
rejected.slice(0, 12).forEach((r) => console.log("    " + r.f.padEnd(42) + r.why));
if (rejected.length > 12) console.log("    ... and " + (rejected.length - 12) + " more");

if (APPLY) {
  let n = 0;
  for (const p of plan) {
    const html = fs.readFileSync(p.file, "utf8");
    const head = html.indexOf("</head>");
    if (head === -1) continue;
    const out = html.slice(0, head) + block(p.name, urlFor(p.page), p.steps) + html.slice(head);
    fs.writeFileSync(p.file, out, "utf8");
    n++;
  }
  console.log("\n  WRITTEN: " + n + " pages");
} else {
  console.log("\n  (dry run — pass --apply to write)");
}
