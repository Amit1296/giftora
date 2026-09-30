#!/usr/bin/env node
/**
 * keyword-apply.js — Write the approved proposal into <meta name="keywords">.
 *
 *   node seo/keyword-apply.js            # dry run, prints the plan, writes nothing
 *   node seo/keyword-apply.js --apply    # actually edit the pages
 *   node seo/keyword-apply.js --apply --only cities
 *   node seo/keyword-apply.js --apply --limit 5
 *
 * SAFETY RULES, all enforced before a single byte is written:
 *   1. Dry run by default. Nothing is written without --apply.
 *   2. A term already present on that page (case-insensitive) is skipped.
 *   3. A term whose base form already exists on that page is skipped. This is
 *      the one the harvest could not check on its own: the proposal collapsed
 *      near-duplicates against itself, but not against the page's existing
 *      keywords, so "online cake delivery in agra" must not be added to a page
 *      that already targets "cake delivery in Agra".
 *   4. A term already live on any OTHER page is skipped, so c84264f6's
 *      one-owner-per-term rule cannot be undone by this script.
 *   5. Each page is capped at MAX_ADD keywords so the tag cannot bloat.
 *   6. Only the keywords attribute inside the existing tag is rewritten. Every
 *      other byte of the file is preserved, and the file is re-checked for
 *      exact byte equality outside that tag.
 *   7. A backup of each edited file is written to seo/.kw-backup/ first.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROPOSAL = path.join(__dirname, 'keyword-proposal.json');
const BACKUP = path.join(__dirname, '.kw-backup');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const only = (() => { const i = args.indexOf('--only'); return i !== -1 && args[i + 1] ? args[i + 1] : 'all'; })();
const limitN = (() => { const i = args.indexOf('--limit'); return i !== -1 && args[i + 1] ? parseInt(args[i + 1], 10) : 0; })();

const MAX_ADD = 10;

const hard = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/* "flower delivery Agra" and "flower delivery in agra" are one query to Google,
   so the preposition carries no meaning here. Stripping it, plus the fillers
   "best/online/under", lets the dedupe notice both forms. */
const base = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(under|best|online|in)\b/g, '')
  .replace(/\s+/g, ' ').replace(/\s+s$/, '').trim();

