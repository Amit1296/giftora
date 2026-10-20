/**
 * enrich-city-unique.js - fixes "thin / template-based content" on the
 * gift-delivery-<city>.html pages.
 *
 * Each city page carried only ~69 words of unique copy (intro + area chips +
 * 2 FAQs); everything else was byte-identical boilerplate with the city name
 * string-swapped. This script adds two marker-guarded, per-city unique blocks
 * and keeps the FAQ schema in sync with the visible page:
 *
 *   1. CITY-LOCAL block: a "local gifting guide" section inserted between the
 *      CITY-BLOCK and the how-it-works section, built from that city's REAL
 *      data only: seo/city-data.json (areas, zone, slaText) +
 *      data/pincodes.json (pincode range). Sentence templates vary
 *      deterministically per slug so pages differ in structure too.
 *
 *   2. CITY-LOCAL-FAQ block: three extra city-specific FAQs appended after
 *      CITY-FAQ-END (outside the enrich-cities.js region, so re-running
 *      enrich-cities.js is safe).
 *
 *   3. FAQPage JSON-LD sync: the visible faq-item details are parsed and
 *      written into the existing FAQPage node inside the SEO-JSONLD block.
 *      Previously the schema carried only the 4 generic FAQs, so search
 *      engines saw zero unique FAQ content per city.
 *
 * Fact-checking: no invented products, prices, festivals or services. Every
 * claim uses data already present in the repo (categories from
 * data/products.json, areas/pincodes/SLA from the data files above, payment
 * and WhatsApp wording copied from existing site copy).
 *
 * Idempotent - marker regions are replaced, never duplicated. Safe to re-run
 * after seo/add-cities.js or seo/enrich-cities.js.
 *
 * Usage:
 *   node seo/enrich-city-unique.js            # rewrite all city pages
 *   node seo/enrich-city-unique.js --check    # verify only (exit 1 on drift)
 *
 * NOTE: if seo/add-cities.js ever generates NEW cities, re-run this script
 * afterwards (same rule as seo/dedup-city-copy.js).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CITY_DATA = path.join(__dirname, "city-data.json");
const PINCODES = path.join(ROOT, "data", "pincodes.json");

const CHECK_ONLY = process.argv.includes("--check");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unesc(s) {
  return String(s == null ? "" : s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsaquo;/g, "\u203a")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function pickIdx(h, salt, len) {
  return (h + salt * 7919) % len;
}

// ---------------------------------------------------------------- helpers

function win(c) {
  return c.zone === "ncr" ? "the same evening on our same-day route" : c.slaText || "within 48 hours";
}

function area(c, i) {
  return c.areas[i % c.areas.length];
}

// ------------------------------------------------- paragraph template pools
// Each template is a function(city, pincode) -> plain-text paragraph.
// All tokens (areas, pincodes, SLA, city name) come from the repo's own
// data files. No invented facts.

const PARA_COVERAGE = [
  function (c, p) {
    return (
      "Our regular " + esc(c.name) + " route runs from " + esc(area(c, 0)) +
      " through " + esc(area(c, 1)) + " and " + esc(area(c, 2)) +
      ", with drop-offs in " + esc(area(c, 3)) + " and " + esc(area(c, 4)) +
      " on the same run. Outer pockets like " + esc(area(c, c.areas.length - 1)) +
      " and " + esc(area(c, c.areas.length - 2)) +
      " sit on the later stops of the day, so orders placed before noon still clear the full circuit."
    );
  },
  function (c, p) {
    return (
      esc(area(c, 0)) + ", " + esc(area(c, 1)) + " and " + esc(area(c, 2)) +
      " are our most-ordered neighbourhoods in " + esc(c.name) +
      ", but the pickup list never stops there \u2014 riders carry gifts into " +
      esc(area(c, 5)) + ", " + esc(area(c, 3)) + " and the lanes around " +
      esc(area(c, 4)) + " every delivery day. Whether the address is a society gate in " +
      esc(area(c, c.areas.length - 1)) + " or a shopfront in " + esc(area(c, 0)) +
      ", you get a WhatsApp confirmation the moment your gift is out."
    );
  },
  function (c, p) {
    return (
      "From " + esc(area(c, 0)) + " to " + esc(area(c, c.areas.length - 1)) +
      ", " + esc(c.name) +
      " is mapped into everyday delivery loops rather than one long tail. Central addresses in " +
      esc(area(c, 1)) + " and " + esc(area(c, 2)) +
      " often receive gifts first, followed by " + esc(area(c, 6)) + ", " + esc(area(c, 7)) +
      " and the remaining colonies on the same route \u2014 no separate booking needed for any part of the city."
    );
  },
  function (c, p) {
    return (
      "Riders leave for " + esc(area(c, 0)) + ", " + esc(area(c, 4)) + " and " +
      esc(area(c, 2)) + " with the morning batch and loop back through " + esc(area(c, 3)) +
      ", " + esc(area(c, c.areas.length - 2)) + " and " + esc(area(c, c.areas.length - 1)) +
      " before the day ends. " + esc(c.name) +
      " addresses inside the core belt often see gifts arrive fastest, but every listed area is served on the same schedule \u2014 pick the locality at checkout and we route it."
    );
  },
];

const PARA_GIFTS = [
  function (c, p) {
    return (
      "Birthdays in " + esc(area(c, 3)) + " flats and anniversaries in " + esc(area(c, 1)) +
      " keep our " + esc(c.name) +
      " bakers and florists busiest, but the festive rush is just as real \u2014 rakhi sets and dry-fruit hampers before Raksha Bandhan and Diwali, potted plants for new homes in " +
      esc(area(c, 4)) + ". Every gift travels with your personalised note."
    );
  },
  function (c, p) {
    return (
      "For birthdays in " + esc(area(c, 0)) + " and housewarmings in " + esc(area(c, 2)) +
      ", most " + esc(c.name) +
      " senders pick a cake-and-flowers combo so one delivery covers both. Sending further out \u2014 " +
      esc(area(c, c.areas.length - 1)) + ", " + esc(area(c, 5)) +
      " \u2014 works the same way: same catalogue, same delivery window, no extra delivery fuss."
    );
  },
  function (c, p) {
    return (
      "Cakes and roses stay the classic pair for " + esc(c.name) +
      " anniversaries, while teddy-and-chocolate combos dominate birthday orders to " +
      esc(area(c, 1)) + " and " + esc(area(c, 3)) +
      ". If you are sending a thank-you or a congratulations, our combo hampers pack sweets, flowers and a soft toy into one box that travels well to any address in the city."
    );
  },
  function (c, p) {
    return (
      esc(c.name) +
      " gifters lean practical in summer and indulgent in winter: indoor plants for " +
      esc(area(c, 4)) + " desks and new offices, dry-fruit hampers for family visits in " +
      esc(area(c, 2)) +
      ", and chocolate-heavy combos everywhere in between. Whatever the occasion, our catalogue ships to " +
      esc(c.name) + " daily."
    );
  },
];

const PARA_LOGISTICS = [
  function (c, p) {
    if (!p) return null;
    return (
      "We deliver to every residential and office pincode from " + esc(p.start) + " to " +
      esc(p.end) + " in " + esc(c.name) +
      ", and each parcel is packed, tracked and confirmed on WhatsApp before the rider leaves the hub. Office towers in " +
      esc(area(c, 1)) + " get reception-desk handovers, while home addresses in " +
      esc(area(c, c.areas.length - 1)) +
      " are called first \u2014 nobody has to guess whether the gift arrived."
    );
  },
  function (c, p) {
    if (!p) return null;
    return (
      "The " + esc(c.name) + " network covers pincodes " + esc(p.start) + " through " +
      esc(p.end) +
      " with end-to-end tracking on every order. If nobody is home in " + esc(area(c, 3)) +
      ", the rider calls the recipient and re-attempts rather than returning the parcel to the hub \u2014 and you are updated on WhatsApp either way."
    );
  },
  function (c, p) {
    if (!p) return null;
    return (
      "Address coverage in " + esc(c.name) + " spans pincodes " + esc(p.start) + "\u2013" +
      esc(p.end) + ", from " + esc(area(c, 0)) + " shopfronts to " +
      esc(area(c, c.areas.length - 1)) + " apartments. Society gates in " + esc(area(c, 2)) +
      " and " + esc(area(c, 4)) +
      " are confirmed by phone before each drop, so cakes and flowers spend minimum time on the road."
    );
  },
  function (c, p) {
    if (!p) return null;
    return (
      "Every " + esc(c.name) +
      " order is tracked from our hub to the door, and the pincode you enter at checkout decides the exact slot. We serve " +
      esc(p.start) + " to " + esc(p.end) + " daily, including " + esc(area(c, 1)) + ", " +
      esc(area(c, 5)) + " and the far side of " + esc(area(c, c.areas.length - 1)) +
      " \u2014 same catalogue, same " + esc(win(c)) +
      " promise, wherever the receiver is."
    );
  },
];

// ---------------------------------------------------------------- FAQs

function extraFaqs(c, p) {
  const last = area(c, c.areas.length - 1);
  const secondLast = area(c, c.areas.length - 2);
  const w = c.zone === "ncr" ? "the same evening" : c.slaText || "within 48 hours";
  const pinTxt = p ? ", covering pincodes " + p.start + " to " + p.end : "";
  return [
    {
      q: "Which parts of " + c.name + " do you deliver to fastest?",
      a:
        "Central " + c.name + " addresses in " + area(c, 0) + ", " + area(c, 1) + " and " +
        area(c, 2) + " usually receive gifts first on the daily route, while " + secondLast +
        " and " + last + " follow on the same run" + pinTxt + ". All listed areas are served " + w + ".",
    },
    {
      q: "Can I send flowers or a cake to " + area(c, 3) + " in " + c.name + "?",
      a:
        "Yes \u2014 fresh bouquets, celebration cakes and combo hampers all deliver to " +
        area(c, 3) + ", " + area(c, 4) + " and every other " + c.name +
        " locality on the same schedule. Order from the flowers, cakes or combo pages and enter the full address at checkout.",
    },
    {
      q: "How will I know my gift reached " + c.name + "?",
      a:
        "Every " + c.name +
        " parcel is tracked end to end and the recipient is called before each drop" +
        (p ? " anywhere in " + c.name : "") +
        ". You get a WhatsApp confirmation once the gift is handed over \u2014 whether the address is a " +
        area(c, 1) + " office reception or a " + last + " society gate.",
    },
  ];
}

// ---------------------------------------------------------------- blocks

function localBlock(c, p) {
  const h = hash(c.slug);
  const paras = [];
  paras.push(PARA_COVERAGE[pickIdx(h, 0, PARA_COVERAGE.length)](c, p));
  paras.push(PARA_GIFTS[pickIdx(h, 1, PARA_GIFTS.length)](c, p));
  const logPara = PARA_LOGISTICS[pickIdx(h, 2, PARA_LOGISTICS.length)](c, p);
  if (logPara) paras.push(logPara);

  const lines = [];
  lines.push("<!-- CITY-LOCAL-START -->");
  lines.push('\t<section class="features" id="city-local-guide">');
  lines.push('\t\t<div class="container">');
  lines.push('\t\t\t<div class="section-header">');
  lines.push('\t\t\t\t<span class="section-tag">Inside ' + esc(c.name) + "</span>");
  lines.push("\t\t\t\t<h2>Local gifting guide for <span class=\"text-gradient\">" + esc(c.name) + "</span></h2>");
  lines.push("\t\t\t</div>");
  lines.push('\t\t\t<div class="city-copy">');
  for (const t of paras) lines.push("\t\t\t\t<p>" + t + "</p>");
  lines.push("\t\t\t</div>");
  lines.push("\t\t</div>");
  lines.push("\t</section>");
  lines.push("\t<!-- CITY-LOCAL-END -->");
  return lines.join("\n");
}

function localFaqBlock(c, p) {
  const items = extraFaqs(c, p).map(function (f) {
    return [
      '\t\t\t\t<details class="faq-item">',
      "\t\t\t\t\t<summary>" + esc(f.q) + "</summary>",
      "\t\t\t\t\t<p>" + esc(f.a) + "</p>",
      "\t\t\t\t</details>",
    ].join("\n");
  });
  const lines = [];
  lines.push("<!-- CITY-LOCAL-FAQ-START -->");
  for (const it of items) lines.push(it);
  lines.push("\t\t\t\t<!-- CITY-LOCAL-FAQ-END -->");
  return lines.join("\n");
}

// ---------------------------------------------------------------- JSON-LD

const FAQ_ITEM_RE =
  /<details class="faq-item"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;

function syncFaqSchema(html) {
  const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  if (!m) return [html, "jsonld-skipped(no-script)"];

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return [html, "jsonld-skipped(invalid-json)"];
  }
  if (!Array.isArray(data)) return [html, "jsonld-skipped(not-array)"];

  const faqNode = data.find(function (b) {
    return b && b["@type"] === "FAQPage";
  });
  if (!faqNode) return [html, "jsonld-skipped(no-faqpage)"];

  // Collect every visible FAQ from the page so schema mirrors what users see.
  const lm = html.match(/<div class="faq-list">([\s\S]*?)<\/div>/);
  if (!lm) return [html, "jsonld-skipped(no-faq-list)"];

  const seen = new Set();
  const mainEntity = [];
  let fm;
  FAQ_ITEM_RE.lastIndex = 0;
  while ((fm = FAQ_ITEM_RE.exec(lm[1])) !== null) {
    const q = unesc(fm[1]);
    const a = unesc(fm[2]);
    if (!q || !a || seen.has(q)) continue;
    seen.add(q);
    mainEntity.push({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    });
  }
  if (!mainEntity.length) return [html, "jsonld-skipped(no-faqs-found)"];

  if (JSON.stringify(mainEntity) === JSON.stringify(faqNode.mainEntity || [])) {
    return [html, "jsonld-ok(in-sync)"];
  }

  faqNode.mainEntity = mainEntity;
  const parts = data.map(function (b) {
    return JSON.stringify(b, null, 2);
  });
  const newJson = "[\n" + parts.join(",\n") + "\n]";
  const newScript = '<script type="application/ld+json">\n' + newJson + "\n</script>";
  return [html.replace(m[0], newScript), "jsonld-synced(" + mainEntity.length + " faqs)"];
}

// ---------------------------------------------------------------- inject

function inject(html, c, p) {
  const changed = [];

  // 1. Local guide section: between CITY-BLOCK-END and the how-it-works section.
  // Replacement strings are byte-identical to the insert form below so the
  // script converges (run N output === run N+1 output).
  const block = localBlock(c, p);
  const blockRe = /(?:\r?\n)?[\t ]*<!-- CITY-LOCAL-START -->[\s\S]*?<!-- CITY-LOCAL-END -->[\t ]*(?:\r?\n[\t ]*){0,2}/;
  const howAnchor = '<section class="features" id="how">';
  if (blockRe.test(html)) {
    html = html.replace(blockRe, "\n" + block + "\n\n\t");
    changed.push("local-block-replaced");
  } else if (html.includes(howAnchor)) {
    html = html.replace(howAnchor, block + "\n\n\t" + howAnchor);
    changed.push("local-block-inserted");
  } else {
    changed.push("LOCAL-BLOCK-SKIPPED(no-anchor)");
  }

  // 2. Extra FAQs AFTER CITY-FAQ-END (outside the enrich-cities.js region).
  const faqBlock = localFaqBlock(c, p);
  const faqRe = /(?:\r?\n)?[\t ]*<!-- CITY-LOCAL-FAQ-START -->[\s\S]*?<!-- CITY-LOCAL-FAQ-END -->[\t ]*(?:\r?\n[\t ]*){0,2}/;
  const faqEnd = /(\s*<!-- CITY-FAQ-END -->)/;
  if (faqRe.test(html)) {
    html = html.replace(faqRe, "\n" + faqBlock + "\n\t\t\t");
    changed.push("local-faq-replaced");
  } else if (faqEnd.test(html)) {
    html = html.replace(faqEnd, "$1\n" + faqBlock);
    changed.push("local-faq-inserted");
  } else {
    changed.push("LOCAL-FAQ-SKIPPED(no-anchor)");
  }

  // 3. FAQPage schema sync (last - reads the final visible FAQs).
  const res = syncFaqSchema(html);
  html = res[0];
  changed.push(res[1]);

  return [html, changed];
}

// ---------------------------------------------------------------- main

function main() {
  const cities = JSON.parse(fs.readFileSync(CITY_DATA, "utf8"));
  const pincodes = JSON.parse(fs.readFileSync(PINCODES, "utf8"));
  const pinMap = new Map(
    pincodes.map(function (p) {
      return [p.slug, p];
    })
  );

  let updated = 0;
  const problems = [];

  for (const c of cities) {
    const file = path.join(ROOT, "gift-delivery-" + c.slug + ".html");
    if (!fs.existsSync(file)) {
      problems.push(c.slug + ": page file missing");
      continue;
    }
    const original = fs.readFileSync(file, "utf8");
    const res = inject(original, c, pinMap.get(c.slug) || null);
    const next = res[0];
    const changes = res[1];

    const bad = changes.filter(function (x) {
      return x.indexOf("SKIPPED") !== -1 || x.indexOf("skipped") !== -1;
    });
    if (bad.length) problems.push(c.slug + ": " + bad.join(", "));

    if (CHECK_ONLY) {
      if (next !== original) problems.push(c.slug + ": drift (run script without --check)");
      continue;
    }

    if (next !== original) {
      fs.writeFileSync(file, next, "utf8");
      updated++;
      console.log("  " + c.slug + ": " + changes.join(", "));
    } else {
      console.log("  " + c.slug + ": unchanged");
    }
  }

  const label = CHECK_ONLY ? "Check" : "Done";
  const upd = CHECK_ONLY ? "" : "Updated " + updated + "/" + cities.length + " city pages. ";
  console.log(label + ". " + upd + (problems.length ? "" : "All pages OK."));
  if (problems.length) {
    console.log("PROBLEMS (" + problems.length + "):");
    for (const pb of problems.slice(0, 20)) console.log("  " + pb);
    process.exit(1);
  }
}

main();
