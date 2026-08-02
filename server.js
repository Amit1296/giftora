const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const mailer = require("./mailer");
const db = require("./db");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const DATA_DIR = db.DATA_DIR;
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(ROOT, "uploads");
const ADMIN_CONFIG = path.join(ROOT, "admin-config.json");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const MAX_BODY = 6 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const ALLOWED_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

const sessions = new Map();
const loginFails = new Map();

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "_" + pad(d.getHours()) + "-" + pad(d.getMinutes()) + "-" + pad(d.getSeconds())
  );
}

function clientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let over = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY) {
        over = true;
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => { if (!over) resolve(raw); });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function badRequest(res, e, fallbackMsg) {
  if (e && e.message === "Body too large") {
    return sendJson(res, 413, { success: false, message: "Request too large." });
  }
  return sendJson(res, 400, { success: false, message: fallbackMsg || "Invalid request." });
}

function readAdminConfig() {
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    return { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS };
  }
  try {
    return JSON.parse(fs.readFileSync(ADMIN_CONFIG, "utf8"));
  } catch {
    const generated = {
      username: "admin",
      password: crypto.randomBytes(9).toString("hex"),
    };
    try {
      fs.writeFileSync(ADMIN_CONFIG, JSON.stringify(generated, null, 2), "utf8");
      console.warn("[ADMIN] No ADMIN_USER/ADMIN_PASS env vars and no admin-config.json found.");
      console.warn("[ADMIN] Generated admin credentials: " + generated.username + " / " + generated.password);
      console.warn("[ADMIN] Set ADMIN_USER and ADMIN_PASS env vars (Render dashboard) to lock in your own credentials.");
    } catch (e) {
      console.warn("[ADMIN] Could not persist generated admin config (" + e.message + "). Login disabled until env vars are set.");
      return null;
    }
    return generated;
  }
}

function requireAuth(req, res) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const created = sessions.get(token);
  if (!token || !created || Date.now() - created > SESSION_TTL_MS) {
    sessions.delete(token);
    sendJson(res, 401, { success: false, message: "Unauthorized. Please log in." });
    return null;
  }
  sessions.set(token, Date.now());
  return token;
}

