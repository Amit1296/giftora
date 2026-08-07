const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const SEED_DIR = path.join(__dirname, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SEED_DIR;
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const FESTIVAL_FILE = path.join(DATA_DIR, "festival.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");
const VENDORS_FILE = path.join(DATA_DIR, "vendors.json");
const VISITORS_FILE = path.join(DATA_DIR, "visitors.json");
const LEGACY_ORDERS = path.join(DATA_DIR, "orders");
const LEGACY_ENQUIRIES = path.join(DATA_DIR, "enquiries");

const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_PG = DATABASE_URL ? true : false;

const DEFAULT_FESTIVAL = {
  active: true,
  title: "Raksha Bandhan Special",
  subtitle: "Celebrate the beautiful bond of love this Raksha Bandhan",
  discount: 15,
  emoji: "🪢",
  code: "RAKHI15",
  note: "Limited period offer across all gifts",
  image: "",
  productIds: [],
};

/* ---------- Postgres storage (production) ---------- */
let pool = null;

if (USE_PG) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const schema = `
    CREATE TABLE IF NOT EXISTS giftora_kv (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS giftora_uploads (
      key TEXT PRIMARY KEY,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;

  pool
    .query(schema)
    .then(() => {
      console.log("db: connected to PostgreSQL and schema ready");
      return seedPg();
    })
    .catch((e) => console.error("db: PostgreSQL init error:", e.message));
}

async function pgGet(key, fallback) {
  const res = await pool.query("SELECT value FROM giftora_kv WHERE key = $1", [key]);
  if (res.rows.length === 0) return JSON.parse(JSON.stringify(fallback));
  return res.rows[0].value;
}

async function pgSet(key, value) {
  await pool.query(
    "INSERT INTO giftora_kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)]
  );
}

async function seedPg() {
  let storedProducts = null;
  if (await existsPg("products")) {
    try {
      storedProducts = await pgGet("products", []);
    } catch (e) {
      storedProducts = null;
    }
  }
  if (!storedProducts || !Array.isArray(storedProducts) || storedProducts.length === 0) {
    try {
      await pgSet("products", JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8")));
      console.log("db: seeded products from data/products.json");
    } catch (e) {
      console.error("db: could not seed products:", e.message);
    }
  }
  if (!(await existsPg("festival"))) {
    try {
      await pgSet("festival", JSON.parse(fs.readFileSync(FESTIVAL_FILE, "utf8")));
      console.log("db: seeded festival from data/festival.json");
    } catch (e) {
      await pgSet("festival", DEFAULT_FESTIVAL);
    }
  }
}

async function existsPg(key) {
  const res = await pool.query("SELECT 1 FROM giftora_kv WHERE key = $1", [key]);
  return res.rows.length > 0;
}

/* ---------- JSON file storage (local) ---------- */
function seedDataDir() {
  if (USE_PG) return;
  if (DATA_DIR === SEED_DIR) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRODUCTS_FILE) && fs.existsSync(path.join(SEED_DIR, "products.json"))) {
    fs.copyFileSync(path.join(SEED_DIR, "products.json"), PRODUCTS_FILE);
    console.log("db: seeded products.json from repo data dir -> " + PRODUCTS_FILE);
  }
  if (!fs.existsSync(FESTIVAL_FILE) && fs.existsSync(path.join(SEED_DIR, "festival.json"))) {
    fs.copyFileSync(path.join(SEED_DIR, "festival.json"), FESTIVAL_FILE);
    console.log("db: seeded festival.json from repo data dir -> " + FESTIVAL_FILE);
  }
}

seedDataDir();

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback));
  }
  return file;
}

function readJson(file, fallback) {
  try {
    ensureFile(file, fallback);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(file, data) {
  ensureFile(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readLegacyDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        d._file = path.basename(f, ".json");
        return d;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function mergeLegacy(current, legacyFiles, key) {
  const existing = new Set(current.map((x) => x._file).filter(Boolean));
  const missing = legacyFiles.filter((x) => !existing.has(x._file));
  return [...missing, ...current];
}

/* ---------- Products ---------- */
async function getProducts() {
  if (USE_PG) return pgGet("products", []);
  return readJson(PRODUCTS_FILE, []);
}

async function saveProducts(products) {
  if (USE_PG) {
    const prev = await pgGet("products", []);
    if (Array.isArray(prev) && prev.length > 0) {
      const history = await pgGet("products_history", []);
      history.push({ savedAt: new Date().toISOString(), count: prev.length, snapshot: prev });
      if (history.length > 20) history.splice(0, history.length - 20);
      await pgSet("products_history", history).catch(() => {});
    }
    return pgSet("products", products);
  }
  const prev = readJson(PRODUCTS_FILE, []);
  if (Array.isArray(prev) && prev.length > 0 && Array.isArray(products) && products.length !== prev.length) {
    const backupDir = path.join(DATA_DIR, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, "products-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json"),
      JSON.stringify(prev, null, 2)
    );
  }
  return writeJson(PRODUCTS_FILE, products);
}

async function getProductsHistory() {
  if (USE_PG) return pgGet("products_history", []);
  const backupDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => /^products-.*\.json$/.test(f))
    .map((f) => {
      try {
        const snapshot = JSON.parse(fs.readFileSync(path.join(backupDir, f), "utf8"));
        return { savedAt: f, count: Array.isArray(snapshot) ? snapshot.length : 0, snapshot };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function restoreProducts(index) {
  const history = await getProductsHistory();
  const entry = history[Number(index) || 0];
  if (!entry || !Array.isArray(entry.snapshot)) return false;
  await saveProducts(entry.snapshot);
  return true;
}

/* ---------- Uploads (persistent in Postgres on production) ---------- */
async function saveUpload(key, buffer) {
  if (USE_PG) {
    await pool.query(
      "INSERT INTO giftora_uploads (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, created_at = now()",
      [key, buffer]
    );
    return;
  }
  fs.mkdirSync(path.dirname(path.join(DATA_DIR, "uploads", key)), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "uploads", key), buffer);
}

async function getUpload(key) {
  if (!USE_PG) return null;
  const res = await pool.query("SELECT data FROM giftora_uploads WHERE key = $1", [key]);
  return res.rows.length ? res.rows[0].data : null;
}

/* ---------- Festival offer ---------- */
async function getFestival() {
  if (USE_PG) return pgGet("festival", DEFAULT_FESTIVAL);
  return readJson(FESTIVAL_FILE, DEFAULT_FESTIVAL);
}

async function saveFestival(festival) {
  if (USE_PG) return pgSet("festival", festival);
  return writeJson(FESTIVAL_FILE, festival);
}

/* ---------- Orders ---------- */
async function getOrders() {
  if (USE_PG) return pgGet("orders", []);
  const current = readJson(ORDERS_FILE, []);
  const merged = mergeLegacy(current, readLegacyDir(LEGACY_ORDERS), "_file");
  return merged;
}

async function addOrder(order) {
  const orders = await getOrders();
  order._file = order._file || order.orderId || "order_" + Date.now();
  orders.unshift(order);
  if (USE_PG) return pgSet("orders", orders);
  return writeJson(ORDERS_FILE, orders);
}

async function updateOrder(file, patch) {
  const orders = await getOrders();
  const i = orders.findIndex((o) => o._file === file);
  if (i >= 0) {
    orders[i] = { ...orders[i], ...patch };
    if (USE_PG) return pgSet("orders", orders);
    return writeJson(ORDERS_FILE, orders);
  }
}

/* ---------- Enquiries ---------- */
async function getEnquiries() {
  if (USE_PG) return pgGet("enquiries", []);
  const current = readJson(ENQUIRIES_FILE, []);
  const merged = mergeLegacy(current, readLegacyDir(LEGACY_ENQUIRIES), "_file");
  return merged;
}

async function addEnquiry(enquiry) {
  const list = await getEnquiries();
  enquiry._file = enquiry._file || "enquiry_" + Date.now();
  list.unshift(enquiry);
  if (USE_PG) return pgSet("enquiries", list);
  return writeJson(ENQUIRIES_FILE, list);
}

/* ---------- Vendors ---------- */
async function getVendors() {
  if (USE_PG) return pgGet("vendors", []);
  return readJson(VENDORS_FILE, []);
}

async function addVendor(vendor) {
  const list = await getVendors();
  vendor._file = vendor._file || "vendor_" + Date.now();
  list.unshift(vendor);
  if (USE_PG) return pgSet("vendors", list);
  return writeJson(VENDORS_FILE, list);
}

/* ---------- Visitor tracking ---------- */
const EMPTY_VISITORS = { sessions: [], events: [] };

function newSession(vid, meta, nowIso) {
  return {
    vid,
    firstSeen: nowIso,
    lastSeen: nowIso,
    views: 0,
    device: (meta && meta.device) || "",
    browser: (meta && meta.browser) || "",
    os: (meta && meta.os) || "",
    country: (meta && meta.country) || "",
    referrer: (meta && meta.referrer) || "",
    ipHash: (meta && meta.ipHash) || "",
    pages: [],
    productViews: {},
    cartAdds: [],
    cartOpened: 0,
    checkoutStarted: 0,
  };
}

async function getVisitors() {
  if (USE_PG) return pgGet("visitors", EMPTY_VISITORS);
  return readJson(VISITORS_FILE, EMPTY_VISITORS);
}

async function saveVisitors(store) {
  if (USE_PG) return pgSet("visitors", store);
  return writeJson(VISITORS_FILE, store);
}

async function addVisitorBatch(vid, meta, events, nowIso) {
  if (!vid || typeof vid !== "string") return;
  vid = vid.slice(0, 64);
  const store = await getVisitors();
  let session = store.sessions.find((s) => s.vid === vid);
  if (!session) {
    session = newSession(vid, meta, nowIso);
    store.sessions.unshift(session);
  }
  session.lastSeen = nowIso;
  if (meta) {
    if (!session.device && meta.device) session.device = String(meta.device).slice(0, 24);
    if (!session.browser && meta.browser) session.browser = String(meta.browser).slice(0, 24);
    if (!session.os && meta.os) session.os = String(meta.os).slice(0, 24);
    if (!session.country && meta.country) session.country = String(meta.country).slice(0, 8);
    if (!session.referrer && meta.referrer) session.referrer = String(meta.referrer).slice(0, 300);
    if (!session.ipHash && meta.ipHash) session.ipHash = String(meta.ipHash).slice(0, 16);
  }
  const list = Array.isArray(events) ? events.slice(0, 30) : [];
  for (const ev of list) {
    if (!ev || typeof ev.type !== "string") continue;
    if (ev.type === "pageview") {
      session.views += 1;
      session.pages.push({ path: String(ev.path || "").slice(0, 120), time: nowIso });
      if (session.pages.length > 60) session.pages.shift();
    } else if (ev.type === "product_view") {
      session.views += 1;
      const name = String(ev.name || "").slice(0, 120);
      if (name) session.productViews[name] = (session.productViews[name] || 0) + 1;
    } else if (ev.type === "cart_add") {
      session.cartAdds.push({
        product: String(ev.product || "").slice(0, 120),
        qty: Math.min(99, parseInt(ev.qty, 10) || 1),
        price: Math.max(0, Number(ev.price) || 0),
        time: nowIso,
      });
      if (session.cartAdds.length > 30) session.cartAdds.shift();
    } else if (ev.type === "cart_open") {
      session.cartOpened += 1;
    } else if (ev.type === "checkout_start") {
      session.checkoutStarted += 1;
    }
  }
  if (store.sessions.length > 5000) store.sessions.length = 5000;
  store.events.push({ vid, events: list, time: nowIso });
  if (store.events.length > 5000) store.events.splice(0, store.events.length - 5000);
  await saveVisitors(store);
}

async function clearVisitors() {
  if (USE_PG) return pgSet("visitors", EMPTY_VISITORS);
  return writeJson(VISITORS_FILE, EMPTY_VISITORS);
}

module.exports = {
  getProducts,
  saveProducts,
  getProductsHistory,
  restoreProducts,
  getFestival,
  saveFestival,
  saveUpload,
  getUpload,
  getOrders,
  addOrder,
  updateOrder,
  getEnquiries,
  addEnquiry,
  getVendors,
  addVendor,
  getVisitors,
  addVisitorBatch,
  clearVisitors,
  DATA_DIR,
  USE_PG,
};
