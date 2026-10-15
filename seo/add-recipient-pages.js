#!/usr/bin/env node
/**
 * seo/add-recipient-pages.js  (local build helper)
 *
 * Creates "gifts for <recipient>" collection pages by cloning the thank-you
 * occasion page (same shell: nav, footer, budget / category / delivery
 * sections) and rewriting every thank-you-specific block:
 *   SEO meta block, <title>, meta description, JSON-LD (Breadcrumb /
 *   Collection / FAQ), the Speakable WebPage block, <body data-occasion>,
 *   breadcrumb, hero media / flag / h1 / subtitle, "Popular" H2, base FAQ and
 *   the closing banner.
 *
 * The GUIDE block + guide FAQ are left blank for seo/enrich-categories.js to
 * fill from seo/guide-content.json (source of truth).
 *
 * It also appends the four new links to the shared "Occasions" nav dropdown in
 * every HTML file (that dropdown is how occasion pages get their inbound
 * links, so the new pages are not orphans).
 *
 * IMPORTANT — after running this you MUST also run, in order:
 *   node seo/enrich-categories.js      (fills the GUIDE block + guide FAQ from
 *                                       seo/guide-content.json)
 *   node seo/inject-static-links.js    (fills the raw-HTML product links)
 *   node seo/apply-seo.js              (regenerates sitemap.xml — the pages are
 *                                       listed in seo/keywords.json sitemapOnly)
 *   node seo/pre-deploy-check.js       (must print RESULT: OK)
 * Re-running this script re-clones the template, so it wipes the enrich/link
 * steps; always follow it with the four commands above.
 *
 * Idempotent: re-running replaces the same anchored blocks and skips nav links
 * that already exist.
 *
 * Usage: node seo/add-recipient-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://gift-ora.online';
const TEMPLATE = path.join(ROOT, 'thank-you-gifts.html');
const OG_IMAGE = SITE + '/uploads/occasion-gifts.webp';
const OG_W = '960';
const OG_H = '640';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PAGES = [
  {
    slug: 'gifts-for-men',
    title: 'Gifts for Men — Shoes, Belts, Sunglasses & Style Gifts | Giftora',
    metaDesc:
      "Shop gifts for men at Giftora — men's shoes, genuine leather belts, sunglasses and grooming combos delivered across India, same-day in Delhi NCR.",
    keywords:
      'gifts for men, gifts for him, men gift ideas, mens shoes online, leather belt gift, sunglasses for men, grooming gift combo, birthday gift for husband, anniversary gift for him, gift delivery for him',
    breadcrumbName: 'Gifts for Men',
    collectionName: 'Gifts for Men',
    collectionDesc:
      "Gifts for men with delivery across India — men's shoes, leather belts, sunglasses and grooming-and-style combos.",
    flag: '👔 Gifts for Men',
    h1: 'Gifts for <span class="text-gradient">him</span>',
    heroSub:
      "Practical, stylish gifts for the men in your life — men's shoes, genuine leather belts, sunglasses and grooming combos, delivered across India with a personalised note.",
    popularH2: 'Popular <span class="text-gradient">gifts for men</span>',
    intlH2: 'Find the right gift for him',
    intlBtn: 'Browse Gifts for Men',
    baseFaqs: [
      [
        'What are good gifts for men?',
        "Popular gifts for men include men's shoes, genuine leather belts, sunglasses and grooming-and-style combos — all available at Giftora with delivery across India.",
      ],
      [
        'Can I add a message to a gift for him?',
        'Yes. Every gift for men is delivered with a personalised card carrying your message.',
      ],
      [
        'Do you deliver gifts for men across India?',
        'Yes. Giftora delivers to all metro and major cities across India with express courier and same-day delivery in Delhi NCR and major metros.',
      ],
    ],
  },
  {
    slug: 'gifts-for-women',
    title: 'Gifts for Women — Jewellery, Flowers & Teddies | Giftora',
    metaDesc:
      'Shop gifts for women at Giftora — jewellery, fresh flower bouquets, teddy bears and elegant gift sets delivered across India, same-day in Delhi NCR.',
    keywords:
      'gifts for women, gifts for her, women gift ideas, jewellery gift, flowers for her, teddy bear gift, birthday gift for wife, anniversary gift for her, gift delivery for her',
    breadcrumbName: 'Gifts for Women',
    collectionName: 'Gifts for Women',
    collectionDesc:
      'Gifts for women with delivery across India — jewellery, fresh flowers, teddy bears and thoughtful gift sets.',
    flag: '💐 Gifts for Women',
    h1: 'Gifts for <span class="text-gradient">her</span>',
    heroSub:
      'Thoughtful gifts she will love — delicate jewellery, fresh flower bouquets and soft teddy bears, delivered across India with a personalised note.',
    popularH2: 'Popular <span class="text-gradient">gifts for women</span>',
    intlH2: 'Find the right gift for her',
    intlBtn: 'Browse Gifts for Women',
    baseFaqs: [
      [
        'What are good gifts for women?',
        'Popular gifts for women include jewellery, fresh flower bouquets, teddy bears and gift combos — all available at Giftora with delivery across India.',
      ],
      [
        'Can I add a message to a gift for her?',
        'Yes. Every gift for women is delivered with a personalised card carrying your message.',
      ],
      [
        'Do you deliver gifts for women across India?',
        'Yes. Giftora delivers to all metro and major cities across India with express courier and same-day delivery in Delhi NCR and major metros.',
      ],
    ],
  },
  {
    slug: 'gifts-for-kids',
    title: 'Gifts for Kids — Toys, Ride-Ons & Teddies | Giftora',
    metaDesc:
      'Shop gifts for kids at Giftora — safe toys, ride-on cars, cycles and soft teddy bears delivered across India, same-day in Delhi NCR.',
    keywords:
      'gifts for kids, kids toys online, gift for child, ride on car for kids, kids cycle, teddy bear for kids, birthday gift for kids, toys delivery India, gift for son, gift for daughter',
    breadcrumbName: 'Gifts for Kids',
    collectionName: 'Gifts for Kids',
    collectionDesc:
      'Gifts for kids with delivery across India — toys, ride-ons, cycles and soft teddy bears.',
    flag: '🧸 Gifts for Kids',
    h1: 'Gifts for <span class="text-gradient">kids</span>',
    heroSub:
      'Toys, ride-ons, cycles and soft teddies — safe, fun gifts for children, delivered across India with a personalised note.',
    popularH2: 'Popular <span class="text-gradient">gifts for kids</span>',
    intlH2: "Make a child's day",
    intlBtn: 'Browse Gifts for Kids',
    baseFaqs: [
      [
        'What are good gifts for kids?',
        'Popular gifts for kids include ride-on cars, bicycles and soft teddy bears — all available at Giftora with delivery across India.',
      ],
      [
        "Can I choose a gift suitable for a child's age?",
        'Yes. Our toys range covers ride-ons, cycles and soft teddies for different ages, and our team can help you pick on WhatsApp.',
      ],
      [
        'Do you deliver gifts for kids across India?',
        'Yes. Giftora delivers to all metro and major cities across India with express courier and same-day delivery in Delhi NCR and major metros.',
      ],
    ],
  },
  {
    slug: 'gifts-for-girlfriend',
    title: 'Gifts for Girlfriend — Flowers, Cakes & Romantic Combos | Giftora',
    metaDesc:
      'Shop gifts for your girlfriend at Giftora — fresh roses, cakes and romantic gift combos delivered across India, same-day in Delhi NCR, with a personalised note.',
    keywords:
      'gifts for girlfriend, romantic gifts, roses for girlfriend, cake for girlfriend, girlfriend birthday gift, anniversary gift for girlfriend, surprise gift for girlfriend, red roses delivery, romantic combo, gift delivery India',
    breadcrumbName: 'Gifts for Girlfriend',
    collectionName: 'Gifts for Girlfriend',
    collectionDesc:
      'Romantic gifts for your girlfriend with delivery across India — red roses, cakes and surprise combos.',
    flag: '❤️ Gifts for Girlfriend',
    h1: 'Gifts for your <span class="text-gradient">girlfriend</span>',
    heroSub:
      'Fresh roses, indulgent cakes and romantic combos — thoughtful surprises for your girlfriend, delivered across India with a personalised note.',
    popularH2:
      'Popular <span class="text-gradient">gifts for your girlfriend</span>',
    intlH2: 'Plan a surprise she will remember',
    intlBtn: 'Browse Gifts for Girlfriend',
    baseFaqs: [
      [
        'What is a good gift for a girlfriend?',
        'Popular gifts for a girlfriend include fresh red roses, cakes and romantic gift combos — all available at Giftora with delivery across India.',
      ],
      [
        'Can I send a surprise gift to my girlfriend?',
        'Yes. Order online or on WhatsApp and we deliver with a personalised note, with same-day delivery in Delhi NCR and major metros.',
      ],
      [
        'Do you deliver gifts for a girlfriend across India?',
        'Yes. Giftora delivers to all metro and major cities across India with express courier and same-day delivery in Delhi NCR and major metros.',
      ],
    ],
  },
];

function buildSeoBlock(page) {
  const url = `${SITE}/${page.slug}.html`;
  const ogTitle = page.title.replace(/ \| Giftora$/, '');
  const lines = [
    '<!-- SEO-BLOCK-START -->',
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    `<meta name="keywords" content="${esc(page.keywords)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:site_name" content="Giftora">',
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(page.metaDesc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:image:width" content="${OG_W}">`,
    `<meta property="og:image:height" content="${OG_H}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="en_IN">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(page.title.replace(/ \| Giftora$/, ''))}">`,
    `<meta name="twitter:description" content="${esc(page.metaDesc)}">`,
    '<!-- SEO-BLOCK-END -->',
  ];
  return lines.join('\n');
}

function jsonld(page) {
  const url = SITE + '/' + page.slug + '.html';
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: page.breadcrumbName, item: url },
    ],
  };
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.collectionName,
    description: page.collectionDesc,
    url,
    isPartOf: { '@type': 'WebSite', name: 'Giftora', url: SITE },
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.baseFaqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
  return (
    '<!-- SEO-JSONLD-START -->\n<script type="application/ld+json">\n' +
    JSON.stringify([breadcrumb, collection, faq], null, 2) +
    '\n</script>\n<!-- SEO-JSONLD-END -->'
  );
}

function speakable(page) {
  const url = SITE + '/' + page.slug + '.html';
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url + '#speakable',
    url,
    name: page.title.replace(/ \| Giftora$/, ''),
    inLanguage: 'en-IN',
    dateModified: '2026-10-15',
    isPartOf: { '@type': 'WebSite', '@id': SITE + '/#website' },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#faq .faq-list'],
    },
  };
  return (
    '<!-- SITEWIDE-SPEAKABLE-SCHEMA -->\n<script type="application/ld+json">\n' +
    JSON.stringify(obj, null, 2) +
    '\n</script>'
  );
}

function faqBlock(page) {
  const items = page.baseFaqs
    .map(
      ([q, a], i) =>
        `\t\t\t\t<details class="faq-item"${i === 0 ? ' open' : ''}>\n\t\t\t\t\t<summary>${esc(
          q
        )}</summary>\n\t\t\t\t\t<p>${esc(a)}</p>\n\t\t\t\t</details>`
    )
    .join('\n');
  return `\t\t\t<div class="faq-list">\n${items}`;
}

function build(page) {
  let h = fs.readFileSync(TEMPLATE, 'utf8');
  const before = h;

  h = h.replace(
    /<!-- SEO-BLOCK-START -->[\s\S]*?<!-- SEO-BLOCK-END -->/,
    buildSeoBlock(page)
  );
  h = h.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${esc(page.metaDesc)}">`
  );
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  h = h.replace(
    /<!-- SEO-JSONLD-START -->[\s\S]*?<!-- SEO-JSONLD-END -->/,
    jsonld(page)
  );
  h = h.replace(
    /<!-- SITEWIDE-SPEAKABLE-SCHEMA -->[\s\S]*?<\/script>/,
    speakable(page)
  );
  h = h.replace(
    /<body data-page="occasion" data-occasion="thank-you-gifts">/,
    `<body data-page="occasion" data-occasion="${page.slug}">`
  );
  h = h.replace(
    /<p class="breadcrumb">[\s\S]*?<\/p>/,
    `<p class="breadcrumb"><a href="/">Home</a> &rsaquo; ${esc(
      page.breadcrumbName
    )}</p>`
  );
  h = h.replace(
    /<div class="festival-hero-media" id="festivalHeroMedia">[\s\S]*?<\/div>/,
    `<div class="festival-hero-media" id="festivalHeroMedia">\n\t\t\t\t\t<img src="/uploads/occasion-gifts.webp" width="${OG_W}" height="${OG_H}" alt="${esc(
      page.collectionName
    )} at Giftora" loading="lazy">\n\t\t\t\t</div>`
  );
  h = h.replace(
    /<div class="festival-hero-copy">[\s\S]*?<\/div>/,
    `<div class="festival-hero-copy">\n\t\t\t\t\t<span class="festival-flag">${
      page.flag
    }</span>\n\t\t\t\t\t<h1>${page.h1}</h1>\n\t\t\t\t\t<p class="festival-subtitle">${esc(
      page.heroSub
    )}</p>\n\t\t\t\t\t<a href="#shop" class="btn btn-primary">Shop Gifts</a>\n\t\t\t\t</div>`
  );
  h = h.replace(
    /<h2>Popular <span class="text-gradient">thank you gifts<\/span><\/h2>/,
    `<h2>${page.popularH2}</h2>`
  );
  h = h.replace(
    /<div class="faq-list">[\s\S]*?<!-- GUIDE-FAQ-START -->/,
    `${faqBlock(page)}\n\t\t\t\t<!-- GUIDE-FAQ-START -->`
  );
  // blank the page-specific guide FAQs too — enrich-categories.js refills them
  h = h.replace(
    /<!-- GUIDE-FAQ-START -->[\s\S]*?<!-- GUIDE-FAQ-END -->/,
    '<!-- GUIDE-FAQ-START -->\n\t\t\t\t\t<!-- (filled by seo/enrich-categories.js from seo/guide-content.json) -->\n\t\t\t\t<!-- GUIDE-FAQ-END -->'
  );
  h = h.replace(
    /<h2>About <span class="text-gradient">thank you gifts<\/span><\/h2>/,
    `<h2>About <span class="text-gradient">${esc(
      page.breadcrumbName.toLowerCase()
    )}</span></h2>`
  );
  h = h.replace(
    /<section class="intl-banner">[\s\S]*?<\/section>/,
    `<section class="intl-banner">\n\t\t\t<div class="container">\n\t\t\t\t<h2>${esc(
      page.intlH2
    )}</h2>\n\t\t\t\t<p>Order online or on WhatsApp and we deliver with a personalised note from you.</p>\n\t\t\t\t<a href="#shop" class="btn btn-primary">${esc(
      page.intlBtn
    )}</a>\n\t\t\t</div>\n\t\t</section>`
  );

  // The guide block still holds thank-you copy — blank its internals so a
  // missed enrich run is obvious instead of silently wrong.
  h = h.replace(
    /<!-- GUIDE-BLOCK-START -->[\s\S]*?<!-- GUIDE-BLOCK-END -->/,
    '<!-- GUIDE-BLOCK-START -->\n\t<!-- (filled by seo/enrich-categories.js from seo/guide-content.json) -->\n\t<!-- GUIDE-BLOCK-END -->'
  );

  if (h === before) throw new Error('no replacements applied for ' + page.slug);

  // Guard: nothing thank-you-specific may survive outside the shared markup
  // (nav item, occasions card, checkout note, thank-you page link).
  const SHARED = [
    /href="thank-you-gifts\.html"/,
    />Thank You Gifts<\/h3>/,
    /Shop thank-you gifts/,
    /Thank you for everything/,
    /Thank you for shopping with Giftora/,
  ];
  const leaks = h
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /thank you|thank-you/i.test(line))
    .filter(([, line]) => !SHARED.some((re) => re.test(line)));
  if (leaks.length) {
    throw new Error(
      page.slug +
        ': thank-you copy leaked at line(s) ' +
        leaks.map(([n]) => n).join(', ') +
        '\n' +
        leaks.map(([n, l]) => n + ': ' + l.trim()).join('\n')
    );
  }

  return h;
}

// ---- run: write the four pages -------------------------------------------
let created = 0;
for (const page of PAGES) {
  const out = build(page);
  fs.writeFileSync(path.join(ROOT, page.slug + '.html'), out, 'utf8');
  console.log(`CREATED ${page.slug}.html (${out.length} bytes)`);
  created++;
}

// ---- run: append the four links to the shared Occasions dropdown ---------
const NAV_ITEMS = PAGES.map(
  (p) =>
    `<li><a href="${p.slug}.html">${p.flag.split(' ')[0]} ${p.breadcrumbName}</a></li>`
).join('\n\t\t\t\t\t');
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let navTouched = 0;
let navSkipped = 0;
for (const f of files) {
  const full = path.join(ROOT, f);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('href="gifts-for-men.html"')) {
    navSkipped++;
    continue;
  }
  const anchor = '<a href="occasion-gifts.html">Occasions</a>';
  const ai = html.indexOf(anchor);
  if (ai === -1) {
    navSkipped++;
    continue;
  }
  const ulEnd = html.indexOf('</ul>', ai);
  if (ulEnd === -1) {
    navSkipped++;
    continue;
  }
  html = html.slice(0, ulEnd) + '\t' + NAV_ITEMS + '\n\t\t\t\t' + html.slice(ulEnd);
  fs.writeFileSync(full, html, 'utf8');
  navTouched++;
}
console.log(`Nav: added links to ${navTouched} pages, skipped ${navSkipped}.`);
console.log(`Done: ${created} pages created.`);
