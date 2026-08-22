/* ============================================================================
   ui.js — MyInvest Visual Kit · MOTION + NAV (Apple-style interactions)
   ----------------------------------------------------------------------------
   reveal()  — scroll-reveal via IntersectionObserver (prefers-reduced-motion aware)
   chipNav() — sticky chip nav: active-section highlight (smooth-scroll via CSS)
   tooltip() — tiny positioned tooltip helper bound to a relative container
   Exposes window.UI.
   ============================================================================ */
(function () {
  function reveal(sel) {
    const els = Array.prototype.slice.call(document.querySelectorAll(sel || '.reveal'));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    let ioFired = false;
    const io = new IntersectionObserver((entries) => {
      ioFired = true;
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
    // Safety net: เผยเฉพาะเมื่อ IO ไม่เคยยิงเลย (headless/tab ซ่อน = เนื้อจะค้างซ่อน) — ไม่ blanket-reveal ทุกครั้ง
    // ไม่งั้นเนื้อใต้ fold ถูกเผยตั้งแต่ 1.8s ก่อน user เลื่อนถึง = เสียจังหวะ reveal ตาม scroll (foreground: IO ยิง → ข้าม)
    setTimeout(function () { if (!ioFired) els.forEach(function (e) { e.classList.add('in'); }); }, 1800);
  }

  function chipNav(navSel) {
    const nav = document.querySelector(navSel || '.chipnav');
    if (!nav) return;
    const links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    const setActive = id => links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
    links.forEach(a => a.addEventListener('click', () => setActive(a.getAttribute('href').slice(1))));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.id); });
    }, { threshold: 0.5, rootMargin: '-20% 0px -60% 0px' });
    links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); if (s) io.observe(s); });
  }

  function tooltip(containerSel) {
    const host = document.querySelector(containerSel) || document.body;
    let el = host.querySelector(':scope > .tooltip');
    if (!el) { el = document.createElement('div'); el.className = 'tooltip'; host.appendChild(el); }
    return {
      el,
      show(html, x, y) { el.innerHTML = html; el.style.opacity = '1'; el.style.left = x + 'px'; el.style.top = y + 'px'; },
      hide() { el.style.opacity = '0'; }
    };
  }

  window.UI = { reveal, chipNav, tooltip };
})();
