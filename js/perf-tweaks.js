/* Perf-tweaks: skip ticking UI timer intervals while the tab is hidden.
   No visual change when the page is visible. Isolated change - easy to revert. */
(function () {
	"use strict";
	if (!("hidden" in document)) return;
	var MIN_GATE_DELAY = 300;
	var nativeSetInterval = window.setInterval.bind(window);
	window.setInterval = function (handler, timeout) {
		if (typeof handler === "function" && timeout >= MIN_GATE_DELAY) {
			return nativeSetInterval(function () {
				if (!document.hidden) handler();
			}, timeout);
		}
		return nativeSetInterval(handler, timeout);
	};
})();