const CACHE_EXTENSIONS = {
  ".html": "no-cache",
  ".js": "no-cache, must-revalidate",
  ".css": "no-cache, must-revalidate",
  ".json": "no-cache, must-revalidate",
  ".txt": "no-cache, must-revalidate",
  ".xml": "no-cache, must-revalidate",
  ".svg": "public, max-age=86400",
  ".png": "public, max-age=86400",
  ".jpg": "public, max-age=86400",
  ".jpeg": "public, max-age=86400",
  ".gif": "public, max-age=86400",
  ".webp": "public, max-age=86400",
  ".ico": "public, max-age=86400",
  ".woff": "public, max-age=86400",
  ".woff2": "public, max-age=86400",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const method = req.method;

  /* ---------- Public POST endpoints ---------- */
  if (method === "POST") {
    if (url.pathname === "/api/order") {
      try {
        const data = JSON.parse(await readBody(req));
        const result = await placeOrder(data);
        return sendJson(res, 200, result);
      } catch (e) {
        console.error("Order error:", e.message);
        const msg = e && e.message && e.message.startsWith("ORDER:") ? e.message.slice(6) : "Could not save your order.";
        return sendJson(res, 400, { success: false, message: msg });
      }
    }

    if (url.pathname === "/api/payment/order") {
      try {
        const data = JSON.parse(await readBody(req));
        const result = await createRazorpayOrder(data);
        return sendJson(res, 200, result);
      } catch (e) {
        console.error("Payment order error:", e.message);
        return badRequest(res, e, e && e.message ? e.message : "Could not start payment.");
      }
    }

    if (url.pathname === "/api/enquiry") {
      try {
        const data = JSON.parse(await readBody(req));
        data.name = String(data.name || "").trim().slice(0, 100);
        data.email = String(data.email || "").trim().slice(0, 150);
        data.message = String(data.message || "").trim().slice(0, 3000);
        if (!data.name || !data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email) || !data.message) {
          return sendJson(res, 400, { success: false, message: "Please provide your name, email and message." });
        }
        await db.addEnquiry({ ...data, _file: "enquiry_" + timestamp(), date: new Date().toISOString() });
        sendEnquiryEmail(data);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Enquiry error:", e.message);
        return badRequest(res, e, "Could not save your message.");
      }
    }

    if (url.pathname === "/api/vendor") {
      try {
        const data = JSON.parse(await readBody(req));
        data.businessName = String(data.businessName || "").trim().slice(0, 100);
        data.contactName = String(data.contactName || "").trim().slice(0, 100);
        data.email = String(data.email || "").trim().slice(0, 150);
        data.phone = String(data.phone || "").trim().slice(0, 20);
        if (!data.businessName || !data.contactName || !data.email || !data.phone) {
          return sendJson(res, 400, { success: false, message: "Please fill in all required fields." });
        }
        await db.addVendor({ ...data, _file: "vendor_" + timestamp(), date: new Date().toISOString() });
        sendVendorEmail(data);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Vendor error:", e.message);
        return badRequest(res, e, "Could not save your application.");
      }
    }

    /* ---------- Public tracking (visitor analytics) ---------- */
    if (url.pathname === "/api/track") {
      try {
        const body = JSON.parse(await readBody(req));
        const forwarded = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
        const rawIp = forwarded || req.socket.remoteAddress || "0.0.0.0";
        const ipHash = crypto.createHash("sha256").update(rawIp + "|giftora_track").digest("hex").slice(0, 16);
        const country =
          req.headers["cf-ipcountry"] || req.headers["x-country"] || req.headers["x-geo-country"] || "";
        const meta = { ...(body.meta || {}), country, ipHash };
        await db.addVisitorBatch(body.vid, meta, body.events, new Date().toISOString());
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Track error:", e.message);
        return sendJson(res, 400, { success: false, message: "Invalid tracking payload." });
      }
    }

    /* ---------- Admin auth ---------- */
    if (url.pathname === "/api/admin/login") {
      const ip = clientIp(req);
      const fail = loginFails.get(ip);
      if (fail && fail.count >= LOGIN_MAX_FAILS && Date.now() - fail.first < LOGIN_WINDOW_MS) {
        return sendJson(res, 429, { success: false, message: "Too many failed attempts. Try again in 15 minutes." });
      }
      try {
        const { username, password } = JSON.parse(await readBody(req));
        const cfg = readAdminConfig();
        if (!cfg) {
          return sendJson(res, 500, { success: false, message: "Admin not configured. Set ADMIN_USER and ADMIN_PASS environment variables." });
        }
        if (username === cfg.username && password === cfg.password) {
          loginFails.delete(ip);
          const token = crypto.randomBytes(24).toString("hex");
          sessions.set(token, Date.now());
          return sendJson(res, 200, { success: true, token });
        }
        if (fail && Date.now() - fail.first < LOGIN_WINDOW_MS) {
          fail.count += 1;
        } else {
          loginFails.set(ip, { count: 1, first: Date.now() });
        }
        return sendJson(res, 401, { success: false, message: "Invalid username or password." });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Invalid request." });
      }
    }

    if (url.pathname === "/api/admin/logout") {
      const header = req.headers["authorization"] || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      sessions.delete(token);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/upload") {
      const auth = requireAuth(req, res);
      if (!auth) return;
      try {
        const { name, data } = JSON.parse(await readBody(req));
        const ext = path.extname(name || "").toLowerCase();
        if (!ALLOWED_IMAGE_EXT.includes(ext)) {
          return sendJson(res, 400, { success: false, message: "Only images (png, jpg, jpeg, gif, webp) are allowed." });
        }
        const buffer = Buffer.from(data, "base64");
        if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
          return sendJson(res, 400, { success: false, message: "Image must be between 1 byte and 5 MB." });
        }
        const file = "img_" + timestamp().replace(/[^0-9]/g, "_") + crypto.randomBytes(3).toString("hex") + ext;
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOADS_DIR, file), buffer);
        return sendJson(res, 200, { success: true, url: "/uploads/" + file });
      } catch (e) {
        console.error("Upload error:", e.message);
        return sendJson(res, 400, { success: false, message: "Could not upload image." });
      }
    }

    return sendJson(res, 404, { success: false, message: "Not found." });
  }

  /* ---------- Public GET endpoints ---------- */
  if (method === "GET" && url.pathname === "/api/products") {
    return sendJson(res, 200, { success: true, products: await db.getProducts() });
  }

  if (method === "GET" && url.pathname === "/api/festival") {
    return sendJson(res, 200, { success: true, festival: await db.getFestival() });
  }

  if (method === "GET" && url.pathname === "/api/payment/config") {
    return sendJson(res, 200, {
      success: true,
      enabled: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
      key: RAZORPAY_KEY_ID || "",
      name: "Giftora",
    });
  }

  /* ---------- Admin GET/PUT endpoints ---------- */
  if (url.pathname.startsWith("/api/admin")) {
    const auth = requireAuth(req, res);
    if (!auth) return;

    if (url.pathname === "/api/admin/products" && method === "GET") {
      return sendJson(res, 200, { success: true, products: await db.getProducts() });
    }

    if (url.pathname === "/api/admin/products" && method === "PUT") {
      try {
        const { products } = JSON.parse(await readBody(req));
        if (!Array.isArray(products)) throw new Error("bad payload");
        await db.saveProducts(products);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save products." });
      }
    }

    if (url.pathname === "/api/admin/festival" && method === "GET") {
      return sendJson(res, 200, { success: true, festival: await db.getFestival() });
    }

    if (url.pathname === "/api/admin/festival" && method === "PUT") {
      try {
        const { festival } = JSON.parse(await readBody(req));
        if (!festival || typeof festival !== "object") throw new Error("bad payload");
        await db.saveFestival(festival);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save festival offer." });
      }
    }

    if (url.pathname === "/api/admin/orders" && method === "GET") {
      return sendJson(res, 200, { success: true, orders: await db.getOrders() });
    }

    if (url.pathname === "/api/admin/orders" && method === "PUT") {
      try {
        const { file, status } = JSON.parse(await readBody(req));
        await db.updateOrder(file, { status });
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not update order." });
      }
    }

    if (url.pathname === "/api/admin/enquiries" && method === "GET") {
      return sendJson(res, 200, { success: true, enquiries: await db.getEnquiries() });
    }

    if (url.pathname === "/api/admin/vendors" && method === "GET") {
      return sendJson(res, 200, { success: true, vendors: await db.getVendors() });
    }

    if (url.pathname === "/api/admin/visitors" && method === "GET") {
      return sendJson(res, 200, buildVisitorsReport(await db.getVisitors(), await db.getOrders()));
    }

    if (url.pathname === "/api/admin/visitors" && method === "DELETE") {
      await db.clearVisitors();
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 404, { success: false, message: "Not found." });
  }

  /* ---------- Static files ---------- */
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  const blocked = ["/data/", "/admin-config.json", "/mail-config.json", "/node_modules/"];
  if (blocked.some((b) => pathname.startsWith(b))) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  let filePath = path.join(ROOT, pathname);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const cacheControl = CACHE_EXTENSIONS[ext] || "no-cache";

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const compressible = [".html", ".css", ".js", ".json", ".svg", ".woff2"].includes(ext);
  const useGzip = compressible && acceptEncoding.includes("gzip");

  if (useGzip) {
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": cacheControl,
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(zlib.createGzip()).pipe(res);
    stream.on("error", () => res.end());
  } else {
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cacheControl });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("error", () => res.end());
  }
});

