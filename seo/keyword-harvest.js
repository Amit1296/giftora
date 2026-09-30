#!/usr/bin/env node
/**
 * keyword-harvest.js — Collect REAL search queries for every city page, product
 * page and commercial cluster, without touching a single page.
 *
 * Why autosuggest: Google's public suggest endpoint returns phrases real people
 * actually type, needs no API key, no account and no ad spend. That makes it
 * verifiable in a way an invented keyword list is not — every row in the output
 * can be traced back to a live Google response.
 *
 *   node seo/keyword-harvest.js                # city + product + cluster seeds
 *   node seo/keyword-harvest.js --only cities
 *   node seo/keyword-harvest.js --only products
 *   node seo/keyword-harvest.js --only clusters
 *   node seo/keyword-harvest.js --city-limit 5 # quick smoke test
 *
 * OUTPUT ONLY. This script never writes to an HTML page. It produces
 * seo/keyword-proposal.json for a human to review before anything is applied.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'keyword-proposal.json');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const only = val('--only', 'all');
const cityLimit = parseInt(val('--city-limit', '0'), 10);

const DELAY_MS = 90;    // polite pacing; also avoids rate-limit responses
const TIMEOUT_MS = 9000;

/* ---------- Google autosuggest ---------- */

function suggest(query) {
  return new Promise((resolve) => {
    const url = 'https://suggestqueries.google.com/complete/search'
      + '?client=firefox&gl=in&hl=en&q=' + encodeURIComponent(query);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d)[1] || []);
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve([]); });
    req.on('error', () => resolve([]));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- existing keyword state, so we never re-propose what is live ---------- */

function readMetaKeywords(file) {
  const h = fs.readFileSync(file, 'utf8');
  const m = h.match(/<meta name="keywords" content="([^"]*)"/i);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[&]/g, 'and').trim();

/* Every keyword already present anywhere on the site. A suggestion that is
   already live is not a new opportunity, it is a duplicate. */
function collectSitewideKeywords() {
  const files = [
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f)),
    ...fs.readdirSync(path.join(ROOT, 'products')).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, 'products', f)),
  ];
  const byTerm = new Map();
  for (const f of files) {
    let kws;
    try { kws = readMetaKeywords(f); } catch (e) { continue; }
    for (const k of kws) {
      const n = norm(k);
      if (!n) continue;
      if (!byTerm.has(n)) byTerm.set(n, new Set());
      byTerm.get(n).add(path.relative(ROOT, f).replace(/\\/g, '/'));
    }
  }
  return byTerm;
}

/* ---------- seeds ---------- */

function citySeeds() {
  const cities = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo/city-data.json'), 'utf8'));
  return cities.map((c) => ({
    file: 'gift-delivery-' + c.slug + '.html',
    name: c.name,
    state: c.state,
    requireCity: true,
    areas: c.areas || [],
    seeds: [
      'gift delivery in ' + c.name,
      'cake delivery in ' + c.name,
      'flower delivery in ' + c.name,
      'send gifts to ' + c.name,
      'gift shop ' + c.name,
      'birthday gift delivery in ' + c.name,
      'same day delivery ' + c.name,
    ],
  }));
}

function productSeeds() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
  const products = Array.isArray(raw) ? raw : (raw.products || []);
  const CATEGORY_TERM = {
    teddy: 'teddy bear', sunglasses: 'sunglasses', belts: 'belts', clothes: 'clothes',
    toys: 'toys', plants: 'plants', flowers: 'flowers', shoes: 'shoes',
    cakes: 'cake', combo: 'gift combo',
  };
  return products.map((p) => {
    const term = CATEGORY_TERM[p.category] || p.category;
    const nm = p.name.toLowerCase();
    return {
      file: 'products/' + (p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) + '.html',
      name: p.name,
      category: p.category,
      requireTerm: term,
      requireName: p.name,
      price: p.price,
      /* Seeds lead with the product's own name, so autocomplete returns
         name-qualified phrases rather than the category head term. */
      seeds: [
        nm,
        nm + ' gift',
        nm + ' price',
        nm + ' delivery',
        term + ' ' + nm.split(' ').slice(0, 2).join(' '),
      ],
    };
  });
}

