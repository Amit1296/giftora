#!/usr/bin/env node
// Giftora city-page enrichment v2 (SAFE BY DEFAULT, additive-only).
// This is a NEW tool that coexists with the original past-work tool
// (seo/enrich-cities.js + seo/city-data.json) and does NOT modify it.
//
// Reads seo/city-copy.json. A page is edited ONLY when the city entry has
// "approved": true AND the human has confirmed the vendorCheck items.
//
// Safety guarantees:
//   - Only APPENDS inside the existing CITY-BLOCK/CITY-FAQ regions (new <p>
//     before <div class="city-areas">, new FAQ <details> before CITY-FAQ-END).
//   - Everything else on the page is preserved byte-for-byte. Title, canonical,
//     SEO-BLOCK, robots/noindex are never touched.
//   - Idempotent: once injected, guards are detected and the page is left alone
//     (no duplication, no unbounded growth, matches the file's EOL style).
//   - --regen removes the previously injected block and re-injects from JSON
//     (for editing draft copy after it has already been applied once).
//
// Flags:
//   node seo/inject-city-copy.js           -> applies approved cities
//   node seo/inject-city-copy.js --dry     -> print what WOULD change, save nothing
//   node seo/inject-city-copy.js --regen   -> force remove + re-inject from JSON
//   node seo/inject-city-copy.js --check   -> exit non-zero if approved page missing
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.GIFTORA_DIR || path.join(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'city-copy.json');
const PARAS_GUARD_START = '<!-- ENRICHED-CITY-PARAS-START -->';
const PARAS_GUARD_END = '<!-- ENRICHED-CITY-PARAS-END -->';
const FAQ_GUARD_START = '<!-- ENRICHED-CITY-FAQ-START -->';
const FAQ_GUARD_END = '<!-- ENRICHED-CITY-FAQ-END -->';
const CITY_FAQ_END = '<!-- CITY-FAQ-END -->';
const CITY_AREAS = '<div class="city-areas">';
const CITY_COPY = '<div class="city-copy">';

if (!fs.existsSync(DATA_FILE)) {
  console.error('city-copy.json not found:', DATA_FILE);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const flags = new Set(process.argv.slice(2));
const dry = flags.has('--dry');
const regen = flags.has('--regen');
const check = flags.has('--check');

const cities = Object.keys(data.cities);
const approved = cities.filter((slug) => data.cities[slug].approved === true);

if (check) {
  const missing = approved.filter((slug) => !fs.existsSync(path.join(ROOT, `gift-delivery-${slug}.html`)));
  if (missing.length) {
    console.error('CHECK FAIL: approved city page missing:', missing.join(', '));
    process.exit(1);
  }
  console.log(`CHECK OK: ${approved.length} approved city/ies, all page files present.`);
  process.exit(0);
}

if (!approved.length) {
  console.log('Draft mode: no approved cities in seo/city-copy.json. Nothing was edited.');
  console.log('When vendors confirm delivery specifics, set "approved": true per city and re-run.');
  process.exit(0);
}

function eolOf(html) {
  return html.includes('\r\n') ? '\r\n' : '\n';
}

// Remove an injected guard block by exact line-splice (deterministic).
function spliceBlock(html, guardStart, guardEnd, eol) {
  const s = html.indexOf(guardStart);
  if (s === -1) return html;
  const e = html.indexOf(guardEnd);
  if (e === -1) return html;
  const lineStart = html.lastIndexOf(eol, s);
  const lineEnd = html.indexOf(eol, e);
  const cutStart = lineStart === -1 ? 0 : lineStart + eol.length;
  const cutEnd = lineEnd === -1 ? html.length : lineEnd + eol.length;
  return html.slice(0, cutStart) + html.slice(cutEnd);
}

const changed = [];
const skipped = [];

for (const slug of approved) {
  const file = path.join(ROOT, `gift-delivery-${slug}.html`);
  if (!fs.existsSync(file)) {
    skipped.push(`${slug}: page file missing`);
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const eol = eolOf(html);
  const entry = data.cities[slug];

  if (!html.includes(CITY_FAQ_END) || !html.includes(CITY_COPY) || !html.includes(CITY_AREAS)) {
    skipped.push(`${slug}: required markers not found, left untouched`);
    continue;
  }

  const T4 = '\t\t\t\t';

  // --- 1. unique paragraphs inside city-copy (before city-areas) ---
  const paras = entry.addParagraphs || [];
  const parasBlock = `${PARAS_GUARD_START}${eol}${paras.map((p) => `${T4}<p>${p}</p>`).join(eol)}${eol}${T4}${PARAS_GUARD_END}${eol}${T4}`;

  if (html.includes(PARAS_GUARD_START)) {
    html = regen ? spliceBlock(html, PARAS_GUARD_START, PARAS_GUARD_END, eol) : html;
    if (regen && paras.length) {
      html = html.replace(CITY_AREAS, `${parasBlock}${CITY_AREAS}`);
    }
  } else if (paras.length) {
    html = html.replace(CITY_AREAS, `${parasBlock}${CITY_AREAS}`);
  }

  // --- 2. unique FAQ items before CITY-FAQ-END ---
  const faqs = entry.addFaq || [];
  const faqRows = faqs.map(
    (f) => `${T4}<details class="faq-item">${eol}${T4}\t<summary>${f.q}</summary>${eol}${T4}\t<p>${f.a}</p>${eol}${T4}</details>`
  );
  const faqBlock = `${FAQ_GUARD_START}${eol}${faqRows.join(eol)}${eol}${T4}${FAQ_GUARD_END}${eol}${T4}`;

  if (html.includes(FAQ_GUARD_START)) {
    html = regen ? spliceBlock(html, FAQ_GUARD_START, FAQ_GUARD_END, eol) : html;
    if (regen && faqs.length) {
      html = html.replace(CITY_FAQ_END, `${faqBlock}${CITY_FAQ_END}`);
    }
  } else if (faqs.length) {
    html = html.replace(CITY_FAQ_END, `${faqBlock}${CITY_FAQ_END}`);
  }

  if (html === before) {
    skipped.push(`${slug}: already injected / nothing to do`);
    continue;
  }

  if (!dry) fs.writeFileSync(file, html, 'utf8');
  changed.push(slug);
}

if (dry) {
  console.log('DRY RUN (no files saved).');
}
console.log(`Edited (${dry ? 'would edit' : 'edited'}): ${changed.length ? changed.join(', ') : 'none'}`);
if (skipped.length) console.log(`Skipped: ${skipped.join('; ')}`);
console.log('Next: run `node seo/check-schema.js` (expect exit 0) and re-run `node seo/apply-seo.js` to refresh sitemap lastmod.');