const { spawn } = require("child_process");
const chromeLauncher = require("chrome-launcher");
const puppeteer = require("puppeteer-core");

(async () => {
  const server = spawn("node", ["server.js"], { cwd: process.cwd(), env: { ...process.env, PORT: "8123" }, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));

  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("http://localhost:8123/", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll("#productsGrid .product-card").length,
    gridButtons: document.querySelectorAll("#productsGrid .add-to-cart").length,
  }));
  console.log("initial cards:", initial.cards, "add-to-cart buttons:", initial.gridButtons);
  if (initial.cards !== 117) console.log("WARN: expected 117 cards");

  await page.type("#searchInput", "rose");
  await new Promise((r) => setTimeout(r, 2000));
  const searched = await page.evaluate(() => document.querySelectorAll("#productsGrid .product-card").length);
  console.log("after search 'rose':", searched, "cards");
  if (!(searched > 0 && searched < 117)) console.log("WARN: search should narrow the grid");

  await page.evaluate(() => { document.querySelector("#searchInput").value = ""; document.querySelector("#searchInput").dispatchEvent(new Event("input")); });
  await new Promise((r) => setTimeout(r, 2500));
  const restored = await page.evaluate(() => document.querySelectorAll("#productsGrid .product-card").length);
  console.log("after clearing search:", restored, "cards");
  if (restored !== 117) console.log("WARN: grid should be restored to 117 (token guard)");

  const banners = await page.evaluate(() => document.querySelectorAll("#festivalBannerSlider .banner-slide").length);
  const logos = await page.evaluate(() => document.querySelectorAll(".pb-logo").length);
  const dots = await page.evaluate(() => document.querySelectorAll("#festivalBannerSlider .slider-dot").length);
  const slideW = await page.evaluate(() => { const t = document.querySelector("#bannerTrack"); return t ? Math.round(t.getBoundingClientRect().width) : 0; });
  console.log("banner slides:", banners, "watermark logos:", logos, "dots:", dots, "track width:", slideW);

  console.log("page errors:", errors.length ? errors : "none");
  await browser.close();
  try { await chrome.kill(); } catch (e) {}
  server.kill();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });