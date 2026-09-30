#!/usr/bin/env node
/**
 * keyword-report.js — Human-readable view of keyword-proposal.json.
 * Read-only. Writes nothing but a text report.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo/keyword-proposal.json'), 'utf8'));

const sum = (a) => a.reduce((s, x) => s + (x.keywords ? x.keywords.length : 0), 0);
const L = [];
const p = (s) => L.push(s);

p('=== Giftora keyword proposal (NOT APPLIED) ===');
p('');
p('  source        : ' + d.generatedFrom);
p('  generated     : ' + d.generatedAt);
p('  already live  : ' + d.existingKeywordCount + ' sitewide (all excluded from proposals)');
p('  NEW proposed  : ' + (sum(d.cities) + sum(d.products) + sum(d.clusters)));
p('');
p('  city pages    : ' + d.cities.length + ' pages, ' + sum(d.cities) + ' keywords');
p('  product pages : ' + d.products.length + ' pages, ' + sum(d.products) + ' keywords');
p('  clusters      : ' + d.clusters.length + ', ' + sum(d.clusters) + ' keywords');
p('');
p('  Every term is a real Google autosuggest response for India, filtered to one');
p('  owning page. Nothing has been written to any HTML page.');
p('');
p('');
p('########## CITY PAGES (top 10 by volume of new terms) ##########');
const cs = [...d.cities].sort((a, b) => b.keywords.length - a.keywords.length);
cs.slice(0, 10).forEach((c) => {
  p('');
  p('--- ' + c.file + '  [' + c.name + ', ' + c.state + ']  +' + c.keywords.length);
  c.keywords.forEach((k) => p('      ' + k.keyword + (k.routedFrom ? '   [from ' + k.routedFrom + ']' : '')));
});
p('');
p('  ... plus ' + Math.max(0, cs.length - 10) + ' more city pages (full list in keyword-proposal.json)');
p('');
p('');
p('########## CLUSTERS ##########');
d.clusters.forEach((c) => {
  p('');
  p('--- ' + c.cluster + '  -> owner ' + c.owner + '  +' + c.keywords.length);
  c.keywords.forEach((k) => p('      ' + k.keyword));
});
p('');
p('');
p('########## PRODUCT PAGES (all, with counts) ##########');
const ps = [...d.products].sort((a, b) => b.keywords.length - a.keywords.length);
p('');
p('  pages gaining 3+ new terms: ' + ps.filter((x) => x.keywords.length >= 3).length);
p('  pages gaining 1-2 terms  : ' + ps.filter((x) => x.keywords.length >= 1 && x.keywords.length < 3).length);
p('  pages with none          : ' + ps.filter((x) => x.keywords.length === 0).length);
p('');
ps.filter((x) => x.keywords.length > 0).forEach((x) => {
  p('--- ' + x.file + '  [' + x.category + ', Rs ' + x.price + ']  +' + x.keywords.length);
  x.keywords.forEach((k) => p('      ' + k.keyword));
});

const out = path.join(ROOT, 'seo/keyword-proposal.txt');
fs.writeFileSync(out, L.join('\n'), 'utf8');
console.log(L.slice(0, 14).join('\n'));
console.log('\n  full report: seo/keyword-proposal.txt');
console.log('  data:       seo/keyword-proposal.json');