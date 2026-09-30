#!/usr/bin/env node
/**
 * aio-baseline.js — Record exactly what the AEO/GEO work changed, so any later
 * ranking movement can be attributed instead of guessed at.
 *
 * The AEO session (07f3f14d, e4384a09, fb434ebe) was purely additive markup:
 * no body copy, title, meta description or keyword was altered. This script
 * writes that as a verifiable manifest rather than a claim in a commit message.
 *
 *   node seo/aio-baseline.js            # print the report
 *   node seo/aio-baseline.js --write    # (re)generate seo/aio-baseline.json
 *
 * Generated from the working tree, so it always describes what is actually
 * deployed rather than what was once intended.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'aio-baseline.json');
const WRITE = process.argv.includes('--write');

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

function has(h, re) { return re.test(h); }

const rows = pages.map((f) => {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const title = (h.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  const desc = (h.match(/<meta name="description" content="([\s\S]*?)"/i) || [, ''])[1].trim();
  return {
    file: f,
    title,
    titleLen: title.length,
    desc,
    descLen: desc.length,
    speakable: has(h, /SpeakableSpecification/),
    faqSchema: has(h, /"@type"\s*:\s*"FAQPage"/),
    howTo: has(h, /"@type"\s*:\s*"HowTo"/),
    inLanguage: has(h, /"inLanguage"/),
    dateModified: (h.match(/"dateModified"\s*:\s*"([\d-]+)"/) || [, ''])[1],
    isPartOf: has(h, /"isPartOf"/),
  };
});

const total = rows.length;
const cnt = (k) => rows.filter((r) => r[k]).length;
const speakableRows = rows.filter((r) => r.speakable);

function group(arr) {
  const m = new Map();
  arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return m;
}

/* Integrity checks. Scoped to indexable pages: admin, verification, preview
   and template scaffolding are not in the sitemap and must not be judged as
   if they were competing for a query. */
const NON_INDEXABLE = /^(admin|google[0-9a-f]+\.html|checkout-preview|banner-template|blog-template)/;
const live = rows.filter((r) => !NON_INDEXABLE.test(r.file));

const dupTitles = Object.entries(group(live.map((r) => r.title)))
  .filter(([, v]) => v > 1).map(([k]) => k);
const dupDescs = Object.entries(group(live.map((r) => r.desc)))
  .filter(([, v]) => v > 1).map(([k]) => k);

/* The 27 pages that gained Speakable in e4384a09, read from git so the list
   can never drift from what actually shipped. */
const ADDED_IN = 'e4384a09';
let clusterFiles = [];
try {
  const out = require('child_process')
    .execSync('git show --name-only --format= ' + ADDED_IN, { cwd: ROOT, encoding: 'utf8' });
  clusterFiles = out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.html'));
} catch (e) {
  console.log('  (could not read ' + ADDED_IN + ' from git; cluster list unavailable)');
}
const cluster = rows.filter((r) => clusterFiles.includes(r.file));

console.log('=== AEO/GEO baseline ===\n');
console.log('  total pages              :', total);
console.log('  Speakable                :', cnt('speakable'));
console.log('  FAQPage schema           :', cnt('faqSchema'));
console.log('  HowTo schema             :', cnt('howTo'));
console.log('  inLanguage               :', cnt('inLanguage'));
console.log('  isPartOf                 :', cnt('isPartOf'));
console.log('  dateModified present     :', rows.filter((r) => r.dateModified).length);
console.log('\n  the ' + cluster.length + ' pages that gained Speakable in ' + ADDED_IN + ':');
cluster.forEach((r) => console.log('    ' + (r.speakable ? 'ok  ' : 'MISS') + ' ' + r.file));

const badTitle = live.filter((r) => r.titleLen < 20 || r.titleLen > 70);
const badDesc = live.filter((r) => r.descLen < 70 || r.descLen > 175);

console.log('\n=== copy integrity (the ranking-scare indicators) ===');
console.log('  indexable pages checked  :', live.length, '(of ' + total + '; admin/verification/templates excluded)');
console.log('  duplicate titles         :', dupTitles.length);
console.log('  duplicate descriptions   :', dupDescs.length);
console.log('  titles outside 20-70ch   :', badTitle.length);
console.log('  descs outside 70-175ch   :', badDesc.length);
badTitle.forEach((r) => console.log('    ' + r.file + '  (' + r.titleLen + ')'));
badDesc.forEach((r) => console.log('    ' + r.file + '  (' + r.descLen + ')'));

console.log('\n=== Speakable selector resolution ===');
let unresolved = 0;
speakableRows.forEach((r) => {
  const h = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
  const css = (h.match(/"cssSelector"\s*:\s*"([^"]+)"/g) || [])
    .map((s) => s.match(/"([^"]+)"/)[1]);
  css.forEach((sel) => {
    const simple = sel.replace(/^#faq\s+/, '').replace(/^\./, '');
    if (!new RegExp('class="[^"]*\\b' + simple + '\\b').test(h) && !h.includes(sel.split(' ')[0])) {
      unresolved++;
      console.log('    UNRESOLVED ' + r.file + '  ' + sel);
    }
  });
});
console.log('  unresolved selectors     :', unresolved);

const manifest = {
  generatedFrom: 'working tree',
  totalPages: total,
  indexablePages: live.length,
  speakableAddedIn: ADDED_IN,
  speakableAdded: clusterFiles,
  speakablePages: speakableRows.length,
  faqSchemaPages: cnt('faqSchema'),
  howToPages: cnt('howTo'),
  clusterPages: cluster.map((r) => r.file),
  copyIntegrity: {
    duplicateTitles: dupTitles.length,
    duplicateDescriptions: dupDescs.length,
    titlesOutsideRange: badTitle.length,
    descriptionsOutsideRange: badDesc.length,
  },
  pages: rows.map((r) => ({
    file: r.file, titleLen: r.titleLen, descLen: r.descLen,
    speakable: r.speakable, faqSchema: r.faqSchema, howTo: r.howTo, dateModified: r.dateModified,
  })),
};

if (WRITE) {
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('\n  WRITTEN seo/aio-baseline.json');
} else {
  console.log('\n  (pass --write to save this manifest)');
}
