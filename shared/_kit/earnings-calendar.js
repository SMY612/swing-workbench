/* shared/_kit/earnings-calendar.js — ปฏิทินงบรายเดือน (shared component, offline, vanilla)
   ============================================================================
   ใช้ร่วม board (workbench/index.html) + สรุปเช้า (site-src/briefing.html).
   อ่าน window.WB.calendar [{date,ticker,days_to,blocked}] + helper จาก window.WBUtil.
   หน้าตา/สีคุมด้วย shared/_kit/earnings-calendar.css (token กระจก self-contained
   scope ใต้ .swec → render() ใส่ class นี้ให้ wrapEl อัตโนมัติ).

   API:  window.SWEarnCal.render(wrapEl, onPick)
         · wrapEl = element ที่จะวาดปฏิทินลงไป
         · onPick(ticker) = callback เมื่อคลิก badge หุ้น (board=เปิดหุ้น · briefing=ไปกระดาน)
   ยกมาจาก workbench/kit/panels.js renderCalendar() (PR #50) — logic เดียวกันเป๊ะ.
   ============================================================================ */
(function () {
  "use strict";
  if (window.SWEarnCal) return;                 // guard กัน double-run
  const U = window.WBUtil;
  if (!U) return;

  function render(wrapEl, onPick) {
    const wrap = wrapEl || U.$("#calendarWrap");
    if (!wrap) return;
    wrap.classList.add("swec");                 // scope token กระจก (earnings-calendar.css)
    const rows = (U.get(window.WB, "calendar", []) || []).filter((r) => r && r.date);
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="big">ไม่มีงบใน 10 สัปดาห์ข้างหน้า</div>' +
        "<div>ตารางจะเติมเองเมื่อรันรีเฟรชข้อมูลรอบถัดไป</div></div>";
      return;
    }
    const TH_MON = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const WD = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
    const p2 = (n) => String(n).padStart(2, "0");

    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const minY = +sorted[0].date.slice(0, 4), maxY = +sorted[sorted.length - 1].date.slice(0, 4);

    // นับงบต่อเดือน (YYYY-MM → จำนวน) สำหรับ label dropdown
    const byMonth = new Map();
    for (const r of rows) byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) || 0) + 1);

    // ตัวเลือกเดือน = ทุกเดือน (ม.ค.–ธ.ค.) ของทุกปีในช่วง (เลือกได้แม้เดือนว่าง)
    const monthOpts = [];
    for (let y = minY; y <= maxY; y++) {
      for (let m = 0; m < 12; m++) monthOpts.push({ y: y, m: m, ym: y + "-" + p2(m + 1) });
    }
    let curIdx = monthOpts.findIndex((o) => o.ym === sorted[0].date.slice(0, 7));
    if (curIdx < 0) curIdx = 0;

    // ปฏิทินเดือนเดียว — จุดงบบนวันที่ (ช่องวันโชว์ "อีก N วัน" + "✗ ห้ามเข้า" · badge = ticker)
    function monthGridHTML(year, month) {
      let h = '<div class="cal-month"><div class="cal-mhead">' + TH_MON[month] + " " + year + "</div>";
      h += '<div class="cal-grid">';
      for (const w of WD) h += '<div class="cal-wd">' + w + "</div>";
      const offset = (new Date(year, month, 1).getDay() + 6) % 7;     // 0 = จันทร์
      const daysIn = new Date(year, month + 1, 0).getDate();
      for (let i = 0; i < offset; i++) h += '<div class="cal-cell empty"></div>';
      for (let d = 1; d <= daysIn; d++) {
        const ds = year + "-" + p2(month + 1) + "-" + p2(d);
        const items = byDate.get(ds);
        let cls = "cal-cell", inner = '<span class="cal-dnum">' + d + "</span>";
        if (items && items.length) {
          const blocked = items.some((x) => x.blocked), dt = items[0].days_to;
          cls += blocked ? " has-earn blocked" : " has-earn";
          if (dt != null) inner += '<span class="cal-cdays">อีก ' + dt + " วัน</span>";
          if (blocked) inner += '<span class="cal-cblock">✗ ห้ามเข้า (≤' + U.earnMinDays() + "ว)</span>";
          inner += '<div class="cal-evs">' + items.map((x) =>
            '<button type="button" class="cal-ev" data-ticker="' + U.esc(x.ticker || "") +
            '" title="' + U.esc((x.ticker || "") + " — งบ" + (dt != null ? " · อีก " + dt + " วัน" : "") + (x.blocked ? " (ติดงบ ห้ามเข้า)" : "")) + '">' +
            U.esc(x.ticker || "") + "</button>").join("") + "</div>";
        }
        h += '<div class="' + cls + '">' + inner + "</div>";
      }
      return h + "</div></div>";
    }

    // โครง: ◂ + custom dropdown (ปุ่ม + เมนูกระจก — สั่งสไตล์ได้เต็ม ไม่ใช้ native select) + ▸
    const optLabel = (o) => { const c = byMonth.get(o.ym); return TH_MON[o.m] + " " + o.y + (c ? " · " + c + " ตัว" : ""); };
    const optsHTML = monthOpts.map((o, i) =>
      '<button type="button" class="cal-mopt" role="option" data-idx="' + i + '">' + optLabel(o) + "</button>").join("");
    wrap.innerHTML =
      '<div class="cal-picker">' +
        '<button type="button" class="cal-nav" id="calPrev" aria-label="เดือนก่อนหน้า">◂</button>' +
        '<div class="cal-seldd">' +
          '<button type="button" class="cal-msel" id="calMonthBtn" aria-haspopup="listbox" aria-expanded="false">' +
            '<span id="calMonthLbl"></span>' +
            '<svg class="cal-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
          "</button>" +
          '<div class="cal-menu" id="calMonthMenu" role="listbox" hidden>' + optsHTML + "</div>" +
        "</div>" +
        '<button type="button" class="cal-nav" id="calNext" aria-label="เดือนถัดไป">▸</button>' +
      '</div><div id="calMonthHost"></div>';

    const host = U.$("#calMonthHost"), btn = U.$("#calMonthBtn"), lbl = U.$("#calMonthLbl"),
      menu = U.$("#calMonthMenu"), prev = U.$("#calPrev"), next = U.$("#calNext");
    const opts = menu.querySelectorAll(".cal-mopt");
    function setMenu(open) {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("open", open);
      if (open) { const s = menu.querySelector(".cal-mopt.sel"); if (s) s.scrollIntoView({ block: "nearest" }); }
    }
    function showIdx(idx) {
      curIdx = Math.max(0, Math.min(monthOpts.length - 1, idx));
      const o = monthOpts[curIdx];
      host.innerHTML = monthGridHTML(o.y, o.m);
      lbl.textContent = optLabel(o);
      opts.forEach((el, i) => el.classList.toggle("sel", i === curIdx));
      prev.disabled = curIdx === 0;
      next.disabled = curIdx === monthOpts.length - 1;
      host.querySelectorAll(".cal-ev").forEach((b) => {
        b.addEventListener("click", () => { if (onPick && b.dataset.ticker) onPick(b.dataset.ticker); });
      });
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(menu.hidden); });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest(".cal-mopt");
      if (b) { showIdx(+b.dataset.idx); setMenu(false); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".cal-seldd")) setMenu(false); });
    prev.addEventListener("click", () => showIdx(curIdx - 1));
    next.addEventListener("click", () => showIdx(curIdx + 1));
    showIdx(curIdx);
  }

  window.SWEarnCal = { render: render };
})();
