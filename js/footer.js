(() => {
  const form = document.getElementById("gtForm");
  const ok = document.getElementById("gtOk");
  const email = document.getElementById("gtEmail");

  if (form && ok && email) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button");
      const value = email.value.trim();
      if (!value) return;
      if (btn) btn.disabled = true;
      try {
        const res = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value, source: "footer" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          ok.textContent = data.exists
            ? "You're already on the list — we'll be in touch!"
            : "You're on the list. Check your inbox!";
          ok.classList.add("show");
          form.reset();
        } else {
          ok.textContent = data.message || "Something went wrong. Please try again.";
          ok.style.color = "#fca5a5";
          ok.classList.add("show");
        }
      } catch (err) {
        ok.textContent = "Network error. Please try again.";
        ok.style.color = "#fca5a5";
        ok.classList.add("show");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  const cityInput = document.getElementById("gtCity");
  const cityList = document.getElementById("gtCityList");
  const cityClear = document.getElementById("gtCityClear");
  const cityStatus = document.getElementById("gtCityStatus");

  if (cityInput && cityList && cityStatus) {
    const items = Array.from(cityList.children);
    const total = items.length;

    function render() {
      const v = cityInput.value.trim().toLowerCase();
      let shown = 0;
      items.forEach((li) => {
        const hit = !v || li.textContent.toLowerCase().includes(v);
        li.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      if (cityClear) cityClear.classList.toggle("show", !!v);
      cityStatus.textContent = v
        ? shown + " of " + total + " cities match \"" + cityInput.value.trim() + "\""
        : "";
    }

    cityInput.addEventListener("input", render);
    cityInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        cityInput.value = "";
        render();
      }
    });
    if (cityClear) {
      cityClear.addEventListener("click", () => {
        cityInput.value = "";
        render();
        cityInput.focus();
      });
    }
  }
})();