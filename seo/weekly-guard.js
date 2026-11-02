#!/usr/bin/env node
/**
 * seo/weekly-guard.js — weekly ranking-defence report.
 *
 *   node seo/weekly-guard.js                 # crawl + GSC + AI logs + report
 *   node seo/weekly-guard.js --no-crawl      # skip the 365-page crawl
 *   node seo/weekly-guard.js --telegram      # force-send the digest
 *   node seo/weekly-guard.js --days 14       # compare 14-day windows
 *
 * Always: live technical crawl, AEO markup coverage, AI crawler activity
 * (when nginx logs exist), regression diff against last week's run.
 * If seo/gsc-service-account.json exists: Search Console comparison and
 * top-10 keyword drop detection (see seo/google-search-console-guide.md).
 * Optional Telegram digest via /root/.giftora-alert.json or env vars.
 *
 * Writes artifacts/weekly-guard-<date>.md and artifacts/weekly-guard-latest.json.
 * Never edits the site; exits 0 unless the sitemap cannot be read.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const KEYFILE = path.join(__dirname, 'gsc-service-account.json');
const SITEMAP_URL = 'https://gift-ora.online/sitemap.xml';
const SITE_CANDIDATES = ['https://gift-ora.online/', 'sc-domain:gift-ora.online'];
const UA = 'GiftoraWeeklyGuard/1.0 (+https://gift-ora.online/)';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const NGINX_DIR = '/var/log/nginx';

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const argVal = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const DAYS = Math.max(1, parseInt(argVal('--days', '7'), 10));
const LAG = Math.max(0, parseInt(argVal('--lag', '3'), 10));
const NO_CRAWL = hasFlag('--no-crawl');
const FORCE_TG = hasFlag('--telegram');
const CONCURRENCY = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- http

function request(url, opts, body) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ 'User-Agent': UA }, (opts && opts.headers) || {}),
      timeout: (opts && opts.timeout) || 20000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (data.length < 1500000) data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '', error: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

async function get(url, tries) {
  const n = tries || 2;
  let r = await request(url);
  if ((r.status === 0 || r.status === 429 || r.status >= 500) && n > 1) {
    await sleep(900);
    r = await request(url);
  }
  return r;
}

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- crawl

async function sitemapUrls() {
  const r = await get(SITEMAP_URL);
  if (r.status !== 200) throw new Error('sitemap HTTP ' + r.status);
  const urls = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls)];
}

function analyse(url, res, sitemap) {
  const h = res.body || '';
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  const desc = (h.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) || [, ''])[1].trim();
  const canon = (h.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [, ''])[1];
  const metaRobots = (h.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) || [, ''])[1];
  const xRobots = String((res.headers && res.headers['x-robots-tag']) || '');
  const types = [...h.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  return {
    url,
    http: res.status,
    redirect: res.status >= 300 && res.status < 400,
    title,
    titleLen: title.length,
    desc,
    descLen: desc.length,
    canonical: canon || null,
    selfCanonical: !!canon && canon.replace(/\/$/, '') === url.replace(/\/$/, ''),
    noindex: /noindex/i.test(metaRobots) || /noindex/i.test(xRobots),
    inSitemap: sitemap.has(url),
    h1: (h.match(/<h1[\s>]/gi) || []).length,
    faq: types.includes('FAQPage'),
    speakable: types.includes('SpeakableSpecification'),
    howTo: types.includes('HowTo'),
  };
}

async function crawl(urls, sitemap) {
  const rows = [];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      const res = await get(url);
      rows.push(analyse(url, res, sitemap));
      if (process.stdout.isTTY) process.stdout.write('\r  crawling ' + rows.length + '/' + urls.length);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (process.stdout.isTTY) process.stdout.write('\n');
  return rows;
}

function technical(rows) {
  const failing = [];
  for (const r of rows) {
    const issues = [];
    if (r.http !== 200) issues.push('HTTP ' + r.http);
    if (r.redirect) issues.push('redirect');
    if (!r.selfCanonical) issues.push('canonical ' + (r.canonical || 'missing'));
    if (r.noindex) issues.push('noindex');
    if (!r.inSitemap) issues.push('not in sitemap');
    if (r.h1 !== 1) issues.push('h1=' + r.h1);
    if (issues.length) failing.push({ url: r.url, issues });
  }
  const bucket = (key) => rows.reduce((m, r) => {
    if (!r[key]) return m;
    (m[r[key]] = m[r[key]] || []).push(r.url);
    return m;
  }, {});
  const dupes = (m) => Object.entries(m).filter(([, v]) => v.length > 1);
  const faq = rows.filter((r) => r.faq).length;
  const speakable = rows.filter((r) => r.speakable).length;
  const howTo = rows.filter((r) => r.howTo).length;
  const shortDescRows = rows.filter((r) => r.descLen > 0 && r.descLen < 70);
  const dupTitleRows = dupes(bucket('title'));
  return {
    checked: rows.length,
    failing,
    dupTitles: dupTitleRows.length,
    dupTitleList: dupTitleRows.slice(0, 10),
    dupDescs: dupes(bucket('desc')).length,
    missingDesc: rows.filter((r) => !r.descLen).length,
    shortDesc: shortDescRows.length,
    shortDescList: shortDescRows.slice(0, 15).map((r) => ({ url: r.url, len: r.descLen })),
    aeo: { faq, speakable, howTo },
  };
}

// ---------------------------------------------------------------- gsc

function creds() {
  if (process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY) {
    return {
      client_email: process.env.GSC_CLIENT_EMAIL,
      private_key: process.env.GSC_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  if (!fs.existsSync(KEYFILE)) return null;
  return JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
}

function b64url(b) {
  return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function gscToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const sig = b64url(crypto.sign('sha256', Buffer.from(head + '.' + claim), key.private_key));
  const assertion = head + '.' + claim + '.' + sig;
  const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
    '&assertion=' + encodeURIComponent(assertion);
  const res = await request(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (res.status !== 200) throw new Error('token HTTP ' + res.status);
  return JSON.parse(res.body).access_token;
}

async function gscQuery(site, token, start, end, dims, limit) {
  const body = JSON.stringify({ startDate: start, endDate: end, dimensions: dims, rowLimit: limit || 1000, dataState: 'final' });
  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query';
  const res = await request(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (res.status !== 200) return { ok: false, status: res.status };
  return { ok: true, rows: JSON.parse(res.body).rows || [] };
}

const sumRows = (rows) => rows.reduce((a, r) => ({
  clicks: a.clicks + r.clicks,
  impressions: a.impressions + r.impressions,
}), { clicks: 0, impressions: 0 });

const growth = (cur, prev) => (prev === 0 ? (cur > 0 ? 'new' : '0%') : (((cur - prev) / prev) * 100).toFixed(1) + '%');

async function gscReport() {
  const key = creds();
  if (!key) return { configured: false };
  let token;
  try { token = await gscToken(key); } catch (e) { return { configured: true, error: 'token failed: ' + e.message }; }

  let site = null;
  for (const s of SITE_CANDIDATES) {
    const probe = await gscQuery(s, token, isoDaysAgo(LAG + 1), isoDaysAgo(LAG + 1), [], 1);
    if (probe.ok) { site = s; break; }
  }
  if (!site) return { configured: true, error: 'no accessible Search Console property (403/404)' };

  const curEnd = isoDaysAgo(LAG);
  const curStart = isoDaysAgo(LAG + DAYS - 1);
  const prevEnd = isoDaysAgo(LAG + DAYS);
  const prevStart = isoDaysAgo(LAG + DAYS * 2 - 1);

  const curTotals = sumRows((await gscQuery(site, token, curStart, curEnd, [], 1)).rows || []);
  const prevTotals = sumRows((await gscQuery(site, token, prevStart, prevEnd, [], 1)).rows || []);
  const curQ = (await gscQuery(site, token, curStart, curEnd, ['query'], 1000)).rows || [];
  const prevQ = (await gscQuery(site, token, prevStart, prevEnd, ['query'], 1000)).rows || [];
  const curP = (await gscQuery(site, token, curStart, curEnd, ['page'], 1000)).rows || [];
  const prevP = (await gscQuery(site, token, prevStart, prevEnd, ['page'], 1000)).rows || [];

  const prevByQuery = new Map(prevQ.map((r) => [r.keys[0], r]));
  const slipped = [];
  const entered = [];
  for (const r of curQ) {
    const q = r.keys[0];
    const p = prevByQuery.get(q);
    if (p && p.position <= 10 && r.position >= p.position + 3 && p.impressions >= 5) {
      slipped.push({ query: q, from: p.position, to: r.position, impressions: r.impressions });
    }
    if (r.position <= 10 && r.impressions >= 10 && (!p || p.position > 10)) {
      entered.push({ query: q, position: r.position, impressions: r.impressions });
    }
  }
  slipped.sort((a, b) => (b.from - b.to) - (a.from - a.to));

  const prevByPage = new Map(prevP.map((r) => [r.keys[0], r]));
  const lostPages = [];
  for (const r of curP) {
    const p = prevByPage.get(r.keys[0]);
    if (p && p.clicks >= 5 && r.clicks <= p.clicks * 0.7) {
      lostPages.push({ page: r.keys[0], from: p.clicks, to: r.clicks });
    }
  }
  lostPages.sort((a, b) => (a.to - a.from) - (b.to - b.from));

  const striking = curQ
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((r) => ({ query: r.keys[0], position: r.position, impressions: r.impressions }));

  return {
    configured: true,
    site,
    window: { curStart, curEnd, prevStart, prevEnd },
    totals: { cur: curTotals, prev: prevTotals },
    slipped: slipped.slice(0, 10),
    entered: entered.slice(0, 10),
    lostPages: lostPages.slice(0, 10),
    striking,
  };
}

// ---------------------------------------------------------------- ai logs

function aiActivity() {
  if (!fs.existsSync(NGINX_DIR)) return null;
  const rank = (f) => (f === 'access.log' ? 0 : f === 'access.log.1' ? 1 : parseInt((f.match(/\.(\d+)(\.gz)?$/) || [, '99'])[1], 10));
  let files = [];
  try {
    files = fs.readdirSync(NGINX_DIR).filter((f) => /^access\.log(\.\d+(\.gz)?)?$/.test(f)).sort((a, b) => rank(a) - rank(b));
  } catch (e) { return null; }

  const bots = {};
  const refs = {};
  const botRe = /"(GPTBot|OAI-SearchBot|PerplexityBot|ClaudeBot|CCBot|Google-Extended)[^"]*"/i;
  const refRe = /"(https?:\/\/(?:www\.)?(chatgpt\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com)[^"]*)"/i;

  for (const f of files) {
    let text;
    try {
      const buf = fs.readFileSync(path.join(NGINX_DIR, f));
      text = f.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    } catch (e) { continue; }
    for (const line of text.split('\n')) {
      const b = line.match(botRe);
      if (b) bots[b[1]] = (bots[b[1]] || 0) + 1;
      const r = line.match(refRe);
      if (r) refs[r[2]] = (refs[r[2]] || 0) + 1;
    }
  }
  return { days: files.length, bots, refs };
}

// ---------------------------------------------------------------- telegram

function telegramCreds() {
  if (process.env.GIFTORA_TELEGRAM_TOKEN && process.env.GIFTORA_TELEGRAM_CHAT) {
    return { token: process.env.GIFTORA_TELEGRAM_TOKEN, chat: process.env.GIFTORA_TELEGRAM_CHAT };
  }
  try {
    const j = JSON.parse(fs.readFileSync('/root/.giftora-alert.json', 'utf8'));
    if (j.token && j.chatId) return { token: j.token, chat: String(j.chatId) };
  } catch (e) { /* not configured */ }
  return null;
}

