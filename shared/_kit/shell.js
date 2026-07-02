/* shared/_kit/shell.js — เปลือกร่วมของ Swing Workbench (offline, vanilla)
   ----------------------------------------------------------------------------
   ฉีดเปลือกเดียวกันลงทุกหน้า:
     · เดสก์ท็อป → sidebar ซ้าย (ย่อ/ขยายได้)   · มือถือ → bottom tab bar
     · ปุ่มสลับธีม (มืด/สว่าง) ตำแหน่งเดียวกันทุกหน้า → ยิง event "sw:themechange"
   อ่านเมนูจาก window.NAV (shared/_kit/nav.js) → เพิ่ม/ลบเมนู = แก้ NAV ที่เดียว

   วิธีใช้ต่อหน้า: โหลด nav.js แล้ว shell.js (ท้าย body) ·
     <html data-shell-root=".."> บอกระดับโฟลเดอร์ (กัน path พังตอนเปิด file://) ·
     <body data-nav="board"> บอกว่าหน้านี้คือเมนูไหน (ทำ active) ·
     ถ้าหน้ามี <div id="sw-content"> จะใช้เป็นพื้นที่เนื้อหา; ไม่มีก็ห่อ body ให้
   ใส่ data-shell-skip-toggle ที่ <html> = ไม่ฉีดปุ่มธีม (หน้าที่มีปุ่มเองอยู่แล้ว) */
