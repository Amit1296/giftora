const fs = require("fs");
const path = require("path");

const SEED_DIR = path.join(__dirname, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SEED_DIR;
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const FESTIVAL_FILE = path.join(DATA_DIR, "festival.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");
const VENDORS_FILE = path.join(DATA_DIR, "vendors.json");
const LEGACY_ORDERS = path.join(DATA_DIR, "orders");
const LEGACY_ENQUIRIES = path.join(DATA_DIR, "enquiries");

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

function seedDataDir() {
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
function getProducts() {
  return readJson(PRODUCTS_FILE, []);
}

function saveProducts(products) {
  writeJson(PRODUCTS_FILE, products);
}

/* ---------- Festival offer ---------- */
function getFestival() {
  return readJson(FESTIVAL_FILE, DEFAULT_FESTIVAL);
}

function saveFestival(festival) {
  writeJson(FESTIVAL_FILE, festival);
}

/* ---------- Orders ---------- */
function getOrders() {
  const current = readJson(ORDERS_FILE, []);
  const merged = mergeLegacy(current, readLegacyDir(LEGACY_ORDERS), "_file");
  return merged;
}

function addOrder(order) {
  const orders = getOrders();
  order._file = order._file || order.orderId || "order_" + Date.now();
  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
}

function updateOrder(file, patch) {
  const orders = getOrders();
  const i = orders.findIndex((o) => o._file === file);
  if (i >= 0) {
    orders[i] = { ...orders[i], ...patch };
    writeJson(ORDERS_FILE, orders);
  }
}

/* ---------- Enquiries ---------- */
function getEnquiries() {
  const current = readJson(ENQUIRIES_FILE, []);
  const merged = mergeLegacy(current, readLegacyDir(LEGACY_ENQUIRIES), "_file");
  return merged;
}

function addEnquiry(enquiry) {
  const list = getEnquiries();
  enquiry._file = enquiry._file || "enquiry_" + Date.now();
  list.unshift(enquiry);
  writeJson(ENQUIRIES_FILE, list);
}

/* ---------- Vendors ---------- */
function getVendors() {
  return readJson(VENDORS_FILE, []);
}

function addVendor(vendor) {
  const list = getVendors();
  vendor._file = vendor._file || "vendor_" + Date.now();
  list.unshift(vendor);
  writeJson(VENDORS_FILE, list);
}

module.exports = { getProducts, saveProducts, getFestival, saveFestival, getOrders, addOrder, updateOrder, getEnquiries, addEnquiry, getVendors, addVendor, DATA_DIR };
