/* ---------- 3D banner tilt (mouse parallax) ---------- */
(function () {
	"use strict";
	var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (!fine || reduced) return;

	function init() {
		document.querySelectorAll(".banner-slide").forEach(function (slide) {
			if (slide.dataset.tilt3d) return;
			slide.dataset.tilt3d = "1";
			var card = slide.querySelector(".premium-banner");
			if (!card) return;
			var raf = null;

			slide.addEventListener("mousemove", function (e) {
				if (raf) return;
				raf = requestAnimationFrame(function () {
					raf = null;
					var r = slide.getBoundingClientRect();
					var x = (e.clientX - r.left) / r.width - 0.5;
					var y = (e.clientY - r.top) / r.height - 0.5;
					card.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
					card.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg");
					card.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
					card.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
				});
			});

			slide.addEventListener("mouseleave", function () {
				card.style.setProperty("--ry", "0deg");
				card.style.setProperty("--rx", "0deg");
			});
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
