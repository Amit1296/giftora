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
| `render-product.js` | Builds a dynamic product page (Product + FAQPage JSON-LD, offers) from a product object (used by the live server) |
| `check-schema.js` | **Schema audit** — validates every Product JSON-LD on every page for Google-required fields. Fails the deploy on invalid schema. |
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

## Pull the live catalog into the repo

`node seo/sync-from-server.js` fetches the authoritative product list from the
production site (`/js/products.js`, regenerated from PostgreSQL at boot),
updates `data/products.json`, regenerates all product pages, `js/product-pages.js`
and the sitemap, then runs the **pre-deploy gate**. Always run apply-seo BEFORE
generate-products (generate-products owns product sitemap priorities; running
apply-seo afterwards downgrades them to 0.5).

## When products change

- `js/products.js` is a **derived artifact**: the production server regenerates
  it from PostgreSQL on every boot (`db.getProducts()` → `server.js`), and it is
  git-ignored on purpose so a server restart can never conflict with a `git pull`.
- `data/products.json` is the repo's canonical product snapshot (also the seed
  for a fresh database). Keep it current whenever the catalog changes.
- After updating `data/products.json` (or `js/products.js` locally), re-run
  `node seo/generate-products.js` to refresh the product pages, 
  `js/product-pages.js` and the sitemap. `loadProducts()` falls back to
  `data/products.json` when `js/products.js` is absent (e.g. a fresh clone).
- Products added via the admin panel exist only in Postgres until that data is
  exported to `data/products.json` and pages are regenerated; until then their
  cards render via the dynamic route and are not in the sitemap.

## Schema audit — run before every deploy

Google requires Product rich results to include an `image`, `name` and an
`offers` block with `price`/`priceCurrency`/`availability`. Missing any of
these blocks the schema (this is the exact issue we previously fixed across
all category + product pages).

To verify everything is valid at any time:

```
node seo/check-schema.js        # or: npm test / npm run seo:check
```

- **exit 0** = all Product schema valid
- **exit 1** = error(s) found — must be fixed before deploying

The script checks:
- every root `.html` page AND every `products/*.html` page
- every Product node has `name`, `image` (absolute URL) and `offers`
- every Offer has `price`, `priceCurrency`, `availability`
- AggregateOffer uses `lowPrice`/`highPrice` and each sub-offer has `price`
- every product in `data/products.json` has an `image` (protects the dynamic
  server-rendered pages too)

**Enforced automatically:**
- `npm test` and `npm run seo:apply` run it
- `render.yaml` build command runs it before deploy — an invalid schema now
  **blocks the deployment**
- GitHub Actions (`.github/workflows/schema-audit.yml`) runs it on every push/PR

If the audit reports a missing `image` on a root category page, you can
auto-fix it from the product data and regenerate the individual pages:

```
node seo/check-schema.js --fix   # auto-fills image from data/products.json (root pages)
node seo/generate-products.js     # regenerate products/*.html (already has image)
node seo/check-schema.js          # re-verify -> should be exit 0
```

## Pre-deploy gate — runs on every push

`node seo/pre-deploy-check.js` is wired as a **pre-push hook** (`hooks/pre-push`)
and must pass before any push is accepted. It re-checks the four bug classes
that have previously hit the live site:

| # | Check | Catches |
|---|-------|---------|
| 1 | Every sitemap `<loc>` resolves to a real file in an **allowed dir** (repo root `*.html` or `products/*.html`), no duplicates | dead URLs like the `medicine-medical-equipments` 404s (stray folders outside the allow-list are rejected even if a matching file exists) |
| 2 | `#products/*.html` count == `js/product-pages.js` == `data/products.json`, every slug has a page on disk | catalog drift between Postgres and the repo |
| 3 | No forbidden files staged (`js/products.js`, `data/backups/`, `previews/`, `artifacts/`, `*.exe`/`*.ps1`, credential scripts) | committing derived/secret files |
| 4 | Delegates to `seo/check-schema.js` | invalid/truncated structured data |

Skip it once with `GIFTORA_SKIP_CHECK=1 git push`. Install into any clone with
`git config core.hooksPath hooks`.

## Tips

- Keep titles under ~60 characters and descriptions under ~160 characters.
- `admin.html` is automatically set to `noindex, nofollow` and excluded from
  the sitemap.
- After deploying, verify with Google Search Console (or any rich-result
  validator) that the new sitemap URL is picked up:
  `https://gift-ora.online/sitemap.xml`
