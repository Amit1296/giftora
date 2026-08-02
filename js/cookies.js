(() => {
  const KEY = "giftora_cookies";
  const banner = document.getElementById("cookieBanner");

  function read() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function write(value) {
    try { localStorage.setItem(KEY, value); } catch {}
  }

  const onAccept = [];

  function hide() {
    if (!banner) return;
    banner.classList.remove("show");
    banner.setAttribute("aria-hidden", "true");
  }

  function show() {
    if (!banner) return;
    banner.classList.add("show");
    banner.setAttribute("aria-hidden", "false");
  }

  function acceptAll() {
    write("all");
    hide();
    onAccept.forEach((fn) => { try { fn(); } catch {} });
  }

  function decline() {
    write("essential");
    hide();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-cookie-accept]")) {
      acceptAll();
    } else if (e.target.closest("[data-cookie-decline]")) {
      decline();
    } else if (e.target.closest("[data-cookie-settings]")) {
      e.preventDefault();
      show();
    }
  });

  window.GiftoraCookies = {
    accepted: () => read() === "all",
    status: () => read() || "unset",
    review: () => show(),
    onAccept: (fn) => {
      if (typeof fn === "function") onAccept.push(fn);
    },
  };

  if (read()) {
    hide();
  } else {
    setTimeout(show, 800);
  }
})();
