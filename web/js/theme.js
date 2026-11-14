"use strict";
/* Light/dark toggle. Follows the system setting until the person clicks the toggle; the choice is then saved in
   localStorage (this browser only). Every storage call is wrapped, so the page works with storage blocked.
   ?theme=dark or ?theme=light forces a theme for one page view and is never saved (for screenshots).
   Load this script in <head> so a saved theme is applied before the first paint. */
(function (win, doc) {
  var KEY = "cct_theme"; // change per project so two apps on one origin do not share it
  var root = doc.documentElement;
  function valid(v) { return v === "dark" || v === "light" ? v : null; }
  function stored() { try { return valid(win.localStorage.getItem(KEY)); } catch (e) { return null; } }
  function remember(v) { try { win.localStorage.setItem(KEY, v); } catch (e) { /* private window or blocked storage */ } }
  function system() { return win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  function current() { return valid(root.getAttribute("data-theme")) || system(); }
  function paint() {
    var b = doc.getElementById("theme-toggle");
    if (!b) return;
    var dark = current() === "dark";
    b.setAttribute("aria-pressed", dark ? "true" : "false");
    b.textContent = dark ? "Light mode" : "Dark mode";
  }
  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    remember(next);
    paint();
  }
  var forced = null;
  try { forced = valid(new win.URLSearchParams(win.location.search).get("theme")); } catch (e) { forced = null; }
  var first = forced || stored();
  if (first) root.setAttribute("data-theme", first);
  function wire() {
    var b = doc.getElementById("theme-toggle");
    if (b) b.addEventListener("click", toggle);
    paint();
    if (win.matchMedia) {
      var m = win.matchMedia("(prefers-color-scheme: dark)");
      if (m && m.addEventListener) m.addEventListener("change", paint);
    }
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", wire); else wire();
})(window, document);
