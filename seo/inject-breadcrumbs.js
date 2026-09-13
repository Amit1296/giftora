#!/usr/bin/env node
/**
 * inject-breadcrumbs.js — Adds BreadcrumbList JSON-LD to product pages,
 * built from each page's OWN visible breadcrumb nav (so the schema always
 * matches on-page content). Additive and idempotent:
 *
 *   node seo/inject-breadcrumbs.js
 *
 * Skips any page that already has the marker, and leaves every other
 * existing SEO/AEO/GEO markup untouched.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = '<!-- SITEWIDE-BREADCRUMB-SCHEMA -->';
const SITE = 'https://gift-ora.online';

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f));
}

function visibleText(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&rsaquo;|&raquo;/gi, ' ').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  const p = href.replace(/^\.\.\//, '').replace(/^\.\//, '');
  return SITE + '/' + (p === 'index.html' ? '' : p);
}

function buildBlock(items) {
  return MARKER + '\n<script type="application/ld+json">\n' +
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: it.url,
      })),
    }, null, 2) + '\n</script>';
}

let added = 0;
for (const filePath of [...files(path.join(ROOT, 'products')), ...files(ROOT).filter((p) => !/^products[\\/]/.test(path.relative(ROOT, p)))]) {
  if (path.basename(filePath).startsWith('product')) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes(MARKER)) continue;

  const nav = html.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/i);
  if (!nav) continue;

  const itemRe = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<span[^>]*>([\s\S]*?)<\/span>/g;
  const items = [];
  let m;
  let lastIsSpan = false;
  while ((m = itemRe.exec(nav[1])) !== null) {
    if (m[1] !== undefined) {
      const name = visibleText(m[2]);
      const url = absUrl(m[1]);
      if (!items.some((it) => it.url === url)) items.push({ name, url });
    } else {
      const name = visibleText(m[3]);
      if (name) { items.push({ name, url: SITE + '/' + path.basename(filePath) }); lastIsSpan = true; }
    }
  }

  if (items.length < 2) continue;

  const block = buildBlock(items);
  if (html.includes('</head>')) {
    html = html.replace('</head>', block + '\n\n</head>');
  } else {
    html += '\n' + block;
  }
  fs.writeFileSync(filePath, html, 'utf8');
  added++;
  console.log('  added breadcrumbs: ' + path.relative(ROOT, filePath) + ' [' + items.map((i) => i.name).join(' > ') + ']');
}

console.log('Done. Added to ' + added + ' page(s).');