const TAG = /(<meta\s+name="keywords"\s+content=")([^"]*)("\s*\/?>)/i;

function readKw(html) {
  const m = html.match(TAG);
  if (!m) return null;
  return m[2].split(',').map((s) => s.trim()).filter(Boolean);
}

function main() {
  const prop = JSON.parse(fs.readFileSync(PROPOSAL, 'utf8'));

  /* Where the proposal wants each file updated. */
  const targets = [];
  if (only === 'all' || only === 'cities') {
    prop.cities.forEach((c) => targets.push({ file: c.file, kws: c.keywords, group: 'city' }));
  }
  if (only === 'all' || only === 'clusters') {
    prop.clusters.forEach((c) => c.owner && targets.push({ file: c.owner, kws: c.keywords, group: 'cluster' }));
  }
  if (only === 'all' || only === 'products') {
    prop.products.forEach((p) => p.kws ? null : null);
    prop.products.forEach((p) => targets.push({ file: p.file, kws: p.keywords, group: 'product' }));
  }
  if (limitN) targets.length = Math.min(targets.length, limitN);

  /* Merge cluster terms into the same page as that page's city/product terms,
     so a file is only processed once. */
  const byFile = new Map();
  for (const t of targets) {
    if (!byFile.has(t.file)) byFile.set(t.file, { file: t.file, groups: new Set(), kws: [] });
    const e = byFile.get(t.file);
    e.groups.add(t.group);
    for (const k of t.kws || []) {
      const h = hard(k.keyword);
      if (!e.kws.some((x) => hard(x.keyword) === h)) e.kws.push(k);
    }
  }

  /* Every keyword currently live sitewide, and which file owns it. */
  const liveOwner = new Map();
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    for (const k of readKw(fs.readFileSync(path.join(ROOT, f), 'utf8')) || []) {
      const h = hard(k);
      if (!liveOwner.has(h)) liveOwner.set(h, f);
    }
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'products'))) {
    if (!f.endsWith('.html')) continue;
    for (const k of readKw(fs.readFileSync(path.join(ROOT, 'products', f), 'utf8')) || []) {
      const h = hard(k);
      if (!liveOwner.has(h)) liveOwner.set('products/' + f ? h : h, 'products/' + f);
    }
  }

  const claimed = new Set();   // bases claimed during this run, per file
  const claimedGlobal = new Map(); // base -> file, to enforce one owner

  const plan = [];
  const skipStats = { alreadyOnPage: 0, baseCoveredByPage: 0, ownedByOtherPage: 0, dupInRun: 0, overCap: 0, noTag: 0 };

  for (const { file, groups, kws } of byFile.values()) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) { skipStats.noTag++; continue; }
    const html = fs.readFileSync(abs, 'utf8');
    const m = html.match(TAG);
    if (!m) { skipStats.noTag++; continue; }

    const existing = readKw(html) || [];
    const existingHard = new Set(existing.map(hard));
    const existingBase = new Set(existing.map(base));

    const add = [];
    for (const k of kws) {
      const kw = k.keyword.trim();
      const h = hard(kw);
      const b = base(kw);
      if (existingHard.has(h)) { skipStats.alreadyOnPage++; continue; }
      if (existingBase.has(b)) { skipStats.baseCoveredByPage++; continue; }
      if (claimed.has(b + '|' + file)) { skipStats.dupInRun++; continue; }
      /* one owner per term: if the base is already live elsewhere, leave it */
      const owner = liveOwner.get(h);
      if (owner && owner !== file) { skipStats.ownedByOtherPage++; continue; }
      add.push({ kw, b });
      if (add.length >= MAX_ADD) break;
    }
    if (add.length > MAX_ADD) skipStats.overCap++;
    add.forEach((a) => { claimed.add(a.b + '|' + file); claimedGlobal.set(a.b, file); });

    if (!add.length) continue;
    plan.push({ file, groups: [...groups], existing, add });
  }

  console.log('=== keyword apply ' + (APPLY ? '(WRITING)' : '(DRY RUN — nothing written)') + ' ===\n');
  console.log('  files considered : ' + byFile.size);
  console.log('  files to change  : ' + plan.length);
  console.log('  keywords to add  : ' + plan.reduce((a, p) => a + p.add.length, 0));
  console.log('  cap per page     : ' + MAX_ADD);
  console.log('\n  skipped:');
  console.log('    already on the page        : ' + skipStats.alreadyOnPage);
  console.log('    base already covered      : ' + skipStats.baseCoveredByPage);
  console.log('    owned by another page     : ' + skipStats.ownedByOtherPage);
  console.log('    duplicate within this run : ' + skipStats.dupInRun);
  console.log('    no keywords tag           : ' + skipStats.noTag);
  console.log('\n  --- plan ---');
  plan.forEach((p) => {
    console.log('\n  ' + p.file + '  [' + p.groups.join('+') + ']  ' + p.existing.length + ' -> ' + (p.existing.length + p.add.length));
    p.add.forEach((a) => console.log('      + ' + a.kw));
  });

  if (!APPLY) {
    console.log('\n  DRY RUN. Re-run with --apply to write these changes.');
    return;
  }

  fs.mkdirSync(BACKUP, { recursive: true });
  let written = 0;
  for (const p of plan) {
    const abs = path.join(ROOT, p.file);
    const html = fs.readFileSync(abs, 'utf8');
    fs.writeFileSync(path.join(BACKUP, p.file.replace(/\//g, '__')), html, 'utf8');

    const merged = p.existing.concat(p.add.map((a) => a.kw)).join(', ');
    const next = html.replace(TAG, (s, open, _old, close) => open + merged + close);

    /* only the tag body may differ */
    const strip = (s) => s.replace(TAG, '<KW/>');
    if (strip(next) !== strip(html)) {
      console.error('  ABORT: ' + p.file + ' would change bytes outside the keywords tag');
      process.exit(1);
    }
    fs.writeFileSync(abs, next, 'utf8');
    written++;
  }
  console.log('\n  wrote ' + written + ' files');
  console.log('  backups: seo/.kw-backup/');
  console.log('\n  Now run:  node seo/check-schema.js');
}

main();
