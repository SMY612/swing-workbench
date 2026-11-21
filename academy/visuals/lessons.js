/* academy/visuals/lessons.js — ทะเบียนบทเรียน (LESSONS) + แถบ "บทก่อน/ถัดไป" (offline, vanilla)
   --------------------------------------------------------------------------------------------
   LESSONS[] = ลำดับคอร์สกติกา canonical_v2 (mirror ของ <ol class="course"> ในหน้า index.html)
   เพิ่มบทใหม่ = เพิ่ม 1 entry ที่นี่ (+ การ์ด/ลิสต์ในหน้า index ถ้าต้องการให้โผล่ในห้องสมุดด้วย)
   หน้าใดที่ slug ตรงกับ LESSONS จะได้แถบ prev/next อัตโนมัติ (วางใน #sw-content หลัง shell ฉีดเสร็จ)
   หน้านอกคอร์ส (index / passive-vs-active / team-pipeline) โหลดไฟล์นี้ได้ — แค่ไม่ render แถบ */
(function () {
  "use strict";

  // ทะเบียนเดียว — ลำดับ = ลำดับในอาเรย์ (order เติมให้อัตโนมัติ)
  var LESSONS = [
    { slug: "read-the-chart",   title: "อ่านกราฟให้เป็น" },
    { slug: "adx",              title: "ADX / ATR — วัดแรงและวัดเหวี่ยง" },
    { slug: "setup-patterns",   title: "กติกา Breakout v2 + ทำไม Pullback ถูกพัก" },
    { slug: "stop-target-exit", title: "Stop · Target · ออกเมื่อไหร่" },
    { slug: "position-sizing",  title: "ขนาดไม้ (Position Sizing)" },
    { slug: "rr-expectancy",    title: "R:R & Expectancy" },
    { slug: "process-map",      title: "แผนที่กระบวนการ + เครื่องยนต์" },
    { slug: "backtest-verdict", title: "อ่านผลสอบ backtest ให้เป็น" },
    { slug: "risk-milestones",  title: "เกราะกันพัง + บันไดปลดล็อก" },
    { slug: "v2-exam",          title: "สอบรวมก่อนลงสนาม (paper)" },
  ];
  LESSONS.forEach(function (l, i) { l.order = i + 1; });
  window.LESSONS = LESSONS;

  function currentSlug() {
    var base = (location.pathname || "").split("/").pop() || "";
    return base.replace(/\.html?$/i, "");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("lesson-nav-css")) return;
    var css = document.createElement("style");
    css.id = "lesson-nav-css";
    css.textContent =
      ".lesson-nav{display:flex;gap:1rem;flex-wrap:wrap;margin:clamp(2rem,5vh,3.5rem) 0 0;}" +
      ".lesson-nav a{flex:1 1 0;min-width:min(260px,100%);display:flex;flex-direction:column;gap:.2rem;" +
        "padding:.85rem 1.1rem;border:1px solid var(--line2);border-radius:14px;background:var(--surface);" +
        "color:var(--ink);box-shadow:var(--shadow);transition:border-color .15s ease,transform .15s ease;}" +
      ".lesson-nav a:hover{text-decoration:none;border-color:var(--blue);transform:translateY(-1px);}" +
      ".lesson-nav .ln-next{text-align:right;align-items:flex-end;}" +
      ".lesson-nav .ln-dir{font-size:.8125rem;font-weight:600;color:var(--ink3);}" +
      ".lesson-nav .ln-title{font-size:1rem;font-weight:600;color:var(--blue-ink);}" +
      "@media(max-width:560px){.lesson-nav{flex-direction:column;}.lesson-nav .ln-next{text-align:left;align-items:flex-start;}}";
    document.head.appendChild(css);
  }

  function linkHTML(lesson, dir) {
    var isNext = dir === "next";
    var cls = isNext ? "ln-next" : "ln-prev";
    var label = isNext ? "บทถัดไป →" : "← บทก่อนหน้า";
    var href, title;
    if (lesson) { href = "./" + lesson.slug + ".html"; title = lesson.title; }
    else { href = "./index.html"; title = isNext ? "✓ จบคอร์ส · กลับห้องสมุด" : "↩ กลับห้องสมุด"; }
    return '<a class="' + cls + '" href="' + esc(href) + '">' +
      '<span class="ln-dir">' + esc(label) + "</span>" +
      '<span class="ln-title">' + esc(title) + "</span></a>";
  }

  function render() {
    var slug = currentSlug();
    var idx = -1;
    for (var i = 0; i < LESSONS.length; i++) if (LESSONS[i].slug === slug) { idx = i; break; }
    if (idx < 0) return;                               // ไม่ใช่บทในคอร์ส → ไม่ทำอะไร
    if (document.querySelector(".lesson-nav")) return; // กัน render ซ้ำ
    injectStyle();
    var prev = idx > 0 ? LESSONS[idx - 1] : null;
    var next = idx < LESSONS.length - 1 ? LESSONS[idx + 1] : null;
    var nav = document.createElement("nav");
    nav.className = "lesson-nav";
    nav.setAttribute("aria-label", "ไปบทก่อนหน้า / บทถัดไป");
    nav.innerHTML = linkHTML(prev, "prev") + linkHTML(next, "next");
    var content = document.getElementById("sw-content") || document.body;
    var foot = content.querySelector(".foot");
    if (foot && foot.parentNode === content) content.insertBefore(nav, foot);
    else content.appendChild(nav);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