function clusterSeeds() {
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
  const arr = Array.isArray(products) ? products : (products.products || []);
  const byCat = {};
  for (const p of arr) (byCat[p.category] = byCat[p.category] || []).push(p);
  const NAMES = {
    teddy: 'teddy-bear-gifts.html', sunglasses: 'sunglasses.html', belts: 'belts.html',
    clothes: 'clothes.html', toys: 'toys.html', plants: 'plant-gifts.html',
    flowers: 'flowers.html', shoes: 'shoes.html', cakes: 'cakes.html', combo: 'combo.html',
  };
  const LABEL = {
    teddy: 'Teddy Bear Gifts', sunglasses: 'Sunglasses', belts: 'Belts',
    clothes: 'Clothes', toys: 'Toys', plants: 'Plant Gifts',
    flowers: 'Flowers', shoes: 'Shoes', cakes: 'Cakes', combo: 'Gift Combos',
  };
  return Object.entries(byCat).map(([cat, list]) => ({
    cluster: cat,
    label: LABEL[cat] || cat,
    owner: NAMES[cat] || null,
    requireTerm: cat === 'combo' ? 'combo' : cat.replace(/s$/, ''),
    count: list.length,
    seeds: [
      LABEL[cat] ? LABEL[cat].toLowerCase() + ' delivery' : cat,
      'best ' + cat + ' gifts',
      cat + ' gifts delivery in india',
      'order ' + cat + ' online',
      cat + ' gifts under 1500',
    ],
  }));
}

/* ---------- harvest ---------- */

const normTerm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* Autocomplete happily returns competitors' brand queries and unrelated cities.
   Targeting "cakewala delivery in agra" on our page would be misleading copy and
   would hand them the click, so brand tokens are rejected outright rather than
   merely down-ranked. */
const BRAND = /\b(amazon|flipkart|myntra|meesho|ajio|swiggy|zomato|justdial|just dial|indiamart|sulekha|times|india|town|citybazaar|bigbasket|blinkit|zepto|dmart|decathlon|tata|airtel|jio|reliance|milk|confectioner)\b/;

/* Indian gift and bakery brands, plus the generic "-wala" / "bhai" naming that
   marks a real shop rather than a category. */
const BRAND_SUFFIX = /\b\w*(wala|bhai|hai|emporium|store|shop|house|point|hub|zone|plaza|centre|center|mart|bazaar|bazar|bakery|pastry|sweets|confectioner)\b/;

/* Autosuggest occasionally returns malformed strings with stray punctuation
   ("ambala.gift delivery"). Never a real query. */