server.listen(PORT, () => {
  console.log("Giftora static site running at http://localhost:" + PORT);
  console.log("Admin dashboard:  http://localhost:" + PORT + "/admin.html");
  console.log("Data saved to: " + DATA_DIR);
  console.log("Uploads saved to: " + UPLOADS_DIR);
});

function visitorInterest(session, orderCount) {
  if (orderCount > 0) return "converted";
  if (session.checkoutStarted > 0) return "checkout";
  if ((session.cartAdds || []).length > 0) return "hot";
  if (Object.keys(session.productViews || {}).length > 0 || session.cartOpened > 0) return "warm";
  return "cold";
}

function buildVisitorsReport(store, orders) {
  const sessions = store.sessions || [];
  const orderByVid = {};
  for (const o of orders || []) {
    if (!o.vid) continue;
    orderByVid[o.vid] = orderByVid[o.vid] || { count: 0, ids: [] };
    orderByVid[o.vid].count += 1;
    orderByVid[o.vid].ids.push(o._file || o.orderId || "");
  }

  const enriched = sessions.map((s) => {
    const ord = orderByVid[s.vid];
    const orderCount = ord ? ord.count : 0;
    return {
      vid: s.vid,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      views: s.views || 0,
      device: s.device || "",
      browser: s.browser || "",
      os: s.os || "",
      country: s.country || "",
      referrer: s.referrer || "",
      ipHash: s.ipHash || "",
      pages: (s.pages || []).slice(-8),
      productViews: s.productViews || {},
      cartAdds: (s.cartAdds || []).slice(-5),
      cartOpened: s.cartOpened || 0,
      checkoutStarted: s.checkoutStarted || 0,
      orderCount,
      lastOrderId: ord ? ord.ids[ord.ids.length - 1] : "",
      interest: visitorInterest(s, orderCount),
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const pageCounts = {};
  const productCounts = {};
  const interestBuckets = { converted: 0, checkout: 0, hot: 0, warm: 0, cold: 0 };
  let views = 0;
  let cartAdds = 0;
  let checkouts = 0;
  let conversions = 0;
  let activeToday = 0;

  for (const s of enriched) {
    views += s.views;
    cartAdds += s.cartAdds.length;
    checkouts += s.checkoutStarted;
    conversions += s.orderCount;
    interestBuckets[s.interest] += 1;
    if ((s.lastSeen || "").slice(0, 10) === today) activeToday += 1;
    for (const p of s.pages) pageCounts[p.path] = (pageCounts[p.path] || 0) + 1;
    for (const [name, n] of Object.entries(s.productViews)) {
      productCounts[name] = (productCounts[name] || 0) + n;
    }
  }

  const sortDesc = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));

  return {
    success: true,
    sessions: enriched.slice(0, 2000),
    summary: {
      totalSessions: sessions.length,
      activeToday,
      views,
      cartAdds,
      checkouts,
      conversions,
      topPages: sortDesc(pageCounts, 10),
      topProducts: sortDesc(productCounts, 10),
      interestBuckets,
    },
  };
}

function razorpayRequest(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const auth = "Basic " + Buffer.from(RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET).toString("base64");
    const options = {
      hostname: "api.razorpay.com",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: auth,
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error((data.error && data.error.description) || ("Razorpay error " + res.statusCode)));
          }
        } catch (e) {
          reject(new Error("Razorpay error " + res.statusCode));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function createRazorpayOrder(data) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Online payments are not configured yet. Please use Cash on Delivery.");
  }
  const rawItems = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  if (!rawItems.length) throw new Error("Your cart is empty.");
  const products = await db.getProducts();
  const festival = await db.getFestival();
  const discount = festival && festival.active ? (Number(festival.discount) || 0) : 0;
  let total = 0;
  for (const it of rawItems) {
    const id = Number(it.id);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    const p = products.find((x) => x.id === id);
    if (!p) throw new Error("A product in your cart is no longer available.");
    const cap = typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
    if (qty > cap) throw new Error("Only " + cap + " of " + p.name + " in stock.");
    if (p.sizes && p.sizes.length) {
      const size = String(it.size || "");
      if (!p.sizes.includes(size)) {
        if (p.sizes.length !== 1) throw new Error("Please select a size for " + p.name + ".");
      }
    }
    const price = discount > 0 ? Math.round((p.price * (100 - discount)) / 100) : p.price;
    total += price * qty;
  }
  const order = await razorpayRequest("/v1/orders", {
    amount: Math.round(total * 100),
    currency: "INR",
    receipt: "gift_" + timestamp().replace(/[^0-9]/g, "").slice(0, 12),
    notes: { source: "giftora-store" },
  });
  return { success: true, key: RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt };
}

