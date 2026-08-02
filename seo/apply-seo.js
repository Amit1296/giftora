/**
 * apply-seo.js — Applies SEO meta tags, Open Graph, Twitter cards and
 * JSON-LD structured data to every HTML page using seo/keywords.json as the
 * single source of truth. Also generates robots.txt and sitemap.xml.
 *
 * Usage:
 *   node seo/apply-seo.js
 *
 * Refresh keywords: edit seo/keywords.json, then re-run this script.
 * It is idempotent — old SEO blocks are detected by markers and replaced.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KEYWORDS_FILE = path.join(__dirname, "keywords.json");
const MARKER_START = "<!-- SEO-BLOCK-START -->";
const MARKER_END = "<!-- SEO-BLOCK-END -->";
const JSONLD_START = "<!-- SEO-JSONLD-START -->";
const JSONLD_END = "<!-- SEO-JSONLD-END -->";
const COOKIE_START = "<!-- COOKIE-START -->";
const COOKIE_END = "<!-- COOKIE-END -->";

function loadConfig() {
  return JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf8"));
}

function loadProducts() {
  const file = path.join(ROOT, "js", "products.js");
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  const products = [];
  const re = /{ id: (\d+), name: "([^"]+)", category: "([^"]+)", price: (\d+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    products.push({ id: +m[1], name: m[2], category: m[3], price: +m[4] });
  }
  return products;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildMetaBlock(page, cfg, site) {
  const url = site.url + "/" + page;
  const title = cfg.title;
  const desc = cfg.description;
  const lines = [MARKER_START];

  if (cfg.type === "admin") {
    lines.push('<meta name="robots" content="noindex, nofollow">');
  }

  if (site.googleVerification) {
    lines.push(`<meta name="google-site-verification" content="${esc(site.googleVerification)}">`);
  }
  if (site.bingVerification) {
    lines.push(`<meta name="msvalidate.01" content="${esc(site.bingVerification)}">`);
  }

  if (cfg.keywords && cfg.keywords.length) {
    lines.push(`<meta name="keywords" content="${esc(cfg.keywords.join(", "))}">`);
  }

  lines.push(`<link rel="canonical" href="${url}">`);
  lines.push(`<meta property="og:site_name" content="${site.name}">`);
  lines.push(`<meta property="og:title" content="${esc(title)}">`);
  lines.push(`<meta property="og:description" content="${esc(desc)}">`);
  lines.push(`<meta property="og:url" content="${url}">`);
  lines.push(`<meta property="og:type" content="website">`);
  lines.push(`<meta property="og:locale" content="${site.locale}">`);
  if (cfg.ogImage) lines.push(`<meta property="og:image" content="${cfg.ogImage}">`);
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  lines.push(`<meta name="twitter:title" content="${esc(title)}">`);
  lines.push(`<meta name="twitter:description" content="${esc(desc)}">`);
  if (cfg.ogImage) lines.push(`<meta name="twitter:image" content="${cfg.ogImage}">`);

  lines.push(MARKER_END);
  return lines.join("\n");
}

function breadcrumbList(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function sitePartOf(site) {
  return { "@type": "WebSite", name: site.name, url: site.url };
}

function buildJsonLd(page, cfg, site, products) {
  if (cfg.type === "admin") return null;

  const url = site.url + "/" + page;
  const blocks = [];

  if (cfg.type === "home") {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.name,
      url: site.url,
      description: cfg.description,
    });
    blocks.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: site.name,
      url: site.url,
      description: cfg.description,
      telephone: site.phone || undefined,
      email: site.email || undefined,
      address: site.address
        ? { "@type": "PostalAddress", streetAddress: site.address, addressCountry: "IN" }
        : undefined,
    });
  } else {
    const pageName = cfg.category || cfg.title.split(" — ")[0];
    blocks.push(breadcrumbList([
      { name: "Home", url: site.url + "/index.html" },
      { name: pageName, url },
    ]));

    if (cfg.type === "category") {
      const pageType = cfg.category === "Special Offers" || cfg.category === "Festival Offer" || cfg.category === "Combo Offers"
        ? "CollectionPage" : "CollectionPage";
      const matched = cfg.category
        ? products.filter((p) => p.category.toLowerCase() === cfg.category.toLowerCase())
        : [];
      const collection = {
        "@context": "https://schema.org",
        "@type": pageType,
        name: cfg.title,
        description: cfg.description,
        url,
        isPartOf: sitePartOf(site),
      };
      if (matched.length) {
        collection.mainEntity = {
          "@type": "ItemList",
          itemListElement: matched.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: p.name,
              offers: { "@type": "Offer", price: String(p.price), priceCurrency: site.currency, availability: "https://schema.org/InStock" },
            },
          })),
        };
      }
      blocks.push(collection);
    } else if (cfg.type === "about") {
      blocks.push({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: cfg.title,
        description: cfg.description,
        url,
        isPartOf: sitePartOf(site),
        about: { "@type": "Organization", name: site.name, url: site.url },
      });
    } else if (cfg.type === "contact") {
      blocks.push({
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: cfg.title,
        description: cfg.description,
        url,
        isPartOf: sitePartOf(site),
        mainEntity: {
          "@type": "Organization",
          name: site.name,
          url: site.url,
          telephone: site.phone || undefined,
          email: site.email || undefined,
          address: site.address
            ? { "@type": "PostalAddress", streetAddress: site.address, addressCountry: "IN" }
            : undefined,
          contactPoint: { "@type": "ContactPoint", telephone: site.phone, contactType: "customer service" },
        },
      });
    } else {
      blocks.push({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: cfg.title,
        description: cfg.description,
        url,
        isPartOf: sitePartOf(site),
      });
    }
  }

  return "[\n" + blocks.map((b) => JSON.stringify(b, null, 2)).join(",\n") + "\n]";
}

function replaceBlock(html, start, end, block) {
  const re = new RegExp(`[\\t ]*${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}[\\t ]*\\n?`);
  const removed = html.replace(re, "");
  if (block === null) return removed;
  const anchor = "</head>";
  const idx = removed.indexOf(anchor);
  if (idx === -1) throw new Error("</head> not found");
  return removed.slice(0, idx) + block + "\n" + removed.slice(idx);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function injectMeta(html, block) {
  const anchor = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  const idx = html.indexOf(anchor);
  if (idx === -1) throw new Error("viewport meta not found");
  return html.slice(0, idx + anchor.length) + "\n" + block + html.slice(idx + anchor.length);
}

function todayIso() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function writeRobots(site) {
  const content = [
    "User-agent: *",
    "Allow: /",
    "",
    "Disallow: /admin.html",
    "Disallow: /data/",
    "Disallow: /seo/",
    "",
    `Sitemap: ${site.url}/sitemap.xml`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "robots.txt"), content, "utf8");
  console.log("  robots.txt written");
}

function writeSitemap(site, pages, extraUrls = []) {
  const lastmod = todayIso();
  const urls = Object.entries(pages)
    .filter(([, c]) => c.sitemap)
    .sort((a, b) => {
      const pa = a[1].sitemap.priority || "0";
      const pb = b[1].sitemap.priority || "0";
      return Number(pb) - Number(pa);
    })
    .map(([file, c]) => {
      const loc = site.url + "/" + file;
      return [
        "  <url>",
        `    <loc>${esc(loc)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${c.sitemap.changefreq}</changefreq>`,
        `    <priority>${c.sitemap.priority}</priority>`,
        "  </url>",
      ].join("\n");
    });

  for (const u of extraUrls) {
    urls.push([
      "  <url>",
      `    <loc>${esc(u.loc)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`,
      "  </url>",
    ].join("\n"));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls.join("\n"),
    "</urlset>",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
  console.log("  sitemap.xml written (" + urls.length + " URLs)");
}

function injectTitleDescription(html, cfg) {
  const title = cfg.title.replace(/&/g, "&amp;");
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  const descRe = /<meta name="description" content="[^"]*">/;
  if (descRe.test(html)) {
    html = html.replace(descRe, `<meta name="description" content="${esc(cfg.description)}">`);
  }
  return html;
}

function cookieBannerBlock(prefix, includeTrack) {
  const lines = [
    COOKIE_START,
    '<div class="cookie-banner" id="cookieBanner" role="dialog" aria-label="Cookie consent" aria-hidden="true">',
    '\t<div class="cookie-banner-inner">',
    '\t\t<div class="cookie-banner-text">',
    '\t\t\t<span class="cookie-banner-icon" aria-hidden="true">🍪</span>',
    `\t\t\t<p>We use cookies to keep your cart saved and improve your experience. <a href="${prefix}privacy-policy.html">See our Privacy Policy</a>.</p>`,
    "\t\t</div>",
    "\t\t<div class=\"cookie-banner-actions\">",
    '\t\t\t<button type="button" class="cookie-btn cookie-btn-ghost" data-cookie-decline>Decline</button>',
    '\t\t\t<button type="button" class="cookie-btn cookie-btn-primary" data-cookie-accept>Accept All</button>',
    "\t\t</div>",
    "\t</div>",
    "</div>",
    `<script src="${prefix}js/cookies.js"></script>`,
  ];
  if (includeTrack) lines.push(`<script src="${prefix}js/track.js"></script>`);
  lines.push(COOKIE_END, "");
  return lines.join("\n");
}

function injectCookieConsent(html, page) {
  const prefix = page.startsWith("products/") ? "../" : "";
  html = replaceBlock(html, COOKIE_START, COOKIE_END, null);
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) throw new Error("</body> not found in " + page);
  return html.slice(0, idx) + cookieBannerBlock(prefix, page !== "admin.html") + "\n" + html.slice(idx);
}

function injectCookieSettingsLink(html) {
  if (html.indexOf("data-cookie-settings") !== -1) return html;
  const re = /([ \t]*)<li><a href="(?:\.\.\/)?privacy-policy\.html">Privacy Policy<\/a><\/li>/;
  return html.replace(re, (m, indent) =>
    m + "\n" + indent + '<li><a href="#" data-cookie-settings>Cookie Preferences</a></li>'
  );
}

function apply() {
  const cfg = loadConfig();
  const site = cfg.site;
  const pages = cfg.pages;
  const products = loadProducts();

  console.log("Applying SEO from seo/keywords.json ...");

  for (const [file, pageCfg] of Object.entries(pages)) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
      console.log("  SKIP (missing): " + file);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf8");

    html = injectTitleDescription(html, pageCfg);

    const metaBlock = buildMetaBlock(file, pageCfg, site);
    html = replaceBlock(html, MARKER_START, MARKER_END, null);
    html = injectMeta(html, metaBlock);

    const jsonLd = buildJsonLd(file, pageCfg, site, products);
    html = replaceBlock(html, JSONLD_START, JSONLD_END, null);
    if (jsonLd !== null) {
      const block = JSONLD_START + "\n<script type=\"application/ld+json\">\n" + jsonLd + "\n</script>\n" + JSONLD_END;
      html = replaceBlock(html, JSONLD_START, JSONLD_END, block);
    }

    html = injectCookieSettingsLink(html);
    html = injectCookieConsent(html, file);

    fs.writeFileSync(filePath, html, "utf8");
    console.log("  updated: " + file);
  }

  writeRobots(site);
  writeSitemap(site, pages);
  console.log("Done. Re-run this script any time after editing seo/keywords.json.");
}

module.exports = { apply, loadConfig, loadProducts, esc, writeRobots, writeSitemap, todayIso, injectCookieConsent, injectCookieSettingsLink };

if (require.main === module) apply();
