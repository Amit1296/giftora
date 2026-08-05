# Giftora — Static HTML Site

Standalone HTML copy of the Giftora WordPress theme. No WordPress, PHP, or database required.

## Live Site

- **Live URL:** https://gift-ora.online
- **Admin panel:** https://gift-ora.online/admin.html (credentials from `ADMIN_USER` / `ADMIN_PASS` env vars, then local `admin-config.json` [gitignored]; if neither exists the server generates a random password on first boot and prints it in the startup logs)
- **Source repo:** https://github.com/Amit1296/giftora
- **Local:** http://localhost:8080 (`node server.js`)

Deployed on Render (free tier, Node). Data persists in a linked PostgreSQL database when `DATABASE_URL` is set; otherwise it falls back to JSON files in `data/`.

## Project Structure

```
static-giftora/
├── index.html          Home page (hero, categories, shop, reviews, contact)
├── clothes.html        Category page: Clothes
├── shoes.html          Category page: Shoes
├── teddy.html          Category page: Teddy Bears
├── sunglasses.html     Category page: Sunglasses
├── caps.html           Category page: Caps & Hats
├── belts.html          Category page: Belts
├── flowers.html        Category page: Flowers
├── plants.html         Category page: Plants
├── cakes.html          Category page: Cakes
├── toys.html           Category page: Toys
├── combo.html          Category page: Combo Offers
├── about.html          About page
├── contact.html        Contact page
├── products/           Generated SEO product pages (one per product, 44 pages)
├── seo/                SEO automation (keywords.json, apply-seo.js, generate-products.js)
├── robots.txt          Generated crawler rules
├── sitemap.xml         Generated sitemap (63 URLs incl. product pages)
├── server.js           Local server (serves site + saves data)
├── css/
│   └── style.css       All styles
├── js/
│   ├── products.js     Product data (44 products)
│   └── script.js       All interactivity (cart, search, filters, forms, animations)
├── data/
│   ├── orders/         Checkout orders saved as .json files
│   └── enquiries/      Contact messages saved as .json files
```

## How to Run

1. Open a terminal in the `static-giftora` folder.
2. Run: `node server.js`
3. Open: http://localhost:8080

## Pages

| Page           | File           | Content                                              |
|----------------|----------------|------------------------------------------------------|
| Home           | `index.html`   | Hero, 11 category cards, shop grid, testimonials |
| Clothes        | `clothes.html` | Clothes products + search                            |
| Shoes          | `shoes.html`   | Shoes products + search                              |
| Teddy Bears    | `teddy.html`   | Teddy bear products + search                         |
| Sunglasses     | `sunglasses.html` | Sunglasses products + search                      |
| Caps & Hats    | `caps.html`    | Caps & hats products + search                        |
| Belts          | `belts.html`   | Belt products + search                               |
| Flowers        | `flowers.html` | Flower products + search                             |
| Plants         | `plants.html`  | Plant products + search                              |
| Cakes          | `cakes.html`   | Cake products + search                               |
| Toys           | `toys.html`    | Toy products + search                                |
| Combo Offers   | `combo.html`   | Combo bundle products + search                       |
| About          | `about.html`   | Company story + values                               |
| Contact        | `contact.html` | Contact info + enquiry form                          |

Each category page sets `window.PAGE_CATEGORY` so `script.js` only renders that category's products.

## Data Saved to Files

- **Orders** → `data/orders/order_<timestamp>.json`
  - Fields: `name`, `phone`, `address`, `items[]`, `total`
- **Enquiries** → `data/enquiries/enquiry_<timestamp>.json`
  - Fields: `name`, `email`, `message`, `date`

## API Endpoints (server.js)

| Method | Path             | Purpose            |
|--------|------------------|--------------------|
| POST   | `/api/order`     | Save a checkout order |
| POST   | `/api/enquiry`   | Save a contact message |

## Files Detail

### Home + category pages
All share the same navbar (with a Categories dropdown), footer, cart drawer and checkout modal. Category pages add a hero, breadcrumb, sub-nav of all categories, and a search box.

### css/style.css
Theme variables, navbar + dropdown, hero, category-hero, page-hero, category-nav, shop, products, features, testimonials, contact, footer, cart, checkout, toast, reveal animations, responsive breakpoints (1024/820/520px).

### js/products.js
`window.GIFT_PRODUCTS` array with 44 products across 11 categories: clothes, toys, flowers, cakes, teddy, shoes, plants, combo, sunglasses, caps, belts. Each product: id, name, category, price, oldPrice, badge, emoji, gradient.

### js/script.js
Cart (localStorage), product rendering/search/filter, add-to-cart, quantity controls, checkout flow, contact form, stats counter, scroll reveal animations, navbar scroll state, mobile menu. Reads `window.PAGE_CATEGORY` to restrict product lists on category pages.

### server.js
Zero-dependency Node server. Serves static files, handles `POST /api/order` and `POST /api/enquiry`, writes JSON files with timestamped, collision-safe names.

## Notes

- Cart persists in browser `localStorage`.
- Orders and enquiries require the server to be running; otherwise forms show a "could not reach server" message.

## SEO Automation

- `seo/keywords.json` is the single source of truth for page keywords/titles/descriptions.
- `node seo/apply-seo.js` applies meta/OG/Twitter/canonical + JSON-LD to all HTML pages and writes `robots.txt` + `sitemap.xml`.
- `node seo/generate-products.js` (run after the above) generates one SEO page per product in `products/`, writes `js/product-pages.js`, and adds product URLs to the sitemap.
- See `seo/README.md` for the full workflow.
- `seo/google-search-console-guide.md` walks through submitting the site to Google Search Console + Bing (paste the verification code into `seo/keywords.json` → `googleVerification` / `bingVerification`, then re-run the two scripts).
