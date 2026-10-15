#!/usr/bin/env node
/**
 * seo/check-indexing.js - Giftora indexing monitor.
 *
 * Answers one question: which of our priority URLs are actually indexed yet,
 * and are they still technically indexable? It is the follow-up to the
 * deploy in e2357ea1 (crawler-visible product links + deeper priority pages).
 *
 *   node seo/check-indexing.js            # tiers 1-3 (the pages that matter)
 *   node seo/check-indexing.js --all      # every URL in the list
 *   node seo/check-indexing.js --tier 2   # one tier only
 *
 * It always runs a live technical preflight (HTTP status, self-canonical,
 * no noindex, present in sitemap.xml, has crawler-visible product links).
 *
 * If Search Console credentials exist it ALSO asks Google directly, via the
 * URL Inspection API, whether each URL is indexed. Without them it prints the
 * same one-time setup as seo/track.js and reports the preflight only.
 *
 *   creds: seo/gsc-service-account.json   (see seo/track.js header; gitignored)
 *
 * A ledger is written to artifacts/indexing-status.json (gitignored) so you can
 * diff runs and see progress over days.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const LIST = path.join(__dirname, 'url-inspection-list.txt');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const KEYFILE = path.join(__dirname, 'gsc-service-account.json');
const LEDGER = path.join(ROOT, 'artifacts', 'indexing-status.json');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const TIER = val('--tier', null);
const ALL = flag('--all');
const SITE = val('--site', 'sc-domain:gift-ora.online');
const UA = 'Mozilla/5.0 (compatible; GiftoraIndexMonitor/1.0; +https://gift-ora.online/)';
const THROTTLE_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- url list

function loadList() {
  if (!fs.existsSync(LIST)) throw new Error('Missing ' + LIST);
  const tiers = [];
  let cur = null;
  for (const raw of fs.readFileSync(LIST, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    const t = line.match(/^TIER\s+(\d+)/i);
    if (t) { cur = { tier: Number(t[1]), title: line.replace(/\s*-\s*$/, ''), urls: [] }; tiers.push(cur); continue; }
    if (/^https?:\/\//i.test(line)) {
      if (!cur) { cur = { tier: 0, title: 'Untitled', urls: [] }; tiers.push(cur); }
      cur.urls.push(line);
    }
  }
  return tiers;
}

function loadSitemap() {
  if (!fs.existsSync(SITEMAP)) return new Set();
  const set = new Set();
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  while ((m = re.exec(xml))) set.add(m[1].trim());
  return set;
}

// ---------------------------------------------------------------- live fetch

function fetchUrl(url, method) {
  return new Promise((resolve) => {
    const req = https.request(url, { method, headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 20000 }, (res) => {
      let body = '';
      if (method !== 'HEAD') res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 500000) body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body, location: res.headers.location }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end();
  });
}

async function fetchWithRetry(url) {
  let r = await fetchUrl(url, 'GET');
  if (r.status === 403 || r.status === 429 || r.status === 0) {
    await sleep(1200);
    r = await fetchUrl(url, 'GET');
  }
  return r;
}

function analyse(url, res, sitemap) {
  const out = { url, http: res.status, live: res.status === 200, checks: {} };
  if (!res.body) return out;
  const h = res.body;
  const can = (h.match(/rel="canonical"\s+href="([^"]+)"/i) || [])[1] || null;
  const robM = h.match(/<meta[^>]*name="robots"[^>]*content="([^"]*)"/i);
  const rob = robM ? robM[1] : '';
  out.canonical = can;
  out.robots = rob || '(none)';
  out.checks.selfCanonical = can ? can.replace(/\/$/, '') === url.replace(/\/$/, '') : false;
  out.checks.noNoindex = !/noindex/i.test(rob);
  out.checks.inSitemap = sitemap.has(url);
  out.checks.hasStaticLinks = /<ul class="static-product-links"/.test(h);
  out.checks.productLinks = (h.match(/href="products\//g) || []).length;
  return out;
}

// ---------------------------------------------------------------- gsc token

function b64url(b) { return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

function token(key) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
      iss: key.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600,
    }));
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(head + '.' + claim);
    const jwt = head + '.' + claim + '.' + b64url(sign.sign(key.private_key));
    const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt;
    const req = https.request(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error(d)); }
        catch (e) { reject(new Error(d)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function inspect(tok, url) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'en-US' });
    const req = https.request(INSPECT_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const r = (j.inspectionResult && j.inspectionResult.indexStatusResult) || {};
          resolve({ verdict: r.verdict || null, coverage: r.coverageState || null, googleCanonical: r.googleCanonical || null, pageFetch: r.pageFetchState || null, error: j.error ? j.error.message : null });
        } catch (e) { resolve({ error: d.slice(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------- main

async function main() {
  const tiers = loadList();
  const sitemap = loadSitemap();

  let plan = tiers;
  if (TIER) plan = tiers.filter((t) => t.tier === Number(TIER));
  else if (!ALL) plan = tiers.filter((t) => t.tier >= 1 && t.tier <= 3);

  const urls = plan.flatMap((t) => t.urls);
  console.log('=== Giftora indexing monitor ===\n');
  console.log('Source: seo/url-inspection-list.txt');
  console.log('Tiers: ' + plan.map((t) => t.tier).join(', ') + '   URLs: ' + urls.length);
  console.log('Sitemap entries: ' + sitemap.size);

  const key = fs.existsSync(KEYFILE) ? JSON.parse(fs.readFileSync(KEYFILE, 'utf8')) : null;
  let tok = null;
  if (key) {
    console.log('GSC creds: found - will query the URL Inspection API');
    try { tok = await token(key); } catch (e) { console.log('  token failed: ' + e.message + ' (continuing with preflight only)'); tok = null; }
  } else {
    console.log('GSC creds: not set up - preflight only (see seo/track.js header for the 10-min setup)');
  }
  console.log('');

  const results = [];
  let i = 0;
  for (const tier of plan) {
    console.log('--- TIER ' + tier.tier + ' - ' + tier.urls.length + ' urls ---');
    for (const url of tier.urls) {
      i++;
      process.stdout.write(String(i).padStart(3) + '/' + urls.length + '  ' + url.replace('https://gift-ora.online/', '') + '  ');
      const res = await fetchWithRetry(url);
      const a = analyse(url, res, sitemap);
      a.tier = tier.tier;
      if (tok && a.live) { a.gsc = await inspect(tok, url); }
      results.push(a);
      const bits = [
        'HTTP ' + a.http,
        a.checks.selfCanonical ? 'canon-self' : 'CANON?' ,
        a.checks.noNoindex ? 'noindex=no' : 'NOINDEX!!',
        a.checks.inSitemap ? 'sitemap=yes' : 'SITEMAP=NO',
        'links=' + (a.checks.productLinks || 0),
      ];
      if (a.gsc) bits.push('gsc=' + (a.gsc.coverage || a.gsc.error || '?'));
      console.log(bits.join('  '));
      await sleep(THROTTLE_MS);
    }
    console.log('');
  }

  const ok = (f) => results.filter((r) => r.checks[f]).length;
  console.log('=== SUMMARY ===');
  console.log('  checked            ' + results.length);
  console.log('  live HTTP 200      ' + results.filter((r) => r.live).length);
  console.log('  self-canonical     ' + ok('selfCanonical'));
  console.log('  no noindex         ' + ok('noNoindex'));
  console.log('  in sitemap         ' + ok('inSitemap'));
  console.log('  has product links  ' + ok('hasStaticLinks'));
  if (tok) {
    const indexed = results.filter((r) => r.gsc && /submitted and indexed|indexed, not submitted/i.test(r.gsc.coverage || ''));
    const disc = results.filter((r) => r.gsc && /not indexed|crawled|discovered/i.test(r.gsc.coverage || ''));
    console.log('  GSC indexed        ' + indexed.length + '/' + results.length);
    console.log('  GSC not indexed    ' + disc.length);
    const pend = results.filter((r) => !r.gsc || (!/indexed/i.test(r.gsc.coverage || '') && !/crawled|discovered|not indexed/i.test(r.gsc.coverage || '')));
    if (pend.length) console.log('  GSC unclear/errors ' + pend.length);
  }
  const problems = results.filter((r) => !r.live || !r.checks.selfCanonical || !r.checks.noNoindex || !r.checks.inSitemap);
  if (problems.length) {
    console.log('\n  !! ' + problems.length + ' url(s) failing a technical gate:');
    for (const p of problems) console.log('     ' + p.url + '  http=' + p.http + ' canon=' + p.canonical + ' robots=' + p.robots);
  }

  try {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
    let prev = {};
    if (fs.existsSync(LEDGER)) { try { prev = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).urls || {}; } catch (e) { prev = {}; } }
    const urlsMap = {};
    for (const r of results) {
      urlsMap[r.url] = {
        firstSeen: (prev[r.url] && prev[r.url].firstSeen) || new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        tier: r.tier, http: r.http, selfCanonical: r.checks.selfCanonical, noNoindex: r.checks.noNoindex,
        inSitemap: r.checks.inSitemap, productLinks: r.checks.productLinks || 0,
        gscCoverage: r.gsc ? r.gsc.coverage : null, gscVerdict: r.gsc ? r.gsc.verdict : null,
      };
    }
    fs.writeFileSync(LEDGER, JSON.stringify({ generatedAt: new Date().toISOString(), site: SITE, urls: urlsMap }, null, 2));
    console.log('\nLedger: ' + path.relative(ROOT, LEDGER));
  } catch (e) { console.log('\n(ledger write failed: ' + e.message + ')'); }
}

main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
