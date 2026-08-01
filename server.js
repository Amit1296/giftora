const http = require("http");
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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

const sessions = new Set();

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "_" + pad(d.getHours()) + "-" + pad(d.getMinutes()) + "-" + pad(d.getSeconds())
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readAdminConfig() {
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    return { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS };
  }
  try {
    return JSON.parse(fs.readFileSync(ADMIN_CONFIG, "utf8"));
  } catch {
    return { username: "admin", password: "giftora2026" };
  }
}

function requireAuth(req, res) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { success: false, message: "Unauthorized. Please log in." });
    return null;
  }
  return token;
}

const CACHE_EXTENSIONS = {
  ".html": "no-cache",
  ".js": "no-cache, must-revalidate",
  ".css": "no-cache, must-revalidate",
  ".json": "no-cache, must-revalidate",
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
        const orderId = "order_" + timestamp();
        db.addOrder({ ...data, orderId, _file: orderId, status: "New", date: new Date().toISOString() });
        sendOrderEmail(data, orderId);
        return sendJson(res, 200, { success: true, orderId });
      } catch (e) {
        console.error("Order error:", e.message);
        return sendJson(res, 400, { success: false, message: "Could not save your order." });
      }
    }

    if (url.pathname === "/api/enquiry") {
      try {
        const data = JSON.parse(await readBody(req));
        db.addEnquiry({ ...data, _file: "enquiry_" + timestamp(), date: new Date().toISOString() });
        sendEnquiryEmail(data);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Enquiry error:", e.message);
        return sendJson(res, 400, { success: false, message: "Could not save your message." });
      }
    }

    /* ---------- Admin auth ---------- */
    if (url.pathname === "/api/admin/login") {
      try {
        const { username, password } = JSON.parse(await readBody(req));
        const cfg = readAdminConfig();
        if (username === cfg.username && password === cfg.password) {
          const token = crypto.randomBytes(24).toString("hex");
          sessions.add(token);
          return sendJson(res, 200, { success: true, token });
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
    return sendJson(res, 200, { success: true, products: db.getProducts() });
  }

  /* ---------- Admin GET/PUT endpoints ---------- */
  if (url.pathname.startsWith("/api/admin")) {
    const auth = requireAuth(req, res);
    if (!auth) return;

    if (url.pathname === "/api/admin/products" && method === "GET") {
      return sendJson(res, 200, { success: true, products: db.getProducts() });
    }

    if (url.pathname === "/api/admin/products" && method === "PUT") {
      try {
        const { products } = JSON.parse(await readBody(req));
        if (!Array.isArray(products)) throw new Error("bad payload");
        db.saveProducts(products);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save products." });
      }
    }

    if (url.pathname === "/api/admin/orders" && method === "GET") {
      return sendJson(res, 200, { success: true, orders: db.getOrders() });
    }

    if (url.pathname === "/api/admin/orders" && method === "PUT") {
      try {
        const { file, status } = JSON.parse(await readBody(req));
        db.updateOrder(file, { status });
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not update order." });
      }
    }

    if (url.pathname === "/api/admin/enquiries" && method === "GET") {
      return sendJson(res, 200, { success: true, enquiries: db.getEnquiries() });
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

function sendOrderEmail(order, orderId) {
  const lines = order.items.map((i) => `- ${i.qty} x ${i.name} @ Rs.${i.price}`).join("\n");
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
