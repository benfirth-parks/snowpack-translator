/* Snowpack Translator: the Light / Dark switch shared by the photo, voice and satellite text pages.
   With nothing chosen the pages follow the phone's own setting. A choice is kept on this device and applies to every
   page. Loaded in <head>, before the page is drawn, so the right colours are there from the first frame. */
(function () {
  "use strict";
  var KEY = "snowpack-theme", root = document.documentElement, mem = "";
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function saved() { var v = read(KEY) || mem; return v === "light" || v === "dark" ? v : ""; }
  function current() { return saved() || (mq && mq.matches ? "dark" : "light"); }
  function paint() {
    var s = saved(), t = current(), i;
    if (s) root.setAttribute("data-theme", s); else root.removeAttribute("data-theme");
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", t === "dark" ? "#0d151b" : "#13212c");
    var b = document.querySelectorAll("[data-theme-set]");
    for (i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", String(b[i].getAttribute("data-theme-set") === t));
  }
  function tell() { try { root.dispatchEvent(new CustomEvent("snowtheme", { detail: current() })); } catch (e) { /* very old browser: pages redraw on their next change */ } }
  function set(v) {
    if (v !== "light" && v !== "dark") return;
    mem = v; try { localStorage.setItem(KEY, v); } catch (e) { /* private browsing: kept for this visit */ }
    paint(); tell();
  }
  // The voice page used to keep its own setting, dark unless changed. A stored "light" there was a choice, so it carries over.
  if (!saved()) {
    try { var old = JSON.parse(read("snowpack-voice-settings-v1") || "null"); if (old && old.theme === "light") { mem = "light"; localStorage.setItem(KEY, "light"); } } catch (e) { /* nothing stored */ }
  }
  paint();
  document.addEventListener("DOMContentLoaded", paint); // the switch itself is not in the page yet when this first runs
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-theme-set]") : null;
    if (b) set(b.getAttribute("data-theme-set"));
  });
  var follow = function () { if (!saved()) { paint(); tell(); } };
  if (mq) { if (mq.addEventListener) mq.addEventListener("change", follow); else if (mq.addListener) mq.addListener(follow); }
  window.addEventListener("storage", function (e) { if (e.key === KEY) { mem = ""; paint(); tell(); } }); // changed on another open page
  window.SnowTheme = { get: current, set: set };
})();