async function placeOrder(data) {
  const name = String(data.name || "").trim().slice(0, 100);
  const phone = String(data.phone || "").trim().slice(0, 20);
  const address = String(data.address || "").trim().slice(0, 600);
  const payment = ["Cash on Delivery", "UPI", "Card"].includes(data.payment) ? data.payment : "Cash on Delivery";
  if (!name || !phone || !/^[0-9+\-()\s]{7,20}$/.test(phone) || !address) {
    throw new Error("ORDER:Please provide a valid name, phone and address.");
  }

  const rawItems = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  if (!rawItems.length) throw new Error("ORDER:Your cart is empty.");

  const products = await db.getProducts();
  const festival = await db.getFestival();
  const discount = festival && festival.active ? (Number(festival.discount) || 0) : 0;
  const items = [];
  let total = 0;

  for (const it of rawItems) {
    const id = Number(it.id);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    const p = products.find((x) => x.id === id);
    if (!p) throw new Error("ORDER:A product in your cart is no longer available.");
    const cap = typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
    if (qty > cap) throw new Error("ORDER:Only " + cap + " of " + p.name + " in stock.");
    let size = "";
    if (p.sizes && p.sizes.length) {
      size = String(it.size || "");
      if (!p.sizes.includes(size)) {
        if (p.sizes.length === 1) size = p.sizes[0];
        else throw new Error("ORDER:Please select a size for " + p.name + ".");
      }
    }
    const price = discount > 0 ? Math.round((p.price * (100 - discount)) / 100) : p.price;
    total += price * qty;
    items.push({ id, name: p.name, qty, size, price });
  }

  const isOnline = payment === "UPI" || payment === "Card";
  let rzpPaymentId = "";
  if (isOnline) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("ORDER:Online payments are not configured yet. Please use Cash on Delivery.");
    }
    const rzpOrderId = String(data.razorpayOrderId || "").trim();
    rzpPaymentId = String(data.razorpayPaymentId || "").trim();
    const rzpSignature = String(data.razorpaySignature || "").trim();
    if (!rzpOrderId || !rzpPaymentId || !rzpSignature) {
      throw new Error("ORDER:Payment was not completed.");
    }
    const expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(rzpOrderId + "|" + rzpPaymentId).digest("hex");
    if (expected !== rzpSignature) {
      throw new Error("ORDER:Payment verification failed.");
    }
  }

  for (const it of items) {
    const p = products.find((x) => x.id === it.id);
    if (p && typeof p.stock === "number" && p.stock >= 0) {
      p.stock = Math.max(0, p.stock - it.qty);
    }
  }
  await db.saveProducts(products);

  const orderId = "order_" + timestamp();
  await db.addOrder({
    name,
    phone,
    address,
    payment,
    items,
    total,
    vid: String(data.vid || "").slice(0, 64),
    razorpayPaymentId: rzpPaymentId,
    _file: orderId,
    status: "New",
    date: new Date().toISOString(),
  });
  sendOrderEmail({ name, phone, address, payment, items, total }, orderId);
  return { success: true, orderId, total };
}

