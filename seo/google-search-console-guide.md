# Submit Giftora to Google Search Console (and Bing)

This gets Google to **crawl and index** the site — the fastest way to start
ranking. It needs your Google login, so do the steps here and paste two codes
into files I've prepared.

Total time: ~10 minutes.

## Current status (last checked 2026-08-13)

- [x] Site verified in Search Console (meta tag + `google7700e6aeefbc94c5.html`)
- [x] `sitemap.xml` generated — **147 URLs** (44 products, 63 cities, 4 blogs + occasion/category/static)
- [x] `robots.txt` points to the sitemap
- [x] `lastmod` refreshed to today via `apply-seo.js` / `generate-products.js`
- [ ] Sitemap submitted in Search Console
- [ ] Key pages requested for indexing
- [ ] Bing Webmaster Tools set up
- [ ] UptimeRobot pinging the site (keeps Render free tier awake)

## Quick checklist (do in order)

1. [ ] Keep the site awake — add an UptimeRobot monitor (Step 0 below)
2. [ ] Open Search Console → your `https://gift-ora.online` property
3. [ ] **Sitemaps** → submit `sitemap.xml` (expect Success, 147 URLs)
4. [ ] **URL Inspection** → request indexing for `index.html` + 5 key pages
5. [ ] Bing Webmaster Tools → Import from Google Search Console
6. [ ] Wait 1–2 weeks, then check **Performance** report

---

## Step 0 — Keep the site awake (important)

Giftora runs on Render's free tier, which sleeps after inactivity and returns
503 to Googlebot. A sleeping site gets crawled very slowly.

Do one of these:

- Create a free account at **UptimeRobot** (uptimerobot.com) → *New monitor* →
  URL: `https://gift-ora.online` → check every 5 minutes. Free pings keep
  the site warm.
- Or set **Render** to the paid tier (no sleep at all).

---

## Step 1 — Add your site to Google Search Console

1. Go to **search.google.com/search-console** and sign in with a Google account.
2. Click **Add property**.
3. Choose **URL prefix** (not "Domain").
4. Paste: `https://gift-ora.online`
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
5. Deploy to Render (push to GitHub; Render auto-deploys).
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
4. Click **Submit**. You should see *Success* with 147 URLs discovered.

## Step 4 — Request indexing of your best pages

1. Top bar → **URL Inspection** tool.
2. Paste `https://gift-ora.online/index.html` → press Enter.
3. If it shows "URL is not on Google" (or not indexed), click
   **Request Indexing**.
4. Repeat for a few key pages, e.g.:
   - `https://gift-ora.online/cakes.html`
   - `https://gift-ora.online/flower-delivery-online-same-day.html` (any product page)
   - `https://gift-ora.online/sitemap.xml`

Do not spam — a handful of requests a day is plenty.

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
