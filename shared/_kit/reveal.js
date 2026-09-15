/* ============================================================================
   shared/_kit/reveal.js — scroll-reveal (ยกจาก academy ui.js → shared, ใช้ซ้ำได้ทุกหน้า)
   ----------------------------------------------------------------------------
   ใส่ class "reveal" ที่ element ใดก็ได้ → ค่อย ๆ จาง + เลื่อนขึ้นตอนเลื่อนถึง
   - เคารพ prefers-reduced-motion (ปิด motion ให้)
   - มี safety net: เผยทุกอันที่ยังซ่อนหลัง ~1.8 วิ (กัน section ค้างเปล่าใน headless/prerender)
   - ต้องมี html.js (ตั้งใน <head>) + .reveal CSS ใน components.css จึงจะซ่อน-เผย
   เรียกซ้ำได้ผ่าน window.SWReveal() หลัง render เนื้อหาแบบ dynamic
   ============================================================================ */
(function () {
  function reveal(sel) {
    var els = Array.prototype.slice.call(document.querySelectorAll(sel || ".reveal"));
    if (!els.length) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var ioFired = false;
    var io = new IntersectionObserver(function (entries) {
      ioFired = true;
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
    // เผยเฉพาะเมื่อ IO ไม่เคยยิงเลย (headless/tab ซ่อน) — ไม่งั้นเนื้อใต้ fold โผล่ก่อน scroll ถึง (เสียจังหวะ reveal)
    setTimeout(function () {
      if (!ioFired) els.forEach(function (e) { e.classList.add("in"); });
    }, 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { reveal(); });
  } else {
    reveal();
  }
  window.SWReveal = reveal;
})();
