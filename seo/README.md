# Giftora SEO — Keywords & Meta Tags

This folder is the **single source of truth** for Giftora's SEO. It keeps all
keywords in one place so they can be refreshed anytime and re-applied to every
page automatically.

## Files

| File | Purpose |
|------|---------|
| `keywords.json` | Fresh keywords, titles, descriptions and meta settings for every page |
| `apply-seo.js` | Reusable script that applies the keywords to all HTML pages |
| `generate-products.js` | Generates a dedicated SEO page for every product (in `products/`) |
| `google-search-console-guide.md` | Step-by-step guide to get the site indexed on Google/Bing |
| `README.md` | This guide |

## What the scripts do

Running `node seo/apply-seo.js` automatically updates every HTML page with:

- `<title>` and `<meta name="description">` (fresh, keyword-rich)
- `<meta name="keywords">`
- Canonical URL (`<link rel="canonical">`)
- Open Graph tags (`og:title`, `og:description`, `og:url`, `og:locale`, ...)
- Twitter card tags
- JSON-LD structured data (WebSite, Organization, BreadcrumbList, ItemList
  with product names/prices pulled from `js/products.js`, AboutPage, ContactPage)
- `robots.txt` and `sitemap.xml` at the site root

Running `node seo/generate-products.js` (after `apply-seo.js`) generates one
page per product in `products/<slug>.html` — each with unique title/description/
keywords, Product + FAQPage JSON-LD, breadcrumbs, related products and a working
Add to Cart — then re-writes `sitemap.xml` to include them.

Both scripts are **idempotent** — re-running replaces old blocks (identified by
`<!-- SEO-BLOCK-START/END -->` and `<!-- SEO-JSONLD-START/END -->` markers)
instead of duplicating them.

## How to refresh keywords (future use)

1. Edit `seo/keywords.json` — update the `keywords` arrays, `title` and
   `description` for any page. Per page you can also set:
   - `type`: `home`, `category`, `about`, `contact`, `page`, `admin`
   - `category`: the product category name (links JSON-LD products automatically)
   - `ogImage`: full URL of an image for social shares (optional, leave blank to omit)
   - `sitemap`: `{ priority, changefreq }` used for sitemap.xml (`null` to exclude)
2. Run `node seo/apply-seo.js`
3. Run `node seo/generate-products.js` (regenerates product pages + sitemap)
4. Commit the updated HTML files, `products/`, `js/product-pages.js`,
   `robots.txt` and `sitemap.xml`

## When products change

- If you add/remove/rename products in `js/products.js`, re-run
  `node seo/generate-products.js` to refresh the product pages and the sitemap.
  `js/product-pages.js` is regenerated automatically so category/home cards
  always link to the right pages (products added later in the admin panel have
  no static page, so their cards simply don't link).

## Tips

- Keep titles under ~60 characters and descriptions under ~160 characters.
- `admin.html` is automatically set to `noindex, nofollow` and excluded from
  the sitemap.
- After deploying, verify with Google Search Console (or any rich-result
  validator) that the new sitemap URL is picked up:
  `https://giftora.onrender.com/sitemap.xml`