(function () {
  "use strict";
  if (document.querySelector(".sw-shell-side, .sw-shell-bottom")) return; // กันฉีดซ้ำ
  var doc = document, el = doc.documentElement;
  var NAV = window.NAV || [];
  var ROOT = el.getAttribute("data-shell-root") || ".";
  var ACTIVE = (doc.body && doc.body.getAttribute("data-nav")) || "";
  var SKIP_TOGGLE = el.hasAttribute("data-shell-skip-toggle");
  var KEY = (window.__SW && window.__SW.key) || "sw_theme";

  // ฉากพาสเทลร่วม (หลังเปลือกกระจก) — ฉีดทุกหน้าให้กระจกอ่านออกเหมือนกัน (style อยู่ shell.css)
  if (!doc.querySelector(".sw-scene")) {
    var scene = doc.createElement("div");
    scene.className = "sw-scene"; scene.setAttribute("aria-hidden", "true");
    doc.body.insertBefore(scene, doc.body.firstChild);
  }

  function href(navHref) { return (ROOT === "." ? "" : ROOT + "/") + navHref; }

  // ---- inline SVG icons (offline — ไม่มี icon font) : stroke = currentColor ----
  var PATHS = {
    home:    '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
    board:   '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    replay:  '<path d="M7 5v14l11-7z"/>',
    academy: '<path d="M3 9l9-4.5L21 9l-9 4.5z"/><path d="M7 11.2V16c0 1.2 2.4 2.4 5 2.4s5-1.2 5-2.4v-4.8"/>',
    briefing:'<path d="M3 18.5h18"/><path d="M12 9a4.6 4.6 0 0 1 4.6 4.6H7.4A4.6 4.6 0 0 1 12 9z"/><path d="M12 4.4V6M5 7.7l1.1 1.1M19 7.7l-1.1 1.1M2.6 13.6H4.2M19.8 13.6h1.6"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8"/>',
    moon:    '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5 6 6 0 0 0 19 14.5z"/>',
    menu:    '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (PATHS[name] || "") + "</svg>";
  }

  function navItemsHTML(forBottom) {
    return NAV.filter(function (n) { return forBottom ? n.bottom : true; }).map(function (n) {
      var on = n.id === ACTIVE ? " active" : "";
      var cls = forBottom ? "sw-tab" : "sw-nav-item";
      return '<a class="' + cls + on + '" href="' + href(n.href) + '" data-nav-id="' + n.id + '"' +
        (on ? ' aria-current="page"' : "") + ">" + icon(n.icon, forBottom ? 22 : 20) +
        '<span class="sw-label">' + n.label + "</span></a>";
    }).join("");
  }

  function themeBtnHTML() {
    if (SKIP_TOGGLE) return "";
    var dark = el.getAttribute("data-theme") === "dark";
    return '<button type="button" class="sw-iconbtn sw-theme-btn" aria-label="สลับธีมมืด/สว่าง" title="สลับธีมมืด/สว่าง">' +
      icon(dark ? "sun" : "moon", 19) + "</button>";
  }

  // ---- build sidebar (เดสก์ท็อป) ----
  var side = doc.createElement("aside");
  side.className = "sw-shell-side";
  side.innerHTML =
    '<div class="sw-brand">' +
      '<button type="button" class="sw-iconbtn sw-collapse" id="swCollapse" aria-label="ย่อ/ขยายเมนู">' + icon("menu", 18) + "</button>" +
      '<a class="sw-logo" href="' + href("index.html") + '" aria-label="หน้าแรก Swing Workbench">' +
        '<span class="sw-logo-mark">SW</span><span class="sw-label sw-logo-text">Swing Workbench</span>' +
      "</a>" +
    "</div>" +
    '<nav class="sw-nav" aria-label="เมนูหลัก">' + navItemsHTML(false) + "</nav>" +
    '<div class="sw-side-foot">' + themeBtnHTML() + "</div>";

  // ---- build bottom-nav (มือถือ) ----
  var bottom = doc.createElement("nav");
  bottom.className = "sw-shell-bottom";
  bottom.setAttribute("aria-label", "เมนูหลัก (มือถือ)");
  bottom.innerHTML = navItemsHTML(true);

  // ---- build top-bar (มือถือ): โลโก้ + ปุ่มธีม — bottom-nav ไม่มีที่ใส่ปุ่มธีม ----
  var top = doc.createElement("header");
  top.className = "sw-shell-top";
  top.innerHTML =
    '<a class="sw-logo" href="' + href("index.html") + '" aria-label="หน้าแรก Swing Workbench">' +
      '<span class="sw-logo-mark">SW</span><span class="sw-logo-text">Swing Workbench</span></a>' +
    '<span class="sw-top-actions">' + themeBtnHTML() + "</span>";

  // ---- หาพื้นที่เนื้อหา: ใช้ #sw-content ถ้ามี ไม่งั้นห่อ body children ----
  var content = doc.getElementById("sw-content");
  if (!content) {
    content = doc.createElement("div");
    content.id = "sw-content";
    while (doc.body.firstChild) content.appendChild(doc.body.firstChild);
  }
  content.classList.add("sw-main");

  var layout = doc.createElement("div");
  layout.className = "sw-layout";
  layout.appendChild(side);
  layout.appendChild(content);
  doc.body.appendChild(top);
  doc.body.appendChild(layout);
  doc.body.appendChild(bottom);

  // ---- theme toggle (ปุ่มธีมมีได้หลายที่: sidebar เดสก์ท็อป + top-bar มือถือ) ----
  function themeBtns() { return doc.querySelectorAll(".sw-theme-btn"); }
  function applyThemeIcon() {
    var ic = icon(el.getAttribute("data-theme") === "dark" ? "sun" : "moon", 19);
    Array.prototype.forEach.call(themeBtns(), function (b) { b.innerHTML = ic; });
  }
  function setTheme(t) {
    el.setAttribute("data-theme", t);
    try { localStorage.setItem(KEY, t); } catch (e) { /* blocked */ }
    applyThemeIcon();
    window.dispatchEvent(new CustomEvent("sw:themechange", { detail: { theme: t } }));
  }
  Array.prototype.forEach.call(themeBtns(), function (b) {
    b.addEventListener("click", function () {
      setTheme(el.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  });

  // ---- sidebar collapse (จำสถานะ) ----
  try { if (localStorage.getItem("sw_side") === "1") doc.body.classList.add("sw-collapsed"); } catch (e) { /* */ }
  var cbtn = doc.getElementById("swCollapse");
  if (cbtn) cbtn.addEventListener("click", function () {
    var collapsed = doc.body.classList.toggle("sw-collapsed");
    try { localStorage.setItem("sw_side", collapsed ? "1" : "0"); } catch (e) { /* */ }
  });

  // ---- momentum scroll (Lenis) — ต่อที่เปลือกร่วม = ทุกหน้า skin terminal ได้ฟีลเลื่อนเดียวกัน ----
  // เดิมต่อแบบ inline เฉพาะ index/briefing → board/replay/academy เลื่อนแบบ native = ฟีลต่าง (fix 2026-07-01)
  // เคารพ prefers-reduced-motion · degrade เงียบถ้า lib โหลดไม่ได้ (offline) · __swLenis กัน init ซ้ำ
  (function momentumScroll() {
    if (el.getAttribute("data-skin") !== "terminal" || window.__swLenis) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    function start() {
      if (!window.Lenis || window.__swLenis) return;
      window.__swLenis = new window.Lenis({ lerp: 0.12, wheelMultiplier: 1.0, smoothWheel: true });
      (function raf(t) { window.__swLenis.raf(t); requestAnimationFrame(raf); })();
    }
    if (window.Lenis) { start(); return; }            // lib โหลดมาก่อนแล้ว (เผื่อหน้าที่ยังคง <script> ใน head)
    var s = doc.createElement("script");              // ไม่มี lib → โหลดจาก shared kit เอง (path ตาม data-shell-root)
    s.src = href("shared/_kit/lenis.min.js") + "?v=20260630";
    s.onload = start;
    doc.head.appendChild(s);
  })();

  // ---- reveal-on-scroll (.t-reveal/.t-stagger) — ต่อที่เปลือกร่วมเหมือน momentum → ทุกหน้า terminal ใช้ระบบเดียว ----
  // เนื้อค่อย ๆ โผล่ตอนเลื่อน · ทิศเลือกผ่าน data-reveal ใน CSS (up/left/right/down/fade/scale) · เคารพ reduced-motion
  // progressive enhancement: ซ่อนเฉพาะเมื่อ io-ready ถูกตั้ง (JS พัง = เห็นเนื้อครบ) · ย้ายจาก inline ใน briefing (2026-07-01)
  (function revealOnScroll() {
    if (el.getAttribute("data-skin") !== "terminal") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    el.classList.add("io-ready");
    var STEP = 85;
    doc.querySelectorAll(".t-stagger").forEach(function (g) {
      for (var i = 0; i < g.children.length; i++) { g.children[i].style.transitionDelay = (i * STEP) + "ms"; }
    });
    var targets = doc.querySelectorAll(".t-reveal, .t-stagger");
    var ioFired = false;
    var io = new IntersectionObserver(function (es) {
      ioFired = true;
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    for (var k = 0; k < targets.length; k++) io.observe(targets[k]);
    // failsafe กันเนื้อหาย: ถ้า IO ไม่ยิงเลย (แท็บพื้นหลัง · IO/rAF หยุดตอน tab hidden) → เผยทุกชิ้นหลัง 1.6s
    // (setTimeout ยิงแม้ tab hidden) · foreground ปกติ IO ยิงทันที ioFired=true → failsafe ไม่ทำงาน
    setTimeout(function () { if (!ioFired) { for (var i = 0; i < targets.length; i++) targets[i].classList.add("in"); } }, 1600);
  })();

  // เผื่อหน้าอื่นอยากเรียกใช้
  window.SWShell = { setTheme: setTheme, icon: icon };
})();