async function sendTelegram(creds, text) {
  if (text.length > 4000) text = text.slice(0, 3990) + '…';
  const body = JSON.stringify({ chat_id: creds.chat, text, disable_web_page_preview: true });
  const res = await request('https://api.telegram.org/bot' + creds.token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  return res.status === 200;
}

// ---------------------------------------------------------------- report

function buildReport(d) {
  const L = [];
  const p = (s) => L.push(s);
  p('# Giftora weekly guard — ' + d.date);
  p('');
  p('Site: https://gift-ora.online  |  sitemap: ' + d.urls + ' URLs  |  window: ' + DAYS + ' days');
  p('');
  p('## Verdict');
  const verdict = [];
  if (d.tech.failing.length) verdict.push(d.tech.failing.length + ' page(s) failing technical gates');
  if (d.newFailures.length) verdict.push(d.newFailures.length + ' new failure(s) since last week');
  if (d.gsc.configured && !d.gsc.error && d.gsc.slipped.length) verdict.push(d.gsc.slipped.length + ' top-10 keyword(s) slipped');
  if (d.gsc.configured && !d.gsc.error && d.gsc.lostPages.length) verdict.push(d.gsc.lostPages.length + ' page(s) lost ≥30% clicks');
  if (!verdict.length) verdict.push('no regressions detected');
  p('- ' + verdict.join('; '));
  if (!d.gsc.configured) p('- Google Search Console is not connected yet, so ranking movement cannot be measured.');
  if (d.gsc.error) p('- Search Console error: ' + d.gsc.error);
  p('');

  p('## Technical');
  p('- pages checked: ' + d.tech.checked);
  p('- failing: ' + d.tech.failing.length);
  p('- duplicate titles: ' + d.tech.dupTitles + '  |  missing descriptions: ' + d.tech.missingDesc + '  |  short descriptions: ' + d.tech.shortDesc);
  if (d.tech.dupTitleList && d.tech.dupTitleList.length) {
    p('');
    for (const [title, list] of d.tech.dupTitleList) {
      p('- duplicate title "' + title.slice(0, 70) + '" on ' + list.length + ' pages: ' + list.slice(0, 3).map((u) => u.replace('https://gift-ora.online/', '')).join(', '));
    }
  }
  if (d.tech.shortDescList && d.tech.shortDescList.length) {
    p('');
    p('Short meta descriptions (<70 chars):');
    for (const s of d.tech.shortDescList) p('- ' + s.url.replace('https://gift-ora.online/', '') + ' (' + s.len + ')');
  }
  if (d.tech.failing.length) {
    p('');
    for (const f of d.tech.failing.slice(0, 40)) p('- ' + f.url.replace('https://gift-ora.online/', '') + ' — ' + f.issues.join(', '));
    if (d.tech.failing.length > 40) p('- …and ' + (d.tech.failing.length - 40) + ' more');
  }
  if (d.newFailures.length) {
    p('');
    p('**New this week:**');
    for (const f of d.newFailures) p('- ' + f.url.replace('https://gift-ora.online/', '') + ' — ' + f.issues.join(', '));
  }
  p('');
  p('## Answer-engine markup');
  const t = d.tech.checked || 1;
  p('- FAQPage schema: ' + d.tech.aeo.faq + ' pages (' + Math.round((d.tech.aeo.faq / t) * 100) + '%)');
  p('- Speakable: ' + d.tech.aeo.speakable + ' pages (' + Math.round((d.tech.aeo.speakable / t) * 100) + '%)');
  p('- HowTo: ' + d.tech.aeo.howTo + ' pages');
  p('');

  if (d.gsc.configured && !d.gsc.error) {
    const g = d.gsc;
    p('## Google Search Console (' + g.site + ')');
    p('- clicks: ' + g.totals.prev.clicks + ' → ' + g.totals.cur.clicks + ' (' + growth(g.totals.cur.clicks, g.totals.prev.clicks) + ')');
    p('- impressions: ' + g.totals.prev.impressions + ' → ' + g.totals.cur.impressions + ' (' + growth(g.totals.cur.impressions, g.totals.prev.impressions) + ')');
    p('- window: ' + g.window.curStart + ' → ' + g.window.curEnd + ' vs ' + g.window.prevStart + ' → ' + g.window.prevEnd);
    p('');
    p('### Top-10 keywords that slipped');
    if (!g.slipped.length) p('- none');
    for (const s of g.slipped) p('- "' + s.query + '" ' + s.from.toFixed(1) + ' → ' + s.to.toFixed(1) + ' (' + s.impressions + ' impressions)');
    p('');
    p('### Pages that lost clicks');
    if (!g.lostPages.length) p('- none');
    for (const s of g.lostPages) p('- ' + s.page.replace('https://gift-ora.online/', '') + ' ' + s.from + ' → ' + s.to + ' clicks');
    p('');
    p('### New top-10 keywords');
    if (!g.entered.length) p('- none');
    for (const s of g.entered) p('- "' + s.query + '" pos ' + s.position.toFixed(1) + ' (' + s.impressions + ' impressions)');
    p('');
    p('### Striking distance (positions 8–20)');
    if (!g.striking.length) p('- none');
    for (const s of g.striking) p('- "' + s.query + '" pos ' + s.position.toFixed(1) + ' (' + s.impressions + ' impressions)');
    p('');
  }

  if (d.ai) {
    p('## AI crawler activity (nginx logs)');
    const bots = Object.entries(d.ai.bots).sort((a, b) => b[1] - a[1]);
    p(bots.length ? bots.map(([b, n]) => '- ' + b + ': ' + n + ' requests').join('\n') : '- no AI bot requests found');
    const refs = Object.entries(d.ai.refs).sort((a, b) => b[1] - a[1]);
    p(refs.length ? refs.map(([h, n]) => '- referral ' + h + ': ' + n).join('\n') : '- no AI referral clicks yet');
    p('');
  }

  p('## Sources');
  p('- live: ' + SITEMAP_URL);
  p('- GSC: ' + (d.gsc.configured ? (d.gsc.error || d.gsc.site) : 'not connected — see seo/google-search-console-guide.md'));
  p('- generated: ' + new Date().toISOString());
  return L.join('\n') + '\n';
}

function digest(d) {
  const lines = [];
  lines.push('Giftora weekly guard — ' + d.date);
  lines.push('Technical: ' + d.tech.checked + ' pages, ' + d.tech.failing.length + ' failing' +
    (d.newFailures.length ? ', ' + d.newFailures.length + ' NEW' : ''));
  if (d.gsc.configured && !d.gsc.error) {
    lines.push('Google: ' + d.gsc.totals.cur.clicks + ' clicks (' + growth(d.gsc.totals.cur.clicks, d.gsc.totals.prev.clicks) +
      '), ' + d.gsc.slipped.length + ' top-10 slipped');
  } else {
    lines.push('Google: not connected (Search Console setup needed)');
  }
  if (d.ai) {
    const bots = Object.entries(d.ai.bots).sort((a, b) => b[1] - a[1]).slice(0, 3);
    lines.push('AI crawlers: ' + (bots.length ? bots.map(([b, n]) => b + ' ' + n).join(', ') : 'none'));
  }
  lines.push('Report: ' + d.reportPath);
  return lines.join('\n');
}

// ---------------------------------------------------------------- main

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  console.log('=== Giftora weekly guard — ' + date + ' ===');

  const urls = await sitemapUrls();
  const urlSet = new Set(urls);
  console.log('  sitemap: ' + urls.length + ' URLs');

  let rows = [];
  if (!NO_CRAWL) {
    console.log('  crawling (concurrency ' + CONCURRENCY + ')…');
    rows = await crawl(urls, urlSet);
  }
  const tech = NO_CRAWL
    ? { checked: 0, failing: [], dupTitles: 0, dupDescs: 0, missingDesc: 0, shortDesc: 0, aeo: { faq: 0, speakable: 0, howTo: 0 } }
    : technical(rows);

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'weekly-guard-latest.json'), 'utf8')).pages || {}; } catch (e) { prev = {}; }
  const nowPages = {};
  const newFailures = [];
  for (const r of rows) {
    const issues = [];
    if (r.http !== 200) issues.push('HTTP ' + r.http);
    if (r.redirect) issues.push('redirect');
    if (!r.selfCanonical) issues.push('canonical ' + (r.canonical || 'missing'));
    if (r.noindex) issues.push('noindex');
    if (!r.inSitemap) issues.push('not in sitemap');
    if (r.h1 !== 1) issues.push('h1=' + r.h1);
    nowPages[r.url] = { ok: !issues.length };
    if (issues.length && prev[r.url] && prev[r.url].ok) newFailures.push({ url: r.url, issues });
  }

  console.log('  Google Search Console…');
  const gsc = await gscReport();
  if (!gsc.configured) console.log('    not connected — reporting technical + AI sections only');
  else if (gsc.error) console.log('    error: ' + gsc.error);
  else console.log('    ' + gsc.site + ': ' + gsc.slipped.length + ' slipped, ' + gsc.lostPages.length + ' pages losing clicks');

  const ai = aiActivity();
  if (ai) console.log('  AI crawlers: ' + Object.entries(ai.bots).map(([b, n]) => b + ' ' + n).join(', '));

  const data = { date, urls: urls.length, tech, newFailures, gsc, ai, pages: NO_CRAWL ? prev : nowPages };
  data.reportPath = path.join(OUT_DIR, 'weekly-guard-' + date + '.md');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(data.reportPath, buildReport(data));
  fs.writeFileSync(path.join(OUT_DIR, 'weekly-guard-latest.json'), JSON.stringify(data, null, 2));
  console.log('\n  report: ' + data.reportPath);

  const tg = telegramCreds();
  if (tg && (FORCE_TG || gsc.configured || tech.failing.length || newFailures.length)) {
    const ok = await sendTelegram(tg, digest(data));
    console.log('  telegram: ' + (ok ? 'sent' : 'failed'));
  } else if (!tg) {
    console.log('  telegram: not configured (/root/.giftora-alert.json)');
  }

  console.log('\n  --- summary ---');
  console.log('  pages: ' + tech.checked + '  failing: ' + tech.failing.length + '  new: ' + newFailures.length);
  if (gsc.configured && !gsc.error) {
    console.log('  clicks: ' + gsc.totals.prev.clicks + ' → ' + gsc.totals.cur.clicks +
      '  slipped: ' + gsc.slipped.length + '  lost pages: ' + gsc.lostPages.length);
  }
}

main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
