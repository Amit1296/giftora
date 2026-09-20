#!/usr/bin/env node
// Giftora city-page de-duplication.
//
// Problem: the second paragraph inside every <div class="city-copy"> block is the
// same templated SLA line ("CITY falls under our express delivery network - most
// orders reach CITY within within 48 hours of checkout..."), duplicated across
// all ~84 city pages. Google sees near-identical body copy and the templating also
// ships grammar bugs ("within within").
//
// What this tool does:
//   - Replaces ONLY the last <p> inside .city-copy with a per-city paragraph that
//     references areas from that page's OWN .area-chips chips and that page's OWN
//     delivery window / network wording. No new claims about coverage, prices or
//     timing are introduced (same discipline as seo/inject-city-copy.js).
//   - Wraps the new paragraph in guard comments so reruns are idempotent.
//   - Preserves everything else byte-for-byte: title, canonical, SEO-BLOCK, FAQ
//     region, EOL style and UTF-8 BOM.
//
// Flags:
//   node seo/dedup-city-copy.js          -> apply to all city pages
//   node seo/dedup-city-copy.js --dry     -> print what WOULD change, save nothing
//   node seo/dedup-city-copy.js --regen   -> force remove + re-inject from page data
//   node seo/dedup-city-copy.js --check   -> exit non-zero if any page has no dedup guard
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.GIFTORA_DIR || path.join(__dirname, '..');
const GUARD_START = '<!-- CITY-DEDUP-START -->';
const GUARD_END = '<!-- CITY-DEDUP-END -->';
const SLA_GUARD_PREFIX = '<!-- CITY-DEDUP-SLA: ';
const CITY_COPY = '<div class="city-copy">';
const CITY_AREAS = '<div class="city-areas">';
const CHIPS_DIV = '<div class="area-chips">';

const flags = new Set(process.argv.slice(2));
const dry = flags.has('--dry');
const regen = flags.has('--regen');
const check = flags.has('--check');

const pages = fs
  .readdirSync(ROOT)
  .filter((f) => /^gift-delivery-[a-z-]+\.html$/.test(f) && f !== 'gift-delivery-india.html')
  .sort();

function eolOf(html) {
  return html.includes('\r\n') ? '\r\n' : '\n';
}

function extractChips(html) {
  const start = html.indexOf(CHIPS_DIV);
  if (start === -1) return [];
  const end = html.indexOf('</div>', start);
  if (end === -1) return [];
  const inner = html.slice(start + CHIPS_DIV.length, end);
  const chips = [];
  const re = /<span>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(inner))) chips.push(m[1].replace(/&amp;/g, '&').trim());
  return chips.filter(Boolean);
}

// Read facts we are allowed to restate from either the original templated
// paragraph or the generated paragraph: network kind + delivery window.
// Returns null if the paragraph is not one of the known forms (we never guess).
function parseSla(p) {
  const windowMatch = /within\s+(?:within\s+)?([\d]+(?:\u2013|-)[\d]+ hours|[\d]+ hours)/.exec(p);
  const before5 = /before 5 PM/i.test(p);
  const sameDay =
    /same-day delivery network|Same-day hand delivery is available|hand-delivered across\s+[\s\S]*?\s+the same day|reaches your loved one today/i.test(p);
  if (!sameDay && !windowMatch) return null;
  return { kind: sameDay ? 'same-day' : 'express', before5, window: sameDay ? null : windowMatch[1] };
}

function buildParagraph(city, chips, sla) {
  const first = chips[0];
  const last = chips[chips.length - 1];
  if (sla.kind === 'same-day') {
    if (sla.before5) {
      return `Orders placed before 5 PM are hand-delivered across ${city} the same day — from ${first || city} to ${last || 'nearby areas'} — carefully packed with a personalised note included.`;
    }
    return `An order placed today reaches your loved one today anywhere from ${first || city} to ${last || 'nearby areas'}, hand-delivered with a personalised note included.`;
  }
  return `From ${first || city} to ${last || 'nearby areas'}, ${city} parcels travel on our express line and are typically delivered within ${sla.window} of checkout, carefully packed and tracked end to end.`;
}

function spliceOutBlock(html) {
  const s = html.indexOf(GUARD_START);
  const e = html.indexOf(GUARD_END);
  if (s === -1 || e === -1) return html;
  const eol = eolOf(html);
  const end = e + GUARD_END.length;
  const lineEnd = html.indexOf(eol, end);
  const blockEnd = lineEnd === -1 ? html.length : lineEnd + eol.length;
  const lineStart = html.lastIndexOf(eol, s);
  const blockStart = lineStart === -1 ? 0 : lineStart + eol.length;
  return html.slice(0, blockStart) + html.slice(blockEnd);
}

// Position/index helpers for the city-copy region.
function regionInfo(html) {
  const copyStart = html.indexOf(CITY_COPY);
  const areasStart = html.indexOf(CITY_AREAS);
  if (copyStart === -1 || areasStart === -1 || areasStart < copyStart) return null;
  const regionEnd = html.lastIndexOf('</div>', areasStart);
  if (regionEnd === -1) return null;
  return { copyInnerStart: copyStart + CITY_COPY.length, regionEnd };
}

function lastParagraphPos(html, regionEnd) {
  let lastIndex = -1;
  let idx = -1;
  while ((idx = html.indexOf('<p>', idx + 1)) !== -1 && idx < regionEnd) lastIndex = idx;
  return lastIndex;
}

