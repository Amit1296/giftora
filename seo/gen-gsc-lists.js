#!/usr/bin/env node
/**
 * seo/gen-gsc-lists.js — keeps the three Search Console work-lists in sync with
 * sitemap.xml.
 *
 *   node seo/gen-gsc-lists.js
 *
 * Writes (and only writes) these three files:
 *   - gsc-inspection-links.md        one click-through link per sitemap URL
 *   - .opencode/SEO-URL-BATCHES.md   the same URLs split into days of ~15
 *   - seo/url-inspection-list.txt    APPEND-ONLY: adds URLs missing from the
 *                                    tiered list, never edits or removes a line
 *
 * SAFETY: this script is the inverse of the danger-zone generators. It only
 * READS sitemap.xml and never writes sitemap.xml, robots.txt, server.js or any
 * page. Running it cannot deindex anything: the worst case is that a list gains
 * a URL that is still live. Every URL it emits comes from the live sitemap, so
 * no list can ever contain a URL the sitemap does not.
 *
 * Why it exists: the three lists had silently drifted to 226 / 169 / 332 URLs
 * while the sitemap had grown to 363, so 137 live pages were never requested
 * for indexing. Re-run this after any product/page addition.
 *
 * Safe to run repeatedly — a second run is a no-op.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const LIST = path.join(__dirname, 'url-inspection-list.txt');
const INSPECT_MD = path.join(ROOT, 'gsc-inspection-links.md');
const BATCHES_MD = path.join(ROOT, '.opencode', 'SEO-URL-BATCHES.md');
const RESOURCE = 'sc-domain%3Agift-ora.online';
const PER_DAY = 15;

const readSitemapUrls = () => {
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const unique = [...new Set(urls)];
  if (unique.length !== urls.length) {
    throw new Error(`sitemap.xml has duplicate <loc> entries (${urls.length} vs ${unique.length})`);
  }
  return unique;
};

const urls = readSitemapUrls();
if (!urls.length) throw new Error('sitemap.xml produced 0 URLs — refusing to write empty lists');

let changed = 0;

// ---------------------------------------------- 1. tiered inspection list
{
  const text = fs.readFileSync(LIST, 'utf8');
  const listed = new Set([...text.matchAll(/https:\/\/\S+/g)].map((m) => m[0]));
  const missing = urls.filter((u) => !listed.has(u));
  if (missing.length) {
    const tiers = [...text.matchAll(/^TIER\s+(\d+)/gim)].map((m) => Number(m[1]));
    const next = (tiers.length ? Math.max(...tiers) : 0) + 1;
    const block =
      `TIER ${next} - Product pages added after the previous list build (new; not yet requested)\n` +
      missing.join('\n') + '\n';
    fs.writeFileSync(LIST, text.replace(/\s*$/, '\n\n') + block + '\n', 'utf8');
    console.log(`  url-inspection-list.txt    +${missing.length} URLs (TIER ${next}) -> ${listed.size + missing.length}`);
    changed++;
  } else {
    console.log(`  url-inspection-list.txt    already complete (${listed.size} URLs)`);
  }
}

// ---------------------------------------------- 2. click-through inspect links
const b64 = (u) => Buffer.from('url=' + u, 'utf8').toString('base64').replace(/=+$/, '');
{
  const rows = urls.map((u) => {
    const label = u.replace('https://gift-ora.online/', '') || 'index.html (/)';
    return `| ${label} | https://search.google.com/search-console/inspect?resource_id=${RESOURCE}&id=${b64(u)} |`;
  });
  const md =
    '# Google Search Console - URL Inspections\n\n' +
    'Open (Google logged-in as **gift-ora.online** owner), click any link below to run URL Inspection, then hit **Request Indexing**.\n\n' +
    `Generated from \`sitemap.xml\` by \`seo/gen-gsc-lists.js\`: **${urls.length} URLs**. Re-run it after any sitemap change.\n\n` +
    '## One-shot tool link (paste any URL)\n\n' +
    `https://search.google.com/search-console/inspect?resource_id=${RESOURCE}\n\n` +
    `## Sitemap URLs (${urls.length})\n\n` +
    '| Page | Inspect |\n|---|---|\n' + rows.join('\n') + '\n';
  const before = fs.existsSync(INSPECT_MD) ? fs.readFileSync(INSPECT_MD, 'utf8') : '';
  if (before !== md) {
    fs.writeFileSync(INSPECT_MD, md, 'utf8');
    console.log(`  gsc-inspection-links.md    written (${urls.length} links)`);
    changed++;
  } else {
    console.log(`  gsc-inspection-links.md    up to date (${urls.length} links)`);
  }
}

// ---------------------------------------------- 3. daily batches
{
  const days = Math.ceil(urls.length / PER_DAY);
  let out =
    '# Google Search Console - Daily URL Inspection Batches\n\n' +
    `How to use: In GSC -> **URL Inspection** -> paste today's ${PER_DAY} URLs one by one, then **Request Indexing** on each.\n` +
    'One day per day. Re-run after any future sitemap change.\n\n' +
    `Generated from the live sitemap (\`sitemap.xml\` order, via \`seo/gen-gsc-lists.js\`): **${urls.length} URLs** (${days} days, ~${PER_DAY}/day).\n`;
  for (let d = 0; d < days; d++) {
    out += `\n## Day ${d + 1}\n` + urls.slice(d * PER_DAY, (d + 1) * PER_DAY).map((u) => '- ' + u).join('\n') + '\n';
  }
  const before = fs.existsSync(BATCHES_MD) ? fs.readFileSync(BATCHES_MD, 'utf8') : '';
  if (before !== out) {
    fs.writeFileSync(BATCHES_MD, out, 'utf8');
    console.log(`  .opencode/SEO-URL-BATCHES.md written (${urls.length} URLs / ${days} days)`);
    changed++;
  } else {
    console.log(`  .opencode/SEO-URL-BATCHES.md up to date (${urls.length} URLs / ${days} days)`);
  }
}

console.log(changed ? `\nDone — ${changed} file(s) updated.` : '\nDone — nothing to change.');
