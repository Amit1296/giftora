#!/usr/bin/env node
/**
 * fetch-keywords.js — Pull your Giftora ranking keywords from the Google
 * Search Console API.
 *
 *   npm run seo:keywords                      # top 50 keywords by position (last 28 days)
 *   npm run seo:keywords -- --days 90         # last 90 days
 *   npm run seo:keywords -- --top 100 --sort clicks
 *   npm run seo:keywords -- --csv             # print as CSV (paste into Excel/Sheets)
 *
 * Credentials (one-time, ~10 minutes):
 *   1. Go to console.cloud.google.com  → create/select a project
 *   2. APIs & Services → Library → enable "Google Search Console API"
 *   3. APIs & Services → Credentials → Create Credentials → Service Account →
 *      download the JSON key file → save it as  seo/gsc-service-account.json
 *   4. To run from Render, instead set env vars:
 *        GSC_CLIENT_EMAIL=jwt-token@....gserviceaccount.com
 *        GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *   5. search.google.com/search-console → your gift-ora.online property →
 *      Settings → Users & permissions → Add user: paste the service account's
 *      email (from step 3) with "Full" access.
 *   6. Run this script. If you used a Domain property instead of URL-prefix,
 *      pass --site "sc-domain:gift-ora.online".
 */
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const DEFAULT_KEYFILE = path.join(__dirname, 'gsc-service-account.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_HOST = 'www.googleapis.com';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def;
  };
  return {
    days: parseInt(get('--days', '28'), 10),
    top: parseInt(get('--top', '50'), 10),
    sort: get('--sort', 'position'),
    csv: args.includes('--csv'),
    site: get('--site', null),
    keyfile: get('--keyfile', DEFAULT_KEYFILE),
  };
}

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function loadServiceAccount(opts) {
  if (process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY) {
    return {
      client_email: process.env.GSC_CLIENT_EMAIL,
      private_key: process.env.GSC_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  const file = opts.keyfile;
  if (!fs.existsSync(file)) {
    console.error('No credentials found.');
    console.error('Save the service-account JSON key as ' + file + ' (see header comment of this script).');
    console.error('Or set GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY env vars.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const payload = header + '.' + claims;
  const sig = b64url(crypto.sign('sha256', Buffer.from(payload), key.private_key));
  const jwt = payload + '.' + sig;

  const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' +
    encodeURIComponent(jwt);
  const res = await request(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);

  if (res.status !== 200) {
    console.error('Token request failed (' + res.status + '):', res.data);
    process.exit(1);
  }
  const json = JSON.parse(res.data);
  if (!json.access_token) {
    console.error('No access_token in response. Check service account email/key.');
    process.exit(1);
  }
  return json.access_token;
}

function resolveSite(opts) {
  if (opts.site) return opts.site;
  if (fs.existsSync(KEYWORDS_FILE)) {
    try {
      const kw = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
      if (kw.site && kw.site.url) return kw.site.url.replace(/\/$/, '');
    } catch (e) { /* fall through to default */ }
  }
  return 'https://gift-ora.online';
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function queryKeywords(token, site, days, top, sort) {
  const endDate = isoDaysAgo(1);
  const startDate = isoDaysAgo(days);
  const body = JSON.stringify({
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: Math.min(top, 25000),
    dataState: 'final',
  });
  const url = 'https://' + API_HOST + '/webmasters/v3/sites/' + encodeURIComponent(site) +
    '/searchAnalytics/query';
  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status === 403) {
    console.error('403 Forbidden — the service account is not added to the Search Console property.');
    console.error('Add ' + process.env.GSC_CLIENT_EMAIL + ' (or your service account email) at');
    console.error('Search Console → Settings → Users & permissions, with "Full" access.');
    process.exit(1);
  }
  if (res.status === 404) {
    console.error('404 — site not found in Search Console. Try --site "sc-domain:gift-ora.online"');
    process.exit(1);
  }
  if (res.status !== 200) {
    console.error('Query failed (' + res.status + '):', res.data);
    process.exit(1);
  }

  const data = JSON.parse(res.data);
  const rows = (data.rows || []).map((r) => ({
    keyword: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  const sorters = {
    position: (a, b) => a.position - b.position,
    clicks: (a, b) => b.clicks - a.clicks,
    impressions: (a, b) => b.impressions - a.impressions,
    ctr: (a, b) => b.ctr - a.ctr,
  };
  rows.sort(sorters[sort] || sorters.position);
  return rows;
}

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
}

function main() {
  const opts = parseArgs();
  const key = loadServiceAccount(opts);
  const site = resolveSite(opts);

  console.log('Fetching top ' + opts.top + ' keywords for ' + site + ' (last ' + opts.days + ' days)...\n');

  getAccessToken(key)
    .then((token) => queryKeywords(token, site, opts.days, opts.top, opts.sort))
    .then((rows) => {
      if (!rows.length) {
        console.log('No keyword data yet. This is normal for a new site — check back once impressions appear.');
        process.exit(0);
      }
      const totals = rows.reduce(
        (a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions, ctr: a.ctr + r.clicks / r.impressions }),
        { clicks: 0, impr: 0, ctr: 0 }
      );

      if (opts.csv) {
        console.log(['keyword', 'clicks', 'impressions', 'ctr', 'position'].join(','));
        rows.forEach((r) => console.log([
          '"' + r.keyword.replace(/"/g, '""') + '"',
          r.clicks,
          r.impressions,
          (r.ctr * 100).toFixed(1) + '%',
          r.position.toFixed(1),
        ].join(',')));
      } else {
        console.log('Keyword'.padEnd(64) + ' Clks  Impr   CTR    Pos');
        console.log('-'.repeat(98));
        rows.forEach((r) =>
          console.log(
            (r.keyword.length > 62 ? r.keyword.slice(0, 59) + '...' : r.keyword).padEnd(64) +
            String(r.clicks).padStart(5) +
            String(fmt(r.impressions)).padStart(7) +
            (r.ctr * 100).toFixed(1).padStart(7) + '%' +
            r.position.toFixed(1).padStart(8)
          )
        );
        console.log('-'.repeat(98));
        console.log('TOTAL'.padEnd(64) + String(totals.clicks).padStart(5) + String(fmt(totals.impr)).padStart(7) +
          (totals.clicks / totals.impr * 100).toFixed(1).padStart(7) + '%' + '  --');
      }
    })
    .catch((e) => {
      console.error('Error:', e.message);
      process.exit(1);
    });
}

main();