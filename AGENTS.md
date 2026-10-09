# AGENTS.md — Giftora (gift-ora.online) working rules

These rules are MANDATORY for every session. They exist because the site
disappeared from Google Search once (Sept 2026). Do not repeat that.

## Non-negotiable: never deindex a page

1. **Never delete, 404 or 410 an indexed URL.** If a page must go, 301 it to the
   closest relevant live page. 301s preserve ranking; 404s destroy it.
2. **Never add `noindex`** (meta robots or a `X-Robots-Tag: noindex` response
   header) to any page that is or could be indexed. `index, follow` only.
3. **Never block crawling.** `robots.txt` must keep `Allow: /` (no `Disallow: /`)
   and the `Sitemap:` line.
4. **Never remove a live page from `sitemap.xml`.** If a URL is still 200 on
   disk, it stays in the sitemap. Removing it while the page lives is a silent
   deindex. (Removing entries is only allowed when the page/file itself is
   deleted or 301-redirected.)
5. **Never change a `canonical`** to point away from the page's own URL.
6. **Never rewrite the title/H1 of an indexed page** in a way that changes what
   it ranks for, without checking the page's intent first. Copy/meta tweaks are
   fine when they match reality.

## Scripts that rewrite sitemap.xml / robots.txt (danger zone)

`seo/apply-seo.js`, `seo/sync-from-server.js`, `seo/add-cities.js`,
`seo/generate-products.js`, `seo/sync-llms.js` regenerate sitewide SEO files.
Before running ANY of them:

- Snapshot `git diff` of `sitemap.xml`, `robots.txt`, `server.js` and the SEO
  block (`<meta name="robots">`, canonicals) in all pages.
- After running, diff again and confirm the sitemap URL count did not drop and
  no page gained `noindex`.

`seo/enrich-categories.js` and `seo/inject-*.js` only edit in-page copy blocks
(GUIDE-BLOCK / GUIDE-FAQ / city-copy) and never touch robots, sitemap, canonical
or `noindex` — that has been verified.

## Mandatory verification before every commit

1. Run `node seo/pre-deploy-check.js` — it MUST pass (`RESULT: OK`). It blocks:
   - dead sitemap URLs / catalog drift / dead internal links /
     orphan pages / invalid JSON-LD (sections 1-5)
   - `robots.txt` blocking crawlers, `noindex` on any sitemap page, a noindex
     `X-Robots-Tag` in `server.js`, and sitemap entries dropped while the page
     is still live on disk (section 6 — deindex guards).
2. `git diff --name-only` before staging: only the intended files may change.
   If `sitemap.xml`, `robots.txt` or `server.js` appears, double-check what
   changed and why.
3. Stage explicitly. Never `git add -A` or `git add .` — unrelated untracked
   files (e.g. `banner-*.html`, `banners/`, `claude-seo/`) must never be
   committed.
4. After committing, sanity-check `git status` and the live site (curl the
   changed URLs, expect 200 or an intentional 301).

## Fact-checking rule

Every product/category claim in copy, FAQ or schema must match
`data/products.json`. Never invent products, prices or categories that do not
exist in the catalogue.