/**
 * inject-speakable.js — Adds a standalone Speakable schema block to pages
 * that already carry an FAQPage schema, so voice assistants and AI engines
 * know which section of the page is best to read aloud.
 *
 * Additive only: it never removes or edits existing SEO blocks. It is
 * idempotent — existing SITEWIDE-SPEAKABLE-SCHEMA blocks are left untouched.
 *
 * Usage:
 *   node seo/inject-speakable.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MARKER = "<!-- SITEWIDE-SPEAKABLE-SCHEMA -->";
const TARGET = "<!-- SITEWIDE-FAQ-SCHEMA -->";

/**
 * Last content-change date per file, taken from git. Used for schema.org
 * dateModified so the value reflects a real commit rather than a build stamp.
 * If git is unavailable the date key is simply omitted.
 */
function gitDates() {
  const map = new Map();
  try {
    const out = execFileSync("git", ["log", "--format=%cI", "--name-only", "--no-merges"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    let date = null;
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
        date = t.slice(0, 10);
        continue;
      }
      if (date && /\.(html|js|css)$/.test(t) && !map.has(t)) map.set(t, date);
    }
  } catch (e) {
    console.log("  (git unavailable — skipping dateModified)");
  }
  return map;
}

const TARGETS = (() => {
  const base = [
    "index.html",
    "blog-nri-gift-guide.html",
    "blog-rakhi-gifts-nri.html",
    "blog-festival-gifts-nri.html",
    "blog-gifts-under-1000.html",
    "blog-birthday-gifts-delhi.html",
    "blog-cake-delivery-faridabad.html",
    "blog-best-online-gift-shop-india.html",
    "blog-teachers-day-gifts.html",
    "blog-diwali-gifts.html",
    "blog-karwa-chauth-gifts.html",
    "belts.html",
    "cakes.html",
    "caps.html",
    "clothes.html",
    "combo.html",
    "festival.html",
    "flowers.html",
    "gift-delivery-india.html",
    "jewellery.html",
    "plants.html",
    "send-gifts-to-india.html",
    "shoes.html",
    "special-offers.html",
    "sunglasses.html",
    "teachers-day-gifts.html",
    "teddy.html",
    "toys.html",
  ];
  const extras = fs.readdirSync(ROOT).filter((f) => /^gift-delivery-[a-z0-9-]+\.html$/.test(f));
  return [...new Set([...base, ...extras])];
})();

const CSS_HOME = ['"#why-giftora .seo-copy"', '"#why-giftora .faq-list"'];
const CSS_BLOG = ['"#faq .faq-list"'];
const CSS_CATEGORY = ['".faq-list"'];

const CATEGORY_PAGES = new Set([
  "belts.html",
  "cakes.html",
  "caps.html",
  "clothes.html",
  "combo.html",
  "festival.html",
  "flowers.html",
  "gift-delivery-india.html",
  "jewellery.html",
  "plants.html",
  "send-gifts-to-india.html",
  "shoes.html",
  "special-offers.html",
  "sunglasses.html",
  "teachers-day-gifts.html",
  "teddy.html",
  "toys.html",
]);

function buildBlock(page, url, title, date) {
  const selectors = CATEGORY_PAGES.has(page) || /^gift-delivery-[a-z0-9-]+\.html$/.test(page)
    ? CSS_CATEGORY
    : page === "index.html" ? CSS_HOME : CSS_BLOG;
  const base = url.replace(/[^/]*$/, "");
  return [
    MARKER,
    '<script type="application/ld+json">',
    "{",
    '  "@context": "https://schema.org",',
    '  "@type": "WebPage",',
    '  "@id": "' + url + '#speakable",',
    '  "url": "' + url + '",',
    '  "name": "' + title + '",',
    '  "inLanguage": "en-IN",',
    ...(date ? ['  "dateModified": "' + date + '",'] : []),
    '  "isPartOf": { "@type": "WebSite", "@id": "' + base + '#website" },',
    '  "speakable": {',
    '    "@type": "SpeakableSpecification",',
    '    "cssSelector": [' + selectors.join(", ") + "]",
    "  }",
    "}",
    "</script>",
    "",
  ].join("\n");
}

/**
 * Adds inLanguage / dateModified / isPartOf to an already-injected block.
 * Purely additive: existing keys and values are never rewritten, and a block
 * that already has all three is left untouched, so re-runs are no-ops.
 */
function upgradeBlock(html, date) {
  const i = html.indexOf(MARKER);
  if (i === -1) return null;
  const s = html.indexOf("<script", i);
  const e = html.indexOf("</script>", s);
  if (s === -1 || e === -1) return null;

  const block = html.slice(i, e);
  if (!/  "name":[^\n]*\n/.test(block)) return null;

  const urlM = block.match(/"url":\s*"([^"]*)"/);
  const base = urlM ? urlM[1].replace(/[^/]*$/, "") : "https://gift-ora.online/";

  const add = [];
  if (!/inLanguage/.test(block)) add.push('  "inLanguage": "en-IN",');
  if (!/dateModified/.test(block) && date) add.push('  "dateModified": "' + date + '",');
  if (!/isPartOf/.test(block)) {
    add.push('  "isPartOf": { "@type": "WebSite", "@id": "' + base + '#website" },');
  }
  if (!add.length) return null;

  return html.slice(0, i) + block.replace(/(  "name":[^\n]*\n)/, "$1" + add.join("\n") + "\n") + html.slice(e);
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].trim().replace(/&amp;/g, "&").replace(/"/g, '\\"') : "";
}

const DATES = gitDates();

/* Pass 1 — upgrade existing blocks in place (additive keys only). */
let upgraded = 0;
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const filePath = path.join(ROOT, f);
  let html = fs.readFileSync(filePath, "utf8");
  if (!html.includes(MARKER)) continue;
  const out = upgradeBlock(html, DATES.get(f));
  if (out === null) continue;
  fs.writeFileSync(filePath, out, "utf8");
  upgraded++;
}
console.log("WebPage blocks upgraded (inLanguage / dateModified / isPartOf): " + upgraded);

/* Pass 2 — inject into pages that have no block yet. */
for (const page of TARGETS) {
  const filePath = path.join(ROOT, page);
  if (!fs.existsSync(filePath)) {
    console.log("  SKIP (missing): " + page);
    continue;
  }
  let html = fs.readFileSync(filePath, "utf8");

  if (html.includes(MARKER)) {
    console.log("  SKIP (already has speakable): " + page);
    continue;
  }
  const anchor = html.includes(TARGET) ? TARGET : html.includes("</head>") ? "</head>" : null;
  if (!anchor) {
    console.log("  SKIP (no FAQ block or </head>): " + page);
    continue;
  }
  if (!/<title>/.test(html)) {
    console.log("  SKIP (no <title>): " + page);
    continue;
  }

  const url = "https://gift-ora.online/" + (page === "index.html" ? "" : page);
  const title = extractTitle(html);
  const block = buildBlock(page, url, title, DATES.get(page));
  if (anchor === TARGET) {
    html = html.replace(TARGET, block + "\n\n" + TARGET);
  } else {
    html = html.replace("</head>", block + "\n\n</head>");
  }

  fs.writeFileSync(filePath, html, "utf8");
  console.log("  added speakable: " + page);
}

console.log("Done.");