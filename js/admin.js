(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const loginView = $("#loginView");
  const dashboardView = $("#dashboardView");
  const loginBtn = $("#loginBtn");
  const loginUser = $("#loginUser");
  const loginPass = $("#loginPass");
  const loginMsg = $("#loginMsg");
  const logoutBtn = $("#logoutBtn");
  const toastEl = $("#toast");

  const TOKEN_KEY = "giftora_admin_token";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let products = [];
  let productSearchTerm = "";
  let productFilter = "all";
  let festivalProductIds = new Set();
  let festivalProductSearch = "";
  let festivalDiscount = 0;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error("Session expired. Please log in again.");
    }
    return res.json();
  }

  function logout() {
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    dashboardView.hidden = true;
    loginView.style.display = "flex";
    loginMsg.textContent = "";
  }

  async function doLogin() {
    const username = loginUser.value.trim();
    const password = loginPass.value.trim();
    if (!username || !password) {
      loginMsg.textContent = "Please enter username and password.";
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";
    loginMsg.textContent = "";
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        loginMsg.textContent = data.message || "Login failed.";
        return;
      }
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      showDashboard();
    } catch {
      loginMsg.textContent = "Could not reach the server.";
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  }

  function showDashboard() {
    loginView.style.display = "none";
    dashboardView.hidden = false;
    loadAll();
  }

  /* ---------- Tabs ---------- */
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("#tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  /* ---------- Products ---------- */
  async function loadProducts() {
    try {
      const data = await api("/api/admin/products");
      if (data.success) {
        products = data.products;
        renderProductList();
        renderFestivalProductList();
      }
    } catch (e) {
      toast(e.message);
    }
  }

  function renderProductList() {
    const term = productSearchTerm.toLowerCase();
    const list = products.filter(
      (p) =>
        (productFilter === "all" || p.category === productFilter) &&
        (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
    );
    const el = $("#productList");
    if (list.length === 0) {
      el.innerHTML = '<p class="empty-state">No products found.</p>';
      return;
    }
    el.innerHTML = list
      .map((p) => {
        const grad = p.gradient || "#f1f5f9";
        const media = p.image
          ? `<img src="${p.image}" alt="">`
          : `<span>${p.emoji || "🎁"}</span>`;
        const badge = stockBadge(p.stock);
        return `
        <div class="product-row" data-id="${p.id}">
          <div class="product-page-label">Appears on: <a href="${esc(p.category)}.html" target="_blank">${esc(pageName(p.category))}</a> ${badge}</div>
          <div class="product-thumb" style="background:${grad}">${media}</div>
          <div class="product-fields">
            <div class="form-group field-full">
              <label>Product Name</label>
              <input type="text" class="f-name" value="${esc(p.name)}">
            </div>
            <div class="form-group">
              <label>Category</label>
              <select class="f-category">
                ${categoryOptions(p.category)}
              </select>
            </div>
            <div class="form-group">
              <label>Emoji</label>
              <input type="text" class="f-emoji" value="${esc(p.emoji || "")}" placeholder="🎁">
            </div>
            <div class="form-group">
              <label>Price (₹)</label>
              <input type="number" class="f-price" value="${p.price}" min="0">
              <span class="price-preview" data-preview="${p.id}"></span>
            </div>
            <div class="form-group">
              <label>Old Price (₹)</label>
              <input type="number" class="f-oldprice" value="${p.oldPrice || 0}" min="0">
            </div>
            <div class="form-group">
              <label>Stock</label>
              <input type="number" class="f-stock" value="${p.stock == null ? "" : p.stock}" min="0" placeholder="∞ (unlimited)">
            </div>
            <div class="form-group">
              <label>SKU</label>
              <input type="text" class="f-sku" value="${esc(p.sku || "")}" placeholder="GFT-CLO-001">
            </div>
            <div class="form-group">
              <label>Badge</label>
              <select class="f-badge">
                ${badgeOptions(p.badge)}
              </select>
            </div>
            <div class="form-group">
              <label>Background Color</label>
              <input type="color" class="f-gradient" value="${toHex(grad)}" title="Pick a background color">
            </div>
            <div class="form-group field-full">
              <label>Sizes (comma separated, optional =price)</label>
              <input type="text" class="f-sizes" value="${esc(sizeEntriesHtml(p))}" placeholder="0.5 Kg=799, 1 Kg=999, 2 Kg=1799 — or S, M, L for no pricing">
            </div>
            <div class="form-group field-full">
              <label>Image</label>
              <div class="upload-row">
                <input type="file" class="upload-input" accept="image/png,image/jpeg,image/gif,image/webp" data-id="${p.id}">
                <button type="button" class="upload-label" data-for="${p.id}">📁 Upload Image</button>
                ${p.image ? `<a href="${p.image}" target="_blank" class="upload-status ok">view</a>` : ""}
                <span class="upload-status" data-status="${p.id}"></span>
              </div>
            </div>
            <div class="form-group field-full">
              <label>Description</label>
              <textarea class="f-desc" rows="3" placeholder="Product description, details and quantities (shown on product page)">${esc(p.description || "")}</textarea>
            </div>
          </div>
          <div class="product-actions">
            <button class="btn btn-danger" data-remove="${p.id}">Remove</button>
          </div>
        </div>`;
      })
      .join("");

    el.querySelectorAll(".upload-label").forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelector(`.upload-input[data-id="${btn.dataset.for}"]`).click();
      });
    });
    el.querySelectorAll(".upload-input").forEach((input) => {
      input.addEventListener("change", () => uploadImage(input));
    });
    el.querySelectorAll(".f-price, .f-oldprice").forEach((input) => {
      input.addEventListener("input", updatePricePreviews);
    });
    el.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        products = products.filter((p) => p.id !== Number(btn.dataset.remove));
        festivalProductIds.delete(Number(btn.dataset.remove));
        renderProductList();
        renderFestivalProductList();
      });
    });
    updatePricePreviews();
  }

  function updatePricePreviews() {
    const rows = $$("#productList .product-row");
    rows.forEach((row) => {
      const id = Number(row.dataset.id);
      const priceInput = row.querySelector(".f-price");
      const oldInput = row.querySelector(".f-oldprice");
      const preview = row.querySelector(".price-preview");
      if (!priceInput || !preview) return;
      const p = products.find((x) => x.id === id) || {};
      const price = Number(priceInput.value) || 0;
      const oldPrice = Number(oldInput.value) || 0;
      if (festivalDiscount > 0 && isFestivalProduct(p)) {
        const cust = customerPrice(p, price);
        const custOld = oldPrice ? customerPrice(p, oldPrice) : 0;
        preview.className = "price-preview off";
        preview.textContent =
          `Customers pay ${fmtINR(cust)}${custOld ? ` (was ${fmtINR(custOld)})` : ""} — ${festivalDiscount}% festival off`;
      } else {
        preview.className = "price-preview";
        preview.textContent = `Customers pay ${fmtINR(price)}`;
      }
    });
  }

  function addProduct() {
    const maxId = products.reduce((m, p) => Math.max(m, p.id || 0), 0);
    const id = maxId + 1;
    const category = productFilter !== "all" ? productFilter : (products[0] ? products[0].category : "clothes");
    products.unshift({
      id,
      name: "New Product",
      category,
      emoji: "🎁",
      price: 0,
      oldPrice: 0,
      stock: 10,
      sku: "",
      sizes: [],
      sizePrices: {},
      badge: null,
      gradient: "linear-gradient(135deg,#f1f5f9,#e2e8f0)",
      image: "",
      description: "",
    });
    renderProductList();
    renderFestivalProductList();
    toast("New product added. Fill in details and click Save.");
    const nameInput = document.querySelector(`.product-row[data-id="${id}"] .f-name`);
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }

  function categoryOptions(selected) {
    const cats = [...new Set(products.map((p) => p.category))].filter(Boolean);
    if (!cats.includes(selected) && selected) cats.push(selected);
    return cats.map((c) => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(c)}</option>`).join("");
  }

  function badgeOptions(selected) {
    return ["", "Sale", "Bestseller", "Premium"]
      .map((b) => `<option value="${b}"${b === selected ? " selected" : ""}>${b || "None"}</option>`)
      .join("");
  }

  function sizeEntriesHtml(p) {
    const sp = (p && p.sizePrices) || {};
    return (p && p.sizes || []).map((s) => (sp[s] != null ? `${s}=${sp[s]}` : s)).join(", ");
  }

  function parseSizeEntries(raw) {
    const sizes = [];
    const sizePrices = {};
    String(raw || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((token) => {
      const eq = token.lastIndexOf("=");
      if (eq > 0) {
        const name = token.slice(0, eq).trim();
        const price = Number(token.slice(eq + 1));
        if (name && !isNaN(price)) {
          sizes.push(name);
          sizePrices[name] = price;
          return;
        }
      }
      const m = /^(.*\S)\s+(\d+(?:\.\d+)?)$/.exec(token);
      if (m) {
        const name = m[1].trim();
        const price = Number(m[2]);
        if (name && /\d/.test(name) && !isNaN(price)) {
          sizes.push(name);
          sizePrices[name] = price;
          return;
        }
      }
      sizes.push(token);
    });
    return { sizes, sizePrices };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtINR(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }

  function isFestivalProduct(p) {
    return festivalProductIds.size === 0 || festivalProductIds.has(p.id);
  }

  function customerPrice(p, price) {
    return festivalDiscount > 0 && isFestivalProduct(p) ? Math.round((price * (100 - festivalDiscount)) / 100) : price;
  }

  const PAGE_NAMES = {
    clothes: "Clothes",
    shoes: "Shoes",
    teddy: "Teddy Bears",
    sunglasses: "Sunglasses",
    caps: "Caps & Hats",
    belts: "Belts",
    flowers: "Flowers",
    plants: "Plants",
    cakes: "Cakes",
    toys: "Toys",
    combo: "Combo Offers",
  };

  function pageName(cat) {
    return PAGE_NAMES[cat] || cat || "—";
  }

  function stockBadge(stock) {
    if (stock == null || stock === "") return "";
    const cls = stock <= 0 ? "stock-badge out" : stock <= 5 ? "stock-badge low" : "stock-badge ok";
    const txt = stock <= 0 ? "Out of stock" : stock <= 5 ? `Low: ${stock} left` : `${stock} in stock`;
    return `<span class="${cls}">${txt}</span>`;
  }

  function toHex(gradient) {
    const m = String(gradient || "").match(/#[0-9a-fA-F]{6}/);
    return m ? m[0] : "#f1f5f9";
  }

  async function saveProducts() {
    const saveBtn = $("#saveProductsBtn");
    const msg = $("#saveMsg");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    msg.className = "save-msg";
    msg.textContent = "";
    try {
      const rows = $$("#productList .product-row");
      const original = products;
      if (rows.length === 0) {
        msg.className = "save-msg err";
        msg.textContent = "Nothing to save — no products are shown. Clear the search/filter or add a product first.";
        return;
      }
      const edited = new Map();
      Array.from(rows).forEach((row) => {
        const id = Number(row.dataset.id);
        const stockVal = row.querySelector(".f-stock").value.trim();
        const sizeData = parseSizeEntries(row.querySelector(".f-sizes").value);
        edited.set(id, {
          id,
          name: row.querySelector(".f-name").value.trim() || "Untitled",
          category: row.querySelector(".f-category").value,
          emoji: row.querySelector(".f-emoji").value.trim() || "🎁",
          price: Number(row.querySelector(".f-price").value) || 0,
          oldPrice: Number(row.querySelector(".f-oldprice").value) || 0,
          stock: stockVal === "" ? null : Math.max(0, parseInt(stockVal, 10) || 0),
          sku: row.querySelector(".f-sku").value.trim(),
          sizes: sizeData.sizes,
          sizePrices: sizeData.sizePrices,
          badge: row.querySelector(".f-badge").value || null,
          gradient: "linear-gradient(135deg," + row.querySelector(".f-gradient").value + ",#f1f5f9)",
          image: (original.find((p) => p.id === id) || {}).image || "",
          description: row.querySelector(".f-desc").value.trim(),
        });
      });
      const keep = original.filter((p) => p && typeof p.id !== "undefined" && !edited.has(p.id));
      products = [...keep, ...edited.values()];
      const res = await api("/api/admin/products", {
        method: "PUT",
        body: JSON.stringify({ products }),
      });
      if (res.success) {
        msg.className = "save-msg ok";
        msg.textContent = "Products saved. Changes are live on the site.";
        toast("Products saved ✓");
        loadProducts();
      } else {
        msg.className = "save-msg err";
        msg.textContent = res.message || "Could not save.";
      }
    } catch (e) {
      msg.className = "save-msg err";
      msg.textContent = e.message;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  }

  async function restoreProducts() {
    try {
      const data = await api("/api/admin/products/history");
      const history = (data.success && data.history) || [];
      if (history.length === 0) {
        toast("No backups found.");
        return;
      }
      const label = (h, i) =>
        `${i + 1}. ${new Date(h.savedAt).toLocaleString()} — ${h.count} product${h.count === 1 ? "" : "s"}`;
      const pick = prompt(
        "Choose a backup to restore (this replaces the current catalog):\n\n" +
          history.map(label).join("\n") +
          "\n\nEnter 1–" + history.length + ":",
        "1"
      );
      if (pick === null) return;
      const index = parseInt(pick, 10) - 1;
      if (isNaN(index) || index < 0 || index >= history.length) {
        toast("Invalid choice.");
        return;
      }
      const res = await api("/api/admin/products/restore", {
        method: "POST",
        body: JSON.stringify({ index }),
      });
      if (res.success) {
        toast("Catalog restored from backup ✓");
        loadProducts();
      } else {
        toast(res.message || "Could not restore.");
      }
    } catch (e) {
      toast(e.message);
    }
  }

  async function uploadImage(input) {
    const file = input.files && input.files[0];
    const id = Number(input.dataset.id);
    const status = document.querySelector(`[data-status="${id}"]`);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = "Max 5 MB.";
      status.className = "upload-status err";
      return;
    }
    status.textContent = "Uploading...";
    status.className = "upload-status";
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const res = await api("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({ name: file.name, data: base64 }),
      });
      if (res.success) {
        const row = document.querySelector(`.product-row[data-id="${id}"]`);
        const p = products.find((x) => x.id === id);
        if (p) p.image = res.url;
        if (row) {
          row.querySelector(".product-thumb").innerHTML = `<img src="${res.url}" alt="">`;
          row.querySelector(".product-thumb").style.background = "#f1f5f9";
          const uploadRow = row.querySelector(".upload-row");
          const existing = uploadRow.querySelector('a.upload-status');
          if (existing) existing.remove();
          uploadRow.insertAdjacentHTML("beforeend", `<a href="${res.url}" target="_blank" class="upload-status ok">view</a>`);
        }
        status.textContent = "Uploaded ✓";
        status.className = "upload-status ok";
      } else {
        status.textContent = res.message || "Upload failed.";
        status.className = "upload-status err";
      }
    } catch (e) {
      status.textContent = e.message;
      status.className = "upload-status err";
    }
    input.value = "";
  }

  /* ---------- Orders ---------- */
  async function loadOrders() {
    try {
      const data = await api("/api/admin/orders");
      if (!data.success) return;
      const orders = data.orders || [];
      $("#orderCount").textContent = orders.length;
      renderOrders(orders);
    } catch (e) {
      toast(e.message);
    }
  }

  function renderOrders(orders) {
    const el = $("#ordersList");
    if (orders.length === 0) {
      el.innerHTML = '<p class="empty-state">No orders yet.</p>';
      return;
    }
    el.innerHTML = orders
      .map((o) => {
        const items = (o.items || [])
          .map((i) => `<li><span>${i.qty} × ${esc(i.name)}</span><span>₹${Number(i.price || 0).toLocaleString("en-IN")}</span></li>`)
          .join("");
        const status = o.status || "New";
        return `
        <div class="order-card">
          <div class="order-head">
            <h3>${esc(o.name || "Customer")} <span class="order-meta">#${esc(o._file || o.orderId || "")}</span></h3>
            <span class="order-meta">${esc(o.date || "")}</span>
          </div>
          <div class="order-customer">
            <div><b>Phone</b>${esc(o.phone || "")}</div>
            <div><b>Address</b>${esc(o.address || "")}</div>
            <div><b>Payment</b>${esc(o.payment || "UPI")}</div>
            ${o.deliveryDate ? `<div><b>Delivery Date</b>${esc(o.deliveryDate)}</div>` : ""}
            ${o.midnightDelivery ? `<div><b>Midnight Delivery</b>Yes (+₹${Number(o.midnightFee || 300)})</div>` : ""}
          </div>
          <ul class="order-items">${items}</ul>
          <div class="order-foot">
            <span class="order-total">₹${Number(o.total || 0).toLocaleString("en-IN")}</span>
            <select class="status-select status-${status.toLowerCase()}" data-order="${esc(o._file || o.orderId || "")}">
              ${["New", "Processing", "Delivered", "Cancelled"].map((s) => `<option value="${s}"${s === status ? " selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
        </div>`;
      })
      .join("");

    el.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const res = await api("/api/admin/orders", {
          method: "PUT",
          body: JSON.stringify({ file: sel.dataset.order, status: sel.value }),
        });
        if (res.success) {
          sel.className = "status-select status-" + sel.value.toLowerCase();
          toast("Order marked " + sel.value + " ✓");
        }
      });
    });
  }

  /* ---------- Enquiries ---------- */
  async function loadEnquiries() {
    try {
      const data = await api("/api/admin/enquiries");
      if (!data.success) return;
      const enquiries = data.enquiries || [];
      $("#enquiryCount").textContent = enquiries.length;
      renderEnquiries(enquiries);
    } catch (e) {
      toast(e.message);
    }
  }

  function renderEnquiries(enquiries) {
    const el = $("#enquiriesList");
    if (enquiries.length === 0) {
      el.innerHTML = '<p class="empty-state">No enquiries yet.</p>';
      return;
    }
    el.innerHTML = enquiries
      .map(
        (e) => `
        <div class="enquiry-card">
          <div class="enquiry-head">
            <h3>${esc(e.name || "Anonymous")} — <a href="mailto:${esc(e.email || "")}">${esc(e.email || "")}</a></h3>
            <span class="enquiry-date">${esc(e.date || "")}</span>
          </div>
          <p class="enquiry-msg">${esc(e.message || "")}</p>
        </div>`
      )
      .join("");
  }

  /* ---------- Vendors ---------- */
  async function loadVendors() {
    try {
      const data = await api("/api/admin/vendors");
      if (!data.success) return;
      const vendors = data.vendors || [];
      $("#vendorCount").textContent = vendors.length;
      renderVendors(vendors);
    } catch (e) {
      toast(e.message);
    }
  }

  function renderVendors(vendors) {
    const el = $("#vendorsList");
    if (vendors.length === 0) {
      el.innerHTML = '<p class="empty-state">No vendor applications yet.</p>';
      return;
    }
    el.innerHTML = vendors
      .map(
        (v) => `
        <div class="enquiry-card">
          <div class="enquiry-head">
            <h3>${esc(v.businessName || "Unknown Business")} — <a href="mailto:${esc(v.email || "")}">${esc(v.email || "")}</a></h3>
            <span class="enquiry-date">${esc(v.date || "")}</span>
          </div>
          <p class="enquiry-msg">
            <strong>Contact:</strong> ${esc(v.contactName || "")} &middot; ${esc(v.phone || "")}
            ${v.city ? " &middot; " + esc(v.city) : ""}
          </p>
          <p class="enquiry-msg">${v.category ? `<strong>Category:</strong> ${esc(v.category)}` : ""} ${v.website ? ` &middot; <a href="${esc(v.website)}" target="_blank" rel="noopener">${esc(v.website)}</a>` : ""}</p>
          <p class="enquiry-msg">${esc(v.message || "")}</p>
        </div>`
      )
      .join("");
  }

  /* ---------- Visitors & buying interest ---------- */
  let visitors = [];
  let visitorSearchTerm = "";

  const INTEREST_LABEL = {
    converted: "Converted",
    checkout: "Checkout",
    hot: "Hot 🔥",
    warm: "Warm",
    cold: "Cold",
  };

  const COUNTRY_FLAGS = {
    IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", PK: "🇵🇰", BD: "🇧🇩", AU: "🇦🇺",
    CA: "🇨🇦", SG: "🇸🇬", DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵", QA: "🇶🇦", SA: "🇸🇦",
  };

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function countryChip(code) {
    if (!code) return "";
    return `<span class="v-chip">${COUNTRY_FLAGS[code] || ""} ${esc(code)}</span>`;
  }

  async function loadVisitors() {
    try {
      const data = await api("/api/admin/visitors");
      if (!data.success) return;
      visitors = data.sessions || [];
      renderVisitorSummary(data.summary || {});
      renderVisitors();
    } catch (e) {
      toast(e.message);
    }
  }

  function renderVisitorSummary(summary) {
    $("#visitorCount").textContent = summary.totalSessions || 0;
    const stats = [
      { label: "Total Visitors", value: summary.totalSessions || 0 },
      { label: "Active Today", value: summary.activeToday || 0 },
      { label: "Page Views", value: summary.views || 0 },
      { label: "Cart Adds", value: summary.cartAdds || 0 },
      { label: "Checkouts", value: summary.checkouts || 0 },
      { label: "Converted (Orders)", value: summary.conversions || 0 },
    ];
    $("#visitorStats").innerHTML = stats
      .map((s) => `<div class="stat-card"><span class="stat-value">${s.value.toLocaleString("en-IN")}</span><span class="stat-label">${s.label}</span></div>`)
      .join("");

    const buckets = summary.interestBuckets || {};
    $("#visitorInterest").innerHTML =
      '<div class="insight-title">Interest levels</div>' +
      ["converted", "checkout", "hot", "warm", "cold"]
        .filter((k) => buckets[k])
        .map((k) => `<span class="interest-badge interest-${k}">${INTEREST_LABEL[k]}: ${buckets[k]}</span>`)
        .join("");

    const topHtml = [];
    const pages = summary.topPages || [];
    const products = summary.topProducts || [];
    if (pages.length) {
      topHtml.push(
        '<div class="top-col"><div class="insight-title">Top pages</div><ul>' +
        pages.map((p) => `<li><span>${esc(p.key)}</span><b>${p.count}</b></li>`).join("") +
        "</ul></div>"
      );
    }
    if (products.length) {
      topHtml.push(
        '<div class="top-col"><div class="insight-title">Most viewed products</div><ul>' +
        products.map((p) => `<li><span>${esc(p.key)}</span><b>${p.count}</b></li>`).join("") +
        "</ul></div>"
      );
    }
    $("#visitorTop").innerHTML = topHtml.join("");
  }

  function renderVisitors() {
    const term = visitorSearchTerm.toLowerCase();
    const list = visitors.filter((v) => {
      if (!term) return true;
      const hay = [
        v.vid, v.device, v.browser, v.os, v.country, v.referrer,
        ...Object.keys(v.productViews || {}),
        ...(v.cartAdds || []).map((a) => a.product),
        ...(v.pages || []).map((p) => p.path),
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });

    const el = $("#visitorsList");
    if (list.length === 0) {
      el.innerHTML = '<p class="empty-state">No visitor data yet. Visitors are tracked after they accept cookies on the site.</p>';
      return;
    }

    el.innerHTML = list.map((v) => {
      const products = [...Object.keys(v.productViews || {})];
      const added = (v.cartAdds || []).map((a) => `${a.product}${a.qty > 1 ? " ×" + a.qty : ""}`);
      const pages = (v.pages || []).map((p) => p.path).join(", ") || "—";
      const interest = INTEREST_LABEL[v.interest] || "Cold";
      return `
      <div class="visitor-card interest-${v.interest}">
        <div class="visitor-head">
          <h3>${esc(v.device || "Device")} · ${esc(v.browser || "Browser")} ${countryChip(v.country)} ${v.orderCount ? `<span class="interest-badge interest-converted">🛍 ${v.orderCount} order${v.orderCount > 1 ? "s" : ""}</span>` : ""}</h3>
          <div class="visitor-meta">
            <span>Last seen: ${fmtTime(v.lastSeen)}</span>
            <span>First visit: ${fmtDate(v.firstSeen)}</span>
            <span class="interest-badge interest-${v.interest}">${interest}</span>
          </div>
        </div>
        <div class="visitor-counters">
          <span>👁 ${v.views} views</span>
          <span>🛒 ${(v.cartAdds || []).length} cart adds</span>
          <span>💳 ${v.checkoutStarted} checkouts</span>
          ${v.lastOrderId ? `<span class="order-id">Order: ${esc(v.lastOrderId)}</span>` : ""}
        </div>
        ${added.length ? `<div class="visitor-row"><b>Added to cart:</b> ${added.map(esc).join(" · ")}</div>` : ""}
        ${products.length ? `<div class="visitor-row"><b>Interested in:</b> ${products.map(esc).join(" · ")}</div>` : ""}
        <div class="visitor-row"><b>Pages:</b> ${esc(pages)}</div>
        ${v.referrer ? `<div class="visitor-row"><b>Referrer:</b> ${esc(v.referrer)}</div>` : ""}
      </div>`;
    }).join("");
  }

  function exportVisitorsCsv() {
    if (!visitors.length) {
      toast("No visitor data to export.");
      return;
    }
    const escCsv = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const rows = visitors.map((v) => [
      v.vid,
      v.firstSeen,
      v.lastSeen,
      v.device,
      v.browser,
      v.os,
      v.country,
      v.referrer,
      v.views,
      (v.cartAdds || []).length,
      v.checkoutStarted,
      v.orderCount,
      v.interest,
      Object.keys(v.productViews || {}).join(" | "),
      (v.cartAdds || []).map((a) => a.product).join(" | "),
      (v.pages || []).map((p) => p.path).join(" | "),
    ].map(escCsv).join(","));
    const csv = [
      "vid,firstSeen,lastSeen,device,browser,os,country,referrer,views,cartAdds,checkouts,orders,interest,viewedProducts,addedProducts,pages",
      ...rows,
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "giftora-visitors-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast("CSV exported ✓");
  }

  async function clearVisitorsData() {
    if (!confirm("Delete ALL visitor tracking data? This cannot be undone.")) return;
    try {
      const res = await api("/api/admin/visitors", { method: "DELETE" });
      if (res.success) {
        visitors = [];
        renderVisitorSummary({});
        renderVisitors();
        toast("Visitor data cleared ✓");
      }
    } catch (e) {
      toast(e.message);
    }
  }

  /* ---------- Festival Offer ---------- */
  function renderFestivalPreview() {
    const url = $("#fImageInput").dataset.url || "";
    const preview = $("#fPreview");
    if (url) {
      preview.innerHTML = `<img src="${url}" alt="Banner preview">`;
      preview.style.display = "";
    } else {
      preview.innerHTML = "";
      preview.style.display = "none";
    }
  }

  async function loadFestival() {
    try {
      const data = await api("/api/admin/festival");
      if (!data.success) return;
      const f = data.festival || {};
      $("#fActive").checked = !!f.active;
      $("#fTitle").value = f.title || "";
      $("#fEmoji").value = f.emoji || "";
      $("#fSubtitle").value = f.subtitle || "";
      $("#fDiscount").value = f.discount || 0;
      $("#fCode").value = f.code || "";
      $("#fNote").value = f.note || "";
      $("#fImageInput").dataset.url = f.image || "";
      festivalProductIds = new Set(Array.isArray(f.productIds) ? f.productIds.map(Number) : []);
      festivalDiscount = f.active ? (Number(f.discount) || 0) : 0;
      renderFestivalProductList();
      renderProductList();
      renderFestivalPreview();
    } catch (e) {
      toast(e.message);
    }
  }

  async function uploadBanner() {
    const input = $("#fImageInput");
    const file = input.files && input.files[0];
    const status = $("#fImageStatus");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = "Max 5 MB.";
      status.className = "upload-status err";
      return;
    }
    status.textContent = "Uploading...";
    status.className = "upload-status";
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const res = await api("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({ name: file.name, data: base64 }),
      });
      if (res.success) {
        input.dataset.url = res.url;
        renderFestivalPreview();
        status.textContent = "Uploaded ✓";
        status.className = "upload-status ok";
      } else {
        status.textContent = res.message || "Upload failed.";
        status.className = "upload-status err";
      }
    } catch (e) {
      status.textContent = e.message;
      status.className = "upload-status err";
    }
    input.value = "";
  }

  function renderFestivalProductList() {
    const listEl = $("#fProductList");
    if (!listEl) return;
    const term = festivalProductSearch.toLowerCase();
    const list = products.filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
    );
    if (list.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No products match.</p>';
      return;
    }
    listEl.innerHTML = list
      .map((p) => {
        const checked = festivalProductIds.has(p.id) ? " checked" : "";
        const grad = p.gradient || "#f1f5f9";
        const media = p.image
          ? `<img src="${p.image}" alt="">`
          : `<span>${p.emoji || "🎁"}</span>`;
        return `
        <label class="fp-row">
          <input type="checkbox" class="fp-check" data-id="${p.id}"${checked}>
          <span class="fp-thumb" style="background:${grad}">${media}</span>
          <span class="fp-name">${esc(p.name)}</span>
          <span class="fp-cat">${esc(pageName(p.category))}</span>
        </label>`;
      })
      .join("");
  }

  async function saveFestival() {
    const btn = $("#saveFestivalBtn");
    const msg = $("#festivalMsg");
    const payload = {
      active: $("#fActive").checked,
      title: $("#fTitle").value.trim() || "Festival Offer",
      emoji: $("#fEmoji").value.trim() || "🎁",
      subtitle: $("#fSubtitle").value.trim(),
      discount: Number($("#fDiscount").value) || 0,
      code: $("#fCode").value.trim().toUpperCase(),
      note: $("#fNote").value.trim(),
      image: $("#fImageInput").dataset.url || "",
      productIds: Array.from($$("#fProductList .fp-check:checked")).map((c) => Number(c.dataset.id)),
    };
    btn.disabled = true;
    btn.textContent = "Saving...";
    msg.className = "save-msg";
    msg.textContent = "";
    try {
      const res = await api("/api/admin/festival", {
        method: "PUT",
        body: JSON.stringify({ festival: payload }),
      });
      if (res.success) {
        msg.className = "save-msg ok";
        msg.textContent = "Festival offer saved. It's live on the site.";
        toast("Festival offer saved ✓");
      } else {
        msg.className = "save-msg err";
        msg.textContent = res.message || "Could not save.";
      }
    } catch (e) {
      msg.className = "save-msg err";
      msg.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  }

  /* ---------- UPI QR ---------- */
  function renderUpiPreview() {
    const url = $("#upiQrInput").dataset.url || "";
    const preview = $("#upiQrPreview");
    if (url) {
      preview.innerHTML = `<img src="${url}" alt="UPI QR preview">`;
      preview.style.display = "";
    } else {
      preview.innerHTML = "";
      preview.style.display = "none";
    }
  }

  async function loadUpi() {
    try {
      const data = await api("/api/admin/upi");
      if (!data.success) return;
      const u = data.upi || {};
      $("#upiId").value = u.upiId || "";
      $("#upiPayee").value = u.payeeName || "Giftora";
      $("#upiQrInput").dataset.url = u.qrImage || "";
      renderUpiPreview();
    } catch (e) {
      toast(e.message);
    }
  }

  async function uploadUpiQr() {
    const input = $("#upiQrInput");
    const file = input.files && input.files[0];
    const status = $("#upiQrStatus");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = "Max 5 MB.";
      status.className = "upload-status err";
      return;
    }
    status.textContent = "Uploading...";
    status.className = "upload-status";
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const res = await api("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({ name: file.name, data: base64 }),
      });
      if (res.success) {
        input.dataset.url = res.url;
        renderUpiPreview();
        status.textContent = "Uploaded ✓";
        status.className = "upload-status ok";
      } else {
        status.textContent = res.message || "Upload failed.";
        status.className = "upload-status err";
      }
    } catch (e) {
      status.textContent = e.message;
      status.className = "upload-status err";
    }
    input.value = "";
  }

  async function saveUpi() {
    const btn = $("#saveUpiBtn");
    const msg = $("#upiMsg");
    const payload = {
      upiId: $("#upiId").value.trim(),
      payeeName: $("#upiPayee").value.trim(),
      qrImage: $("#upiQrInput").dataset.url || "",
    };
    btn.disabled = true;
    btn.textContent = "Saving...";
    msg.className = "save-msg";
    msg.textContent = "";
    try {
      const res = await api("/api/admin/upi", {
        method: "PUT",
        body: JSON.stringify({ upi: payload }),
      });
      if (res.success) {
        msg.className = "save-msg ok";
        msg.textContent = "UPI settings saved.";
        toast("UPI settings saved ✓");
      } else {
        msg.className = "save-msg err";
        msg.textContent = res.message || "Could not save.";
      }
    } catch (e) {
      msg.className = "save-msg err";
      msg.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  }

  /* ---------- Load all ---------- */
  async function loadAll() {
    await Promise.all([loadProducts(), loadFestival(), loadUpi(), loadOrders(), loadEnquiries(), loadVendors(), loadVisitors()]);
  }

  $("#productSearch").addEventListener("input", (e) => {
    productSearchTerm = e.target.value;
    renderProductList();
  });
  $("#categoryFilter").addEventListener("change", (e) => {
    productFilter = e.target.value;
    renderProductList();
  });
  $("#saveProductsBtn").addEventListener("click", saveProducts);
  $("#addProductBtn").addEventListener("click", addProduct);
  $("#restoreProductsBtn").addEventListener("click", restoreProducts);
  $("#saveFestivalBtn").addEventListener("click", saveFestival);
  $("#fUploadBtn").addEventListener("click", () => $("#fImageInput").click());
  $("#fImageInput").addEventListener("change", uploadBanner);
  $("#fProductSearch").addEventListener("input", (e) => {
    festivalProductSearch = e.target.value;
    renderFestivalProductList();
  });
  $("#fSelectAllBtn").addEventListener("click", () => {
    $$("#fProductList .fp-check").forEach((c) => {
      c.checked = true;
      festivalProductIds.add(Number(c.dataset.id));
    });
  });
  $("#fClearAllBtn").addEventListener("click", () => {
    $$("#fProductList .fp-check").forEach((c) => {
      c.checked = false;
      festivalProductIds.delete(Number(c.dataset.id));
    });
  });
  $("#fProductList").addEventListener("change", (e) => {
    if (e.target.classList.contains("fp-check")) {
      const id = Number(e.target.dataset.id);
      if (e.target.checked) festivalProductIds.add(id);
      else festivalProductIds.delete(id);
    }
  });
  $("#saveUpiBtn").addEventListener("click", saveUpi);
  $("#upiQrUploadBtn").addEventListener("click", () => $("#upiQrInput").click());
  $("#upiQrInput").addEventListener("change", uploadUpiQr);
  $("#visitorSearch").addEventListener("input", (e) => {
    visitorSearchTerm = e.target.value;
    renderVisitors();
  });
  $("#exportVisitorsBtn").addEventListener("click", exportVisitorsCsv);
  $("#clearVisitorsBtn").addEventListener("click", clearVisitorsData);
  loginBtn.addEventListener("click", doLogin);
  loginPass.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  logoutBtn.addEventListener("click", () => {
    if (token) fetch("/api/admin/logout", { headers: { Authorization: "Bearer " + token } }).catch(() => {});
    logout();
  });

  if (token) {
    loginView.style.display = "none";
    dashboardView.hidden = false;
    loadAll();
  } else {
    loginView.style.display = "flex";
  }
})();
