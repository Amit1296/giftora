#!/usr/bin/env node
/**
 * seo-track.js — Compare live Search Console data against the recorded AEO
 * baseline, so ranking movement is measured instead of guessed at.
 *
 *   node seo/track.js                 # last 28 days, vs previous 28
 *   node seo/track.js --days 90
 *   node seo/track.js --pages         # per-URL breakdown for the 27 new pages
 *
 * Requires Search Console credentials — see the header of fetch-keywords.js.
 * Without them this prints exactly what to set up and exits cleanly.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'aio-baseline.json');
const KEYFILE = path.join(__dirname, 'gsc-service-account.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const DAYS = parseInt(val('--days', '28'), 10);
const PAGES = flag('--pages');
const SITE = val('--site', 'https://gift-ora.online');

function b64url(b) {
  return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
function iso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

function creds() {
  if (process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY) {
    return { client_email: process.env.GSC_CLIENT_EMAIL, private_key: process.env.GSC_PRIVATE_KEY.replace(/\\n/g, '\n') };
  }
  if (!fs.existsSync(KEYFILE)) return null;
  return JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
}

async function token(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const assertion = header + '.' + claims + '.' +
    b64url(crypto.sign('sha256', Buffer.from(header + '.' + claims), key.private_key));
  const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' +
    encodeURIComponent(assertion);
  const res = await request(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (res.status !== 200) throw new Error('token ' + res.status + ': ' + res.data);
  return JSON.parse(res.data).access_token;
}

async function query(tok, startDate, endDate, dimensions, rowLimit) {
  const body = JSON.stringify({ startDate, endDate, dimensions, rowLimit: rowLimit || 25000, dataState: 'final' });
  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SITE) + '/searchAnalytics/query';
  const res = await request(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (res.status === 403) throw new Error('403 — service account not added to the Search Console property');
  if (res.status === 404) throw new Error('404 — property not found; try --site "sc-domain:gift-ora.online"');
  if (res.status !== 200) throw new Error('query ' + res.status + ': ' + res.data);
  return JSON.parse(res.data).rows || [];
}

const sum = (rows) => rows.reduce((a, r) => ({
  clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
}), { clicks: 0, impressions: 0 });

const pct = (a, b) => (b === 0 ? (a > 0 ? 'new' : '0%') : (((a - b) / b) * 100).toFixed(1) + '%');

function baseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

/* the 27 pages that gained Speakable in the AEO work, straight from git */
function addedPages() {
  try {
    return execSync('git show --name-only --format= e4384a09', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.html'));
  } catch (e) { return []; }
}

async function main() {
  const key = creds();
  if (!key) {
    console.log('=== seo/track.js ===\n');
    console.log('Search Console credentials are not set up yet, so there is no');
    console.log('ranking data to compare. One-time setup (~10 min):\n');
    console.log('  1. console.cloud.google.com -> create/select a project');
    console.log('  2. APIs & Services -> Library -> enable "Search Console API"');
    console.log('  3. Credentials -> Service Account -> download JSON key');
    console.log('     save it as  seo/gsc-service-account.json   (already gitignored)');
    console.log('  4. search.google.com/search-console -> gift-ora.online property');
    console.log('     -> Settings -> Users & permissions -> Add user -> the');
    console.log('     service account email, "Full" access\n');
    console.log('Then run:  node seo/track.js');
    const b = baseline();
    if (b) {
      console.log('Baseline already recorded for later comparison:');
      console.log('  ' + b.speakablePages + ' Speakable / ' + b.totalPages + ' pages,');
      console.log('  ' + (b.speakableAdded || []).length + ' gained in ' + b.speakableAddedIn);
    }
    return;
  }

  const tok = await token(key);
  const cur = sum(await query(tok, iso(DAYS * 2 + 1), iso(DAYS + 1), []));
  const prev = sum(await query(tok, iso(DAYS * 4 + 2), iso(DAYS * 2 + 2), []));

  console.log('=== Search Console: last ' + DAYS + 'd vs previous ' + DAYS + 'd ===\n');
  console.log('  clicks      ' + prev.clicks + ' -> ' + cur.clicks + '   ' + pct(cur.clicks, prev.clicks));
  console.log('  impressions ' + prev.impressions + ' -> ' + cur.impressions + '   ' + pct(cur.impressions, prev.impressions));
  console.log('  (7-day gap at the end of each window, since GSC lags ~3 days)');

  if (PAGES) {
    const added = addedPages();
    const rows = await query(tok, iso(DAYS + 1), iso(DAYS * 2 + 1), ['page'], 5000);
    const byPage = new Map(rows.map((r) => [r.keys[0], r]));
    console.log('\n=== the ' + added.length + ' pages that gained Speakable in e4384a09 ===');
    let c = 0, i = 0;
    added.forEach((f) => {
      const r = byPage.get(SITE + '/' + f);
      if (r) { c += r.clicks; i += r.impressions; }
      console.log('  ' + (r ? String(r.clicks).padStart(4) + ' clicks  ' + String(r.impressions).padStart(5) + ' impr  pos ' + r.position.toFixed(1) : '    no data yet') + '  ' + f);
    });
    console.log('\n  combined: ' + c + ' clicks, ' + i + ' impressions');
  }
}

main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
