# Submit Giftora to Google Search Console (and Bing)

This gets Google to **crawl and index** the site — the fastest way to start
ranking. It needs your Google login, so do the steps here and paste two codes
into files I've prepared.

Total time: ~10 minutes.

## Current status (last checked 2026-10-19)

- [x] Site verified in Search Console (meta tag + `google7700e6aeefbc94c5.html`)
- [x] `sitemap.xml` generated — **363 URLs** (187 products, 101 city/delivery pages,
      16 blog pages, 59 category/occasion/guide/policy pages)
- [x] `robots.txt` points to both sitemaps (`sitemap.xml`, `image-sitemap.xml`)
- [x] `lastmod` refreshed via `apply-seo.js` / `generate-products.js`
- [x] Live sitemap is byte-identical in URL set to the one on disk (verified 2026-10-19)
- [x] **Bing Webmaster Tools** — verified via `BingSiteAuth.xml`, sitemap submitted
- [x] **IndexNow** set up — key hosted, `seo/ping-indexnow.js` pings all URLs
- [x] UptimeRobot / Render free tier — **no longer relevant**: the site is now served
      by `nginx/1.18.0 (Ubuntu)` on our own host, so there is no cold-start 503 window
- [ ] Sitemap submitted in Search Console (Google) — cannot be confirmed from the
      repo; check GSC -> Sitemaps
- [ ] Real index status for the 363 URLs — **blocked: no Google API credentials on
      this machine** (see "Reading real index status" below)

### Live technical audit — 2026-10-19

`node seo/pre-deploy-check.js` returns `RESULT: OK` (363 URLs, 187 products,
60,326 internal links, 0 orphans, schema valid, deindex guards pass), and a live
crawl of all 363 sitemap URLs found: 363/363 HTTP 200, 0 redirects, 0 non-self
canonicals, 0 `noindex` (meta or `X-Robots-Tag`), 0 missing titles, 0 missing or
duplicate H1s, 0 invalid JSON-LD.

That is **indexability**, not **indexing**. Whether Google has actually indexed a
URL can only be read from Search Console — see below.

## Quick checklist (do in order)

1. [ ] Keep the site reachable — no longer needed (site is on nginx, not Render)
2. [ ] Open Search Console -> your `gift-ora.online` property
3. [ ] **Sitemaps** -> submit `sitemap.xml` (expect Success, 363 URLs)
4. [ ] **URL Inspection** -> request indexing using the generated lists (see below)
5. [x] Bing Webmaster Tools — verified + sitemap submitted (done)
6. [x] IndexNow — automated pings (done)
7. [ ] Wait 1–2 weeks, then check **Performance** report

### The generated URL lists (all three cover all 363 sitemap URLs)

| File | Use |
|---|---|
| `gsc-inspection-links.md` | Direct click-through links into GSC URL Inspection, every sitemap URL |
| `.opencode/SEO-URL-BATCHES.md` | Same 363 URLs split into 25 days of ~15, for the daily routine |
| `seo/url-inspection-list.txt` | Tiered input for `node seo/check-indexing.js` (TIER 1..6) |

All three are regenerated from `sitemap.xml` by `node seo/gen-gsc-lists.js` — re-run
it after any product/page addition, or the lists silently fall behind (they had
drifted to 226, 169 and 332 URLs respectively before the 2026-10-19 refresh). The
script is append-only for the tiered list and never writes `sitemap.xml`.

## Reading real index status (needs credentials — not set up yet)

`node seo/check-indexing.js` runs a live technical preflight on every URL and, if
`seo/gsc-service-account.json` exists, **also** asks Google directly via the URL
Inspection API whether each URL is indexed. Without that file it prints
`GSC creds: not set up - preflight only` and every `gscCoverage`/`gscVerdict`
stays `null` in `artifacts/indexing-status.json`.

To enable it:

1. Google Cloud Console -> enable the **Google Search Console API**.
2. IAM & Admin -> Service Accounts -> create one -> **Keys -> Add key -> JSON**.
3. Save the download as exactly `seo/gsc-service-account.json`
   (already whitelisted in `seo/.gitignore` as `*-service-account*.json`).
4. Search Console -> property -> *Settings -> Users and permissions -> Add user*
   -> paste the key's `client_email` -> permission **Full**.

Then `node seo/check-indexing.js --all`. Quota is 2,000 inspections/day, so all
363 URLs fit easily. Results are written to `artifacts/indexing-status.json`
(gitignored) so runs can be diffed day over day.

**Property-type gotcha:** `seo/check-indexing.js` defaults to the *Domain*
property `sc-domain:gift-ora.online`, and `gsc-inspection-links.md` uses the same
`resource_id`. Steps 1-5 of this guide create a *URL prefix* property instead. If
your property is the URL-prefix kind, pass it explicitly:
`node seo/check-indexing.js --all --site https://gift-ora.online`, otherwise the
API returns 403.

