const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const DIR = process.env.DATA_DIR || "/tmp/migrate-data";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    return null;
  }
}

async function get(key, fallback) {
  const r = await pool.query("SELECT value FROM giftora_kv WHERE key=$1", [key]);
  return r.rows.length ? r.rows[0].value : JSON.parse(JSON.stringify(fallback));
}

async function set(key, val) {
  await pool.query(
    "INSERT INTO giftora_kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(val)]
  );
}

function keyOf(x, i) {
  if (x && typeof x._file === "string" && x._file) return "_file:" + x._file;
  if (x && typeof x.id !== "undefined") return "id:" + x.id;
  if (x && typeof x.code === "string" && x.code) return "code:" + x.code;
  if (x && typeof x.orderId === "string" && x.orderId) return "orderId:" + x.orderId;
  return "i:" + i;
}

function mergeLists(existing, incoming, itemKey) {
  const out = Array.isArray(existing) ? existing : [];
  const seen = new Set(out.map((x, i) => itemKey(x, i)));
  let spill = 0;
  for (const item of incoming || []) {
    const k = itemKey(item, spill);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    spill++;
  }
  return out;
}

function mergeVisitors(cur, loc) {
  const sessions = Array.isArray(cur.sessions) ? cur.sessions.slice() : [];
  const events = Array.isArray(cur.events) ? cur.events.slice() : [];
  const vids = new Set(sessions.map((s) => s && s.vid).filter(Boolean));
  for (const s of (loc && loc.sessions) || []) {
    if (!s || !s.vid || vids.has(s.vid)) continue;
    vids.add(s.vid);
    sessions.unshift(s);
  }
  const seenEvents = new Set();
  const mergedEvents = [];
  for (const e of events.concat(loc && loc.events || [])) {
    if (!e) continue;
    const k = JSON.stringify(e).slice(0, 600);
    if (seenEvents.has(k)) continue;
    seenEvents.add(k);
    mergedEvents.push(e);
  }
  return {
    sessions: sessions.slice(0, 5000),
    events: mergedEvents.slice(0, 5000),
  };
}

async function go() {
  let orders = await get("orders", []);
  let localOrders = readJson(path.join(DIR, "orders.json"));
  if (!Array.isArray(localOrders)) localOrders = [];
  const ordersDir = path.join(DIR, "orders");
  if (fs.existsSync(ordersDir)) {
    for (const f of fs.readdirSync(ordersDir).filter((f) => f.endsWith(".json"))) {
      const d = readJson(path.join(ordersDir, f));
      if (d) {
        d._file = d._file || path.basename(f, ".json");
        localOrders.push(d);
      }
    }
  }
  orders = mergeLists(orders, localOrders, (x, i) => keyOf(x, i));
  await set("orders", orders);
  console.log("orders=" + orders.length);

  const localVisitors = readJson(path.join(DIR, "visitors.json"));
  if (localVisitors) {
    const cur = await get("visitors", { sessions: [], events: [] });
    const merged = mergeVisitors(cur, localVisitors);
    await set("visitors", merged);
    console.log("visitors=" + merged.sessions.length + " sessions, " + merged.events.length + " events");
  }

  for (const key of ["enquiries", "vendors", "coupons", "giftcards"]) {
    const local = readJson(path.join(DIR, key + ".json"));
    if (!Array.isArray(local)) continue;
    const cur = await get(key, []);
    const merged = mergeLists(cur, local, (x, i) => keyOf(x, i));
    await set(key, merged);
    console.log(key + "=" + merged.length);
  }

  await pool.end();
  console.log("IMPORT_COMPLETE");
}

go().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});