const ARTIFACT = /[.,/|\\@#$%^&*+=<>{}[\]"'`]/;

/* Rupee, percent and other currency/symbol forms. The <meta keywords> tag is
   plain text; a rupee glyph is noise there even though people do search it. */
const SYMBOL = /[₹$€£¥%]/;

/* Giftora delivers inside India only. The country-name list is not enough:
   "plant gift delivery adelaide" names an Australian city, and "best flower
   gifts uk" ends in a bare country code. Both are checked here so an
   off-market term can never reach a page. */
const OFF_MARKET_COUNTRY = /\b(uk|u k|usa|u s a|canada|australia|new zealand|germany|france|ireland|pakistan|bangladesh|nepal|sri lanka|malaysia|singapore|indonesia|philippines|uae|dubai|abu dhabi|qatar|saudi arabia|kuwait|oman|bahrain|japan|china|hong kong|korea|thailand|vietnam|philippines|russia|ukraine|italy|spain|portugal|netherlands|sweden|norway|denmark|finland|poland|brazil|mexico|argentina|chile|peru|colombia|kenya|ghana|nigeria|south africa|egypt|israel|uae)\b/;
const OFF_MARKET_CITY = /\b(london|manchester|edinburgh|dublin|sydney|melbourne|brisbane|perth|adelaide|canberra|auckland|wellington|toronto|vancouver|montreal|dubai|sharjah|abu dhabi|doha|manama|muscat|colombo|kathmandu|karachi|lahore|dhaka|chittagong|kual lumpur|jakarta|manila|bangkok|berlin|munich|paris|amsterdam|rome|madrid)\b/;

/* Name-collision traps. Several Indian cities share a name with a city
   abroad, so autosuggest happily returns the foreign one for an Indian seed:
   "cake delivery kota kinabalu" (Sabah, Malaysia), "flower delivery in kota
   bharu" / "kota damansara" (Malaysia), "cake delivery salem oregon" /
   "salem indiana" (US), "cake delivery winston salem nc" (North Carolina).
   None of these are serviceable, and all of them were shipped live once
   before this list existed. Place and state names, not countries, because the
   country filter above cannot see them. */
const OFF_MARKET_PLACE = /\b(kinabalu|bharu|damansara|sabah|oregon|indiana|winston|ohio|california|texas|arizona|florida|colorado|georgia|virginia|massachusetts|maryland|minnesota|wisconsin|michigan|tennessee|alabama|louisiana|oklahoma|kansas|nebraska|utah|idaho|montana|wyoming|alaska|hawaii|ontario|quebec|alberta|manitoba|saskatchewan|nova scotia|british columbia|auckland|queensland|brisbane|perth|sydney|adelaide|darwin|canberra|wellington|aotearoa)\b/;

/* Two-letter airport-style abbreviations. "plant gift delivery kl" is Kuala
   Lumpur. Kept as a separate list because these are exactly the cases the
   spelled-out city list misses, and standalone two-letter tokens in gift
   queries are otherwise rare. */
const OFF_MARKET_ABBR = /\b(kl|nyc|lax|sin|dxb|cmb)\b/;

/* A year in the query means the suggestion was captured from a stale index.
   "best toy gifts 2025" is already out of date and will decay further. */
const STALE_YEAR = /\b(20(1[0-9]|2[0-5]))\b/;
const OFF_MARKET_TOPIC = /\b(reddit|quora|wiki|wikipedia)\b/;
const FOOD_ORDERING = /\b(burger|pizza|chinese food|chinese combo|thali|biryani|samosa|chicken ?wings|food order|food delivery)\b/;

/* Speed promises Giftora cannot keep. It hand-delivers gifts, so it is not
   competing with a 10-minute courier, and ranking for it would cost clicks
   from people we cannot actually serve the way they expect. */
const IMPOSSIBLE = /\b(in \d+ ?(min|minute|second)s?|within \d+ ?(min|minute)s?|same ?day ?(courier|express ?pickup)|pickup ?in \d+)\b/;

/* Pop-culture and game franchises that appear in gift searches but describe
   merchandise we do not stock (Deltarune, Pokemon, Disney etc). */
const FRANCHISE = /\b(deltarune|pokemon|anime|naruto|one piece|genshin|minecraft|fortnite|mario|zelda|harry potter|marvel|dc comics|nike|adidas|disney|barbie|lego)\b/;

/* City names Giftora actually has a page for. A cluster must not claim one —
   that is the city page's term, by the c84264f6 rule. */
function knownCitySlugs() {
  const cities = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo/city-data.json'), 'utf8'));
  return new Set(cities.map((c) => c.name.toLowerCase()));
}
const CITY_NAMES = knownCitySlugs();

/* Suffix expansion is a known autosuggest artefact: "ambala" -> "ambalangoda",
   "ambala cantt", "ambala city". Only the bare city name is a valid target. */
function cityMatches(suggestion, city) {
  const s = ' ' + normTerm(suggestion) + ' ';
  const c = normTerm(city);
  return s.includes(' ' + c + ' ') || s.includes(' ' + c + 's ');
}

function judge(suggestion, seed, group) {
  const s = normTerm(suggestion);
  const w = s.split(' ').filter(Boolean);
  let score = 0;
  const reasons = [];

  /* A product page may only target terms that name that product. "Buy teddy
     bear online" is the teddy category page's term; letting four teddy products
     all claim it is exactly the cannibalization c84264f6 removed. Requiring the
     product's own name keeps product pages distinct from each other and from
     their cluster. This matters most for small categories, where a term shared
     by 1 product looks unique and would otherwise slip through. */
  if (group.requireName) {
    const nameParts = normTerm(group.requireName).split(' ').filter((x) => x.length > 2);
    const named = nameParts.filter((p) => s.includes(p));
    if (named.length < Math.min(2, nameParts.length)) {
      return { score: -99, reasons: ['does not name this specific product'], reject: true };
    }
    /* Product names are marketing phrases ("Prosperity Money Plant"), so a name
       match alone still yields "fortune plants meaning" or "teddy roosevelt
       story". Require a shopping modifier as well, or drop the term. */
    if (!/\b(buy|order|price|delivery|deliver|online|gift|gifts|shop|store|sale|cheap|affordable|under|buy online)\b/.test(s)) {
      return { score: -99, reasons: ['name matches but no buying intent'], reject: true };
    }
  }

  /* Purely informational / reference queries. */
  if (/\b(images?|meaning|story|history|dictionary|wikipedia|wiki|how to care|named after|after teddy|theodore|birth year|invention|who invented)\b/.test(s)) {
    return { score: -99, reasons: ['informational, not a purchase query'], reject: true };
  }

  /* Delivery-tracking and logistics questions. Someone asking how long delivery
     takes is not ready to buy, and we have no page that answers it. */
  if (/(delivery time|how long does|shipping time|track (my|order)|order status|return policy|refund)/.test(s)) {
    return { score: -99, reasons: ['logistics question, not buying intent'], reject: true };
  }

  if (group.requireCity && !cityMatches(suggestion, group.name)) {
    return { score: -99, reasons: ['does not name the city'], reject: true };
  }
  if (group.requireTerm && !new RegExp('\\b' + normTerm(group.requireTerm) + '\\b').test(s)) {
    return { score: -99, reasons: ['does not contain the product term'], reject: true };
  }
  if (ARTIFACT.test(suggestion)) {
    return { score: -99, reasons: ['malformed suggestion'], reject: true };
  }
  if (SYMBOL.test(suggestion)) {
    return { score: -99, reasons: ['currency symbol in query'], reject: true };
  }
  if (BRAND.test(s) || BRAND_SUFFIX.test(s)) {
    return { score: -99, reasons: ['competitor or shop brand'], reject: true };
  }
  if (IMPOSSIBLE.test(s)) {
    return { score: -99, reasons: ['speed promise we cannot meet'], reject: true };
  }
  if (OFF_MARKET_COUNTRY.test(s) || OFF_MARKET_CITY.test(s) || OFF_MARKET_ABBR.test(s) || OFF_MARKET_PLACE.test(s) || OFF_MARKET_TOPIC.test(s) || FOOD_ORDERING.test(s)) {
    return { score: -99, reasons: ['outside the Indian delivery market'], reject: true };
  }
  if (STALE_YEAR.test(s)) {
    return { score: -99, reasons: ['stale year in query'], reject: true };
  }
  if (FRANCHISE.test(s)) {
    return { score: -99, reasons: ['franchise merchandise we do not stock'], reject: true };
  }
  if (/^(who|what|how|why|when|where|can|is|do|does|are)\b/.test(s) && w.length <= 4) {
    return { score: -99, reasons: ['generic question, no buying intent'], reject: true };
  }
  if (/(free|download|job|career|salary|wiki|movie|photo|hd|wallpaper|crack|apk|login|sign in|amazon)/.test(s)) {
    return { score: -99, reasons: ['off-intent'], reject: true };
  }

  if (w.length >= 3 && w.length <= 7) { score += 2; reasons.push('right length'); }
  if (/(near me|under \d|price|cheap|best|online|same day|midnight|delivery|order|buy|today|home)/.test(s)) { score += 2; reasons.push('commercial intent'); }
  if (/\d/.test(s)) { score += 1; reasons.push('has modifier'); }
  if (w.length < 3) { score -= 2; reasons.push('too broad/short'); }
  if (w.length > 7) { score -= 1; reasons.push('too long'); }

  const sNorm = normTerm(seed);
  const overlap = w.filter((x) => sNorm.includes(x)).length;
  if (overlap >= 2) { score += 1; reasons.push('on-topic'); }

  return { score, reasons };
}

async function harvestGroup(groups, liveKeywords, label) {
  const results = [];
  let done = 0;
  const total = groups.length;
  for (const g of groups) {
    const found = new Map();
    const rejected = [];
    for (const seed of g.seeds) {
      const sugg = await suggest(seed);
      for (const s of sugg) {
        const n = norm(s);
        if (!n || found.has(n)) continue;
        if (liveKeywords.has(n)) continue;          // already live sitewide
        const j = judge(s, seed, g);
        if (j.reject || j.score < 3) { rejected.push({ keyword: s.trim(), why: j.reasons[0] }); continue; }
        found.set(n, { keyword: s.trim(), score: j.score, reasons: j.reasons, seed });
      }
      await sleep(DELAY_MS);
    }
    const ranked = [...found.values()].sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
    const out = { ...g, keywords: ranked.slice(0, 12) };
    delete out.seeds;
    results.push(out);
    done++;
    if (done % 10 === 0 || done === total) {
      process.stdout.write('  ' + label + ' ' + done + '/' + total + '\r');
    }
  }
  process.stdout.write(' '.repeat(40) + '\r');
  return results;
}

async function main() {
  console.log('=== keyword harvest (READ-ONLY) ===\n');
  const liveKeywords = collectSitewideKeywords();
  console.log('  keywords already live sitewide : ' + liveKeywords.size);
  console.log('  (anything already present is excluded, so every row here is NEW)\n');

  const out = {
    generatedFrom: 'Google autosuggest (suggestqueries.google.com, gl=in)',
    generatedAt: new Date().toISOString(),
    note: 'PROPOSAL ONLY. No page was modified. Nothing here is applied until reviewed.',
    existingKeywordCount: liveKeywords.size,
    cities: [],
    products: [],
    clusters: [],
  };

  if (only === 'all' || only === 'cities') {
    let cities = citySeeds();
    if (cityLimit) cities = cities.slice(0, cityLimit);
    console.log('  harvesting ' + cities.length + ' city pages...');
    out.cities = await harvestGroup(cities, liveKeywords, 'cities');
  }

  if (only === 'all' || only === 'products') {
    const products = productSeeds();
    console.log('  harvesting ' + products.length + ' product pages...');
    out.products = await harvestGroup(products, liveKeywords, 'products');
  }

  /* Enforce the one-owner-per-term rule from c84264f6.
     A category head term ("buy teddy bear online") belongs to the category page,
     not to all 4 teddy product pages. Product pages may only keep terms that are
     genuinely their own: named after the product, or long-tail enough to be
     unambiguous. Anything shared by more than one page, or owned by a cluster,
     is dropped and reported.

     Also rejects queries naming a country Giftora does not deliver to. */
  if (out.products.length) {
    const OFFSITE = /\b(pakistan|dubai|abu dhabi|sri lanka|bangladesh|nepal|usa|uk|canada|australia|new zealand|germany|france|uae|qatar|saudi|kuwait|oman|bahrain|malaysia|singapore|indonesia|philippines|ghana|kenya|nigeria|south africa)\b/;
    let droppedShared = 0, droppedCluster = 0, droppedOffsite = 0;

    const seen = new Map();
    for (const p of out.products) {
      for (const k of p.keywords) {
        const n = norm(k.keyword);
        seen.set(n, (seen.get(n) || 0) + 1);
      }
    }
    const clusterOwns = new Set();
    clusterSeeds().forEach((c) => { c.seeds.forEach((s) => clusterOwns.add(norm(s))); });

    for (const p of out.products) {
      const keep = [];
      for (const k of p.keywords) {
        const n = norm(k.keyword);
        if (OFFSITE.test(n)) { droppedOffsite++; continue; }
        if (seen.get(n) > 1) { droppedShared++; continue; }
        if (clusterOwns.has(n)) { droppedCluster++; continue; }
        keep.push(k);
      }
      p.keywords = keep;
      p.dropped = { shared: p.keywords.length, offsite: droppedOffsite };
    }
    console.log('\n  one-owner-per-term filter:');
    console.log('    dropped shared by N products : ' + droppedShared);
    console.log('    dropped owned by a cluster    : ' + droppedCluster);
    console.log('    dropped wrong-country queries : ' + droppedOffsite);
  }

  if (only === 'all' || only === 'clusters') {
    const clusters = clusterSeeds();
    console.log('  harvesting ' + clusters.length + ' clusters...');
    out.clusters = await harvestGroup(clusters, liveKeywords, 'clusters');
  }

  /* Route harvested terms to their correct owner.
     A cluster term that names one of our 99 cities belongs to that city's page,
     not to the category page. Without this the cakes cluster would own
     "cake delivery noida" while gift-delivery-noida.html owns nothing for it. */
  {
    const byCity = new Map(out.cities.map((c) => [norm(c.name), c]));
    let routed = 0;
    for (const cl of out.clusters) {
      const keep = [];
      for (const k of cl.keywords) {
        const hit = [...CITY_NAMES].find((cn) => normTerm(k.keyword).includes(normTerm(cn)));
        if (hit) {
          const target = byCity.get(norm(hit));
          if (target) {
            const n = norm(k.keyword);
            if (!target.keywords.some((x) => norm(x.keyword) === n)) {
              target.keywords.push({ keyword: k.keyword, score: k.score, reasons: k.reasons, seed: k.seed, routedFrom: 'cluster:' + cl.cluster });
              routed++;
            }
          }
          continue;
        }
        keep.push(k);
      }
      cl.keywords = keep;
    }
    console.log('    routed to owning city page : ' + routed);
  }

  /* Final safety net: no term may appear on two pages, whoever proposed it. */
  {
    const ownerOf = new Map();
    const claim = (kw, file) => {
      const n = norm(kw);
      if (!ownerOf.has(n)) ownerOf.set(n, file);
      return ownerOf.get(n) === file;
    };
    const clean = (arr, fileOf) => arr.map((x) => {
      const f = fileOf(x);
      if (!x.keywords || !Array.isArray(x.keywords)) return x;
      if (x.keywords.every((k) => claim(k.keyword, f))) return x;
      x.keywords = x.keywords.filter((k) => k && k.keyword && claim(k.keyword, f));
      return x;
    });
    out.cities = clean(out.cities, (c) => c.file);
    out.products = clean(out.products, (p) => p.file);
    out.clusters = clean(out.clusters, (c) => 'cluster:' + c.cluster);
    const dups = out.cities.concat(out.products, out.clusters)
      .reduce((a, x) => a + x.keywords.length, 0);
    console.log('    terms after dedupe          : ' + dups);
  }

  /* Collapse near-duplicates.
     Google treats "cake delivery in dehradun", "online cake delivery in
     dehradun" and "best online cake delivery in dehradun" as the same query.
     Keeping all three spends keyword slots on one intent and reads as padding, so
     only the shortest form of each base query is kept. */
  {
    const base = (s) => normTerm(s)
      .replace(/\b(under|best|online|in)\b/g, '')
      .replace(/\s+/g, ' ').replace(/\s+s$/, '').trim();
    let collapsed = 0;
    const allGroups = []
      .concat(out.cities.map((c) => ({ node: c, arr: 'cities' })))
      .concat(out.products.map((c) => ({ node: c, arr: 'products' })))
      .concat(out.clusters.map((c) => ({ node: c, arr: 'clusters' })));
    for (const { node } of allGroups) {
      if (!Array.isArray(node.keywords)) continue;
      const byBase = new Map();
      for (const k of node.keywords) {
        const b = base(k.keyword);
        const prev = byBase.get(b);
        /* prefer the shorter, plainer phrasing */
        if (!prev || k.keyword.length < prev.keyword.length) byBase.set(b, k);
      }
      const kept = [...new Set(byBase.values())];
      collapsed += node.keywords.length - kept.length;
      node.keywords = kept;
    }
    console.log('    collapsed near-duplicates  : ' + collapsed);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

  const total = out.cities.length + out.products.length + out.clusters.length;
  const kw = out.cities.concat(out.products, out.clusters).reduce((a, x) => a + x.keywords.length, 0);
  console.log('\n=== summary ===');
  console.log('  targets            : ' + total);
  console.log('  new keywords found : ' + kw);
  console.log('  written            : seo/keyword-proposal.json');
  console.log('\n  PROPOSAL ONLY — no page was modified. Review the JSON, then apply by hand or with a follow-up script.');
}

main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