const changed = [];
const skipped = [];

for (const file of pages) {
  const full = path.join(ROOT, file);
  const buf = fs.readFileSync(full);
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let html = buf.toString('utf8');
  if (html.charCodeAt(0) === 0xfeff) html = html.slice(1);
  const before = html;
  const eol = eolOf(html);

  const info = regionInfo(html);
  if (!info) {
    skipped.push(`${file}: city-copy/city-areas markers not found`);
    continue;
  }
  const { copyInnerStart, regionEnd } = info;
  const region = html.slice(copyInnerStart, regionEnd);

  const hadGuard = region.indexOf(GUARD_START) !== -1;
  let oldSla = null;

  if (hadGuard) {
    if (!regen) {
      continue;
    }
    // Persisted SLA facts live in a machine-readable comment beside the guard.
    const m = /<!-- CITY-DEDUP-SLA: (express|same-day);([^;]*);([01]) -->/.exec(html);
    if (m) {
      oldSla = { kind: m[1], window: m[2] || null, before5: m[3] === '1' };
    } else {
      // Legacy injected blocks (pre-SLA-comment) still carry the facts in the
      // generated paragraph itself - parse and persist them.
      const gm = new RegExp(`${GUARD_START}[\\s\\S]*?(<p>[\\s\\S]*?</p>)[\\s\\S]*?${GUARD_END}`).exec(html);
      if (gm) oldSla = parseSla(gm[1].replace(/<\/?p>/g, '').trim());
    }
    if (!oldSla) {
      skipped.push(`${file}: regen found no persisted SLA facts`);
      continue;
    }
    html = spliceOutBlock(html);
  } else {
    // Normal apply: only rewrite when the current last paragraph is a known SLA
    // template. Never guess.
    const lastIndex = lastParagraphPos(html, regionEnd);
    if (lastIndex === -1) {
      skipped.push(`${file}: no paragraph found in city-copy`);
      continue;
    }
    const pEnd = html.indexOf('</p>', lastIndex) + '</p>'.length;
    if (pEnd === -1) {
      skipped.push(`${file}: malformed paragraph`);
      continue;
    }
    const pText = /<p>([\s\S]*?)<\/p>/.exec(html.slice(lastIndex, pEnd));
    if (!pText || !pText[1]) {
      skipped.push(`${file}: empty paragraph`);
      continue;
    }
    oldSla = parseSla(pText[1].trim());
    if (!oldSla) {
      skipped.push(`${file}: unrecognized paragraph, left untouched`);
      continue;
    }
  }

  // Determine insertion point + indentation prefix after any splice.
  const info2 = regionInfo(html);
  if (!info2) {
    skipped.push(`${file}: region vanished`);
    continue;
  }
  const lastIndex = lastParagraphPos(html, info2.regionEnd);
  if (lastIndex === -1) {
    skipped.push(`${file}: no paragraph found after edit`);
    continue;
  }
  const eolBefore = html.lastIndexOf(eol, lastIndex);
  const prefix = eolBefore === -1 ? '' : html.slice(eolBefore + eol.length, lastIndex);
  const pEnd = html.indexOf('</p>', lastIndex) + '</p>'.length;
  if (pEnd === -1) {
    skipped.push(`${file}: malformed paragraph`);
    continue;
  }

  const cityMatch = /Areas we cover in ([^<]+)</.exec(html);
  if (!cityMatch) {
    skipped.push(`${file}: could not read city name`);
    continue;
  }
  const city = cityMatch[1].trim();
  const chips = extractChips(html);

  // Recover the SLA facts: from the replaced template, or reuse the one persisted
  // in the guard comment (regen path).
  let sla = oldSla;
  if (!sla) {
    skipped.push(`${file}: no SLA facts available`);
    continue;
  }

  const newPara = buildParagraph(city, chips, sla);
  const slaLine = `${SLA_GUARD_PREFIX}${sla.kind};${sla.window || ''};${sla.before5 ? 1 : 0} -->`;
  const block =
    `${GUARD_START}${eol}${prefix}${slaLine}${eol}${prefix}<p>${newPara}</p>${eol}${prefix}${GUARD_END}`;

  const tail = html.slice(pEnd);
  // Regen: the target paragraph was already spliced out -> insert after the
  // remaining last paragraph. Normal: replace the old template paragraph.
  const newHtml = hadGuard
    ? html.slice(0, pEnd) + eol + block + tail
    : html.slice(0, lastIndex) + block + tail;

  if (newHtml === before) {
    skipped.push(`${file}: no change`);
    continue;
  }
  if (!dry) {
    const out = Buffer.from(newHtml, 'utf8');
    fs.writeFileSync(full, bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), out]) : out);
  }
  changed.push(file);
}

if (check) {
  const missing = pages.filter((f) => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes(GUARD_START));
  if (missing.length) {
    console.error(`CHECK FAIL: ${missing.length} page(s) missing dedup guard: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`CHECK OK: all ${pages.length} city pages carry the dedup guard.`);
  process.exit(0);
}

if (dry) console.log('DRY RUN (no files saved).');
console.log(`Edited (${dry ? 'would edit' : 'edited'}): ${changed.length ? changed.join(', ') : 'none'}`);
if (skipped.length) console.log(`Skipped: ${skipped.join('; ')}`);
console.log('Verify with `node seo/check-schema.js` and `node seo/dedup-city-copy.js --check`.');