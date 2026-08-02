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
  if (!(await existsPg("products"))) {
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
  if (USE_PG) return pgSet("products", products);
  return writeJson(PRODUCTS_FILE, products);
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

module.exports = {
  getProducts,
  saveProducts,
  getFestival,
  saveFestival,
  getOrders,
  addOrder,
  updateOrder,
  getEnquiries,
  addEnquiry,
  getVendors,
  addVendor,
  DATA_DIR,
  USE_PG,
};