---

## Post-update routine (after every content/product change)

Google and Bing are **independent** — one sitemap submission each, then they
crawl on their own. To signal both engines after any update, run from the
project folder:

```
npm run seo:apply
npm run seo:ping
```

- `seo:apply` — refreshes meta tags + regenerates `sitemap.xml` (both engines read this)
- `seo:ping` — pings **Bing/IndexNow instantly** (200 OK = accepted)

Then, for **Google** only, re-submit the sitemap every few updates:
Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit** (Google
re-crawls sooner when it sees a fresh sitemap). You do **not** need to do
anything else in Bing — IndexNow covers it.

---

## Step 0 — Keep the site reachable (no longer needed)

This used to matter: Giftora ran on Render's free tier, which slept after
inactivity and returned 503 to Googlebot, so crawling was slow. **The site is now
self-hosted behind `nginx/1.18.0 (Ubuntu)` and always up**, so no UptimeRobot
monitor is required. (Keep this note only as history — if the site ever moves
back to a sleeping host, re-add a 5-minute uptime ping.)

---

## Step 1 — Add your site to Google Search Console

1. Go to **search.google.com/search-console** and sign in with a Google account.
2. Click **Add property**.
3. Choose **Domain** (so it matches the `sc-domain:gift-ora.online` property that
   `seo/check-indexing.js` and `gsc-inspection-links.md` expect), or **URL prefix**
   with `https://gift-ora.online` — either works, see the gotcha above.
4. Paste: `https://gift-ora.online` (URL prefix) or `gift-ora.online` (Domain).
5. Click **Continue**.

## Step 2 — Verify ownership (use the meta tag)

You'll be shown verification options. Pick the one that gives you a meta tag:

> Recommended tag:
> `<meta name="google-site-verification" content="YOUR_CODE_HERE">`

1. Copy the value inside `content="..."` (e.g. a long random string).
2. Open `seo/keywords.json` in this project.
3. In the `"site"` section, set:
   ```json
   "googleVerification": "YOUR_CODE_HERE"
   ```
4. Run:
   ```
   node seo/apply-seo.js
   node seo/generate-products.js
   ```
5. Deploy (push to GitHub, then pull + restart on the nginx host — the site is
   self-hosted, not on Render any more).
6. Back in Search Console, click **Verify**.

> Alternative (no code edits): download the `google<code>.html` verification
> file that Google offers and save it in the **site root** (`static-giftora/`
> folder next to `index.html`). The server will serve it automatically. Then
> click **Verify**.

## Step 3 — Submit your sitemap

1. In Search Console, open your property.
2. Left menu → **Sitemaps**.
3. In the "Add a new sitemap" box enter:
   ```
    sitemap.xml
    ```
4. Click **Submit**. You should see *Success* with 363 URLs discovered.

## Step 4 — Request indexing of your best pages

1. Top bar → **URL Inspection** tool.
2. Paste `https://gift-ora.online/` → press Enter.
3. If it shows "URL is not on Google" (or not indexed), click
   **Request Indexing**.
4. Work through the generated lists instead of hand-picking pages:
   - `gsc-inspection-links.md` — one click per URL, all 363 sitemap URLs
   - `.opencode/SEO-URL-BATCHES.md` — the same URLs spread over 25 days
   - TIER 1 first (`seo/url-inspection-list.txt`): the newest pages with no
     indexing history at all.

Do not spam — a handful of requests a day is plenty. Note the URL Inspection
tool is a *check*, so it is also the manual fallback for everything the API-based
`seo/check-indexing.js` does automatically once credentials exist.

---

## Bonus — Bing (fast, easy)

Bing indexes quickly and also feeds other search engines:

1. Go to **bing.com/webmasters** and sign in (Microsoft account).
2. Click **Import from Google Search Console** — it copies your site and
   sitemap automatically.
3. If it asks for verification, paste the Bing code into
   `seo/keywords.json` → `"bingVerification": "YOUR_BING_CODE"` and re-run the
   two scripts above.

---

## Then what?

- **Check after ~1–2 weeks**: Search Console → **Performance** shows which
  keywords you appear for, impressions, clicks, and your actual position.
- Expect **3–12 weeks** for a new site to start ranking for easy long-tail
  terms (e.g. "chocolate truffle cake 1kg same day delivery").
- The moment you appear: keep updating `seo/keywords.json` with what's working
  and re-run the scripts.

## Reminder

Ranking requires backlinks and time. Search Console gets you **indexed** fast;
links and content decide the **position**. When you're indexed, share your
site link anywhere relevant (Instagram, WhatsApp groups, local directories) —
every link helps.
