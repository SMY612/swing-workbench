/* shared/_kit/signals.js — การ์ด "⚡ สัญญาณ swing วันนี้" (shared component, offline, vanilla)
   ============================================================================
   ใช้ร่วม home (site-src/index.html) + สรุปเช้า (site-src/briefing.html).
   derive pass/near จาก window.WB.tickers ผ่าน window.WBUtil.verdictInfo
   (engine = source of truth — ห้ามรันกฎเอง) · เก็บเฉพาะ vb-pass→pass, vb-near→near.
   หน้าตา/สีคุมด้วย shared/_kit/signals.css (token self-contained scope ใต้ .swsig →
   render() ใส่ class นี้ให้ wrapEl อัตโนมัติ). ก๊อปแพตเทิร์นจาก earnings-calendar.js (PR #52).

   API:  window.SWSignals.render(wrapEl, opts)
         · wrapEl = element ที่จะวาดรายการลงไป (default #sigList)
         · opts.nearCap = จำนวน near สูงสุด (briefing=6 · home=ไม่จำกัด)
         · opts.passCap = จำนวน pass สูงสุด (default ไม่จำกัด)
   แถวคลิกได้เสมอ = <a href="workbench/index.html#ticker=..."> (ปลายทางเดียวทั้ง 2 หน้า).
   ============================================================================ */
(function () {
  "use strict";
  if (window.SWSignals) return;                 // guard กัน double-run
  const U = window.WBUtil;
  if (!U) return;

  // derive pass/near เอง (self-contained · ไม่พึ่ง tally() ของหน้า) — เหมือน
  // SWEarnCal อ่าน window.WB.calendar เอง · คณิตผ่าน verdictInfo เท่านั้น
  function classify() {
    const ts = U.get(window.WB, "tickers", []) || [];
    const pass = [], near = [];
    for (const t of ts) {
      if (!t) continue;
      const cls = U.verdictInfo(t).cls;          // engine = source of truth
      if (cls === "vb-pass") pass.push(t.ticker);
      else if (cls === "vb-near") near.push(t.ticker);
    }
    return { pass: pass, near: near };
  }

  function row(tk, cls, txt) {
    const tint = cls === "go" ? "rgba(36,138,61,.18)" : "var(--g-y)";
    const ink = cls === "go" ? "var(--up)" : "var(--y-ink)";
    return '<a class="lrow" href="workbench/index.html#ticker=' + encodeURIComponent(tk) + '">' +
      '<span class="av" style="background:' + tint + ';color:' + ink + '">' + U.esc(tk.slice(0, 3)) + "</span>" +
      '<div><p class="nm">' + U.esc(tk) + '</p><p class="rl">' + U.esc(txt) + "</p></div>" +
      '<span class="pill ' + cls + '">' + (cls === "go" ? "เข้าเกณฑ์" : "ใกล้") + "</span></a>";
  }

  function render(wrapEl, opts) {
    const wrap = wrapEl || U.$("#sigList");
    if (!wrap) return;
    wrap.classList.add("swsig");                 // scope token (signals.css)
    opts = opts || {};
    const passCap = opts.passCap != null ? opts.passCap : Infinity;
    const nearCap = opts.nearCap != null ? opts.nearCap : Infinity;

    const c = classify();
    const passList = passCap === Infinity ? c.pass : c.pass.slice(0, passCap);
    const nearList = nearCap === Infinity ? c.near : c.near.slice(0, nearCap);
    let out = "";
    passList.forEach(function (tk) { out += row(tk, "go", "breakout · เข้าเกณฑ์ครบ"); });
    nearList.forEach(function (tk) { out += row(tk, "near", "ใกล้เข้าเกณฑ์ · ขาดเงื่อนไขเสริม"); });
    const hidden = (c.pass.length - passList.length) + (c.near.length - nearList.length);
    if (out && hidden > 0) out += '<div class="lrow sig-more">+' + hidden + " เพิ่มเติม</div>";
    wrap.innerHTML = out ||
      '<span class="empty">ยังไม่มีหุ้นเข้าเกณฑ์หรือใกล้เข้าในวันนี้ — ตลาดเปิดรับแต่ยังไม่มี setup</span>';
  }

  window.SWSignals = { render: render };
})();
