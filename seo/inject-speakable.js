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

const ROOT = path.resolve(__dirname, "..");
const MARKER = "<!-- SITEWIDE-SPEAKABLE-SCHEMA -->";
const TARGET = "<!-- SITEWIDE-FAQ-SCHEMA -->";

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
  "plants.html",
  "send-gifts-to-india.html",
  "shoes.html",
  "special-offers.html",
  "sunglasses.html",
  "teachers-day-gifts.html",
  "teddy.html",
  "toys.html",
]);

function buildBlock(page, url, title) {
  const selectors = CATEGORY_PAGES.has(page) || /^gift-delivery-[a-z0-9-]+\.html$/.test(page)
    ? CSS_CATEGORY
    : page === "index.html" ? CSS_HOME : CSS_BLOG;
  return [
    MARKER,
    '<script type="application/ld+json">',
    "{",
    '  "@context": "https://schema.org",',
    '  "@type": "WebPage",',
    '  "@id": "' + url + '#speakable",',
    '  "url": "' + url + '",',
    '  "name": "' + title + '",',
    '  "speakable": {',
    '    "@type": "SpeakableSpecification",',
    '    "cssSelector": [' + selectors.join(", ") + "]",
    "  }",
    "}",
    "</script>",
    "",
  ].join("\n");
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].trim().replace(/&amp;/g, "&").replace(/"/g, '\\"') : "";
}

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
  const block = buildBlock(page, url, title);
  if (anchor === TARGET) {
    html = html.replace(TARGET, block + "\n\n" + TARGET);
  } else {
    html = html.replace("</head>", block + "\n\n</head>");
  }

  fs.writeFileSync(filePath, html, "utf8");
  console.log("  added speakable: " + page);
}

console.log("Done.");