function sendOrderEmail(order, orderId) {
  const lines = order.items.map((i) => `- ${i.qty} x ${i.name}${i.size ? " (" + i.size + ")" : ""} @ Rs.${i.price}`).join("\n");
  mailer.send({
    subject: `New Order #${orderId}`,
    text:
      `New order received:\n\n` +
      `Order ID: ${orderId}\n` +
      `Name: ${order.name}\n` +
      `Phone: ${order.phone}\n` +
      `Shipping Address: ${order.address}\n` +
      `Payment Method: ${order.payment || "Cash on Delivery"}\n\n` +
      `Items:\n${lines}\n\n` +
      `Total: Rs.${order.total}`,
  });
}

function sendEnquiryEmail(enquiry) {
  mailer.send({
    subject: `New Enquiry from ${enquiry.name || "Website"}`,
    text:
      `New contact message:\n\n` +
      `Name: ${enquiry.name}\n` +
      `Email: ${enquiry.email}\n` +
      `Date: ${enquiry.date}\n\n` +
      `Message:\n${enquiry.message}`,
  });
}

function sendVendorEmail(vendor) {
  mailer.send({
    subject: `New Vendor Application from ${vendor.businessName || "Unknown Business"}`,
    text:
      `New vendor / partner application:\n\n` +
      `Business: ${vendor.businessName}\n` +
      `Contact Person: ${vendor.contactName}\n` +
      `Email: ${vendor.email}\n` +
      `Phone: ${vendor.phone}\n` +
      `City: ${vendor.city || "-"}\n` +
      `Category: ${vendor.category || "-"}\n` +
      `Website/Social: ${vendor.website || "-"}\n` +
      `Date: ${vendor.date}\n\n` +
      `Message:\n${vendor.message}`,
  });
}
