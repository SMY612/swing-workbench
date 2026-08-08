/* Swing Workbench — table.js: กระดานเฝ้าดู (สองมุมมอง ตลาด/คำตัดสิน) — แสดงผล/เรียง/กรองเท่านั้น */
(function () {
  "use strict";
  const U = window.WBUtil;
  let onSelect = null, onSort = null;
  let lastVisible = [];

  const g = (path) => (t) => U.get(t, path, null);

  // ---------- column registry (board table) — ทะเบียนคอลัมน์เดียว ----------
  // 1 entry = 1 คอลัมน์ · ระบุ views ว่าโผล่ในมุมมองไหน ("market" ตัวเลขตลาด / "status" คำตัดสิน)
  // เพิ่มคอลัมน์ใหม่ = เพิ่ม 1 entry: ใช้ val (ฟังก์ชัน) หรือ path:"ind.xxx" (declarative) อย่างใดอย่างหนึ่ง
  const COLUMNS = [
    { key: "ticker", th: "Ticker", views: ["market", "status"], val: (t) => t.ticker, str: true },
    // — มุมมองตลาด (market) —
    { key: "close", th: "Close", views: ["market"], val: g("ind.close"), fmt: (v) => U.fmtPrice(v) },
    { key: "d1", th: "1D%", views: ["market"], val: g("ind.d1_pct"), pct: true },
    { key: "d5", th: "5D%", views: ["market"], val: g("ind.d5_pct"), pct: true },
    { key: "d20", th: "20D%", views: ["market"], val: g("ind.d20_pct"), pct: true },
    { key: "vs50", th: "เทียบ SMA50", views: ["market"], val: g("ind.pct_vs_sma50"), pct: true },
    { key: "atr", th: "ATR%", views: ["market"], val: g("ind.atr_pct"), fmt: (v) => U.isNum(v) ? U.fmtNum(v, 2) + "%" : "—" },
    { key: "adx", th: "ADX", views: ["market"], val: g("ind.adx14"), fmt: (v) => U.fmtNum(v, 1) },
    { key: "vol", th: "Vol เทียบเฉลี่ย", views: ["market"], val: g("ind.vol_ratio"), fmt: (v) => U.isNum(v) ? U.fmtNum(v, 2) + "×" : "—" },
    { key: "dvol", th: "มูลค่าซื้อขาย", views: ["market"], val: g("ind.avg_dollar_vol_m"), fmt: (v) => U.fmtCompact(v) },
    { key: "w52", th: "ห่าง 52w high", views: ["market"], val: g("ind.dist_52w_high_pct"), pct: true },
    // — มุมมองคำตัดสิน (status) —
    { key: "rank", th: "อันดับเทคนิค", views: ["status"], val: g("ind.tech_rank"), cell: rankCell },
    { key: "verdict", th: "คำตัดสิน", views: ["status"], val: (t) => -U.verdictInfo(t).rank, cell: verdictCell },
    { key: "checks", th: "เช็ค 7 ข้อ", views: ["status"], val: passCount, cell: pipsCell },
    { key: "distres", th: "ห่างแนวต้าน", views: ["status"], val: (t) => U.distToResistancePct(t), pct: true },
    { key: "basew", th: "ฐานกว้าง", views: ["status"], val: g("verdict.values.base_width_pct"), fmt: (v) => U.isNum(v) ? U.fmtNum(v, 1) + "%" : "—" },
    { key: "earn", th: "งบอีกกี่วัน", views: ["status"], val: g("earnings.days_to"), cell: earnCell },
    { key: "tracker", th: "Tracker", views: ["status"], val: (t) => U.get(t, "tracker.status", null), cell: trackerCell, str: true },
    { key: "note", th: "หมายเหตุ", views: ["status"], val: (t) => t.note || null, cell: noteCell, str: true },
  ];
  // เพิ่มคอลัมน์จากภายนอกได้โดยไม่ต้องแก้ไฟล์นี้ (เช่น indicator ใหม่) — window.WB_EXTRA_COLUMNS = [{key,th,views,path|val,fmt|cell|pct}]
  if (Array.isArray(window.WB_EXTRA_COLUMNS)) {
    for (const c of window.WB_EXTRA_COLUMNS) if (c && c.key) COLUMNS.push(c);
  }
  // normalize: path → val (declarative) · views ปริยาย = ทั้งสองมุมมอง
  for (const c of COLUMNS) {
    if (typeof c.val !== "function") c.val = c.path ? g(c.path) : (() => null);
    if (!Array.isArray(c.views)) c.views = ["market", "status"];
  }
  const colsFor = (view) => COLUMNS.filter((c) => c.views.indexOf(view) >= 0);

  function passCount(t) {
    const checks = U.get(t, "verdict.checks", null);
    if (!checks) return null;
    let n = 0;
    for (const k of Object.keys(checks)) if (checks[k] === true) n++;
    return n;
  }

  // ---------- cell renderers ----------
  function sectorInfo(etf) {
    const s = (U.get(window.WB, "sectors", []) || []).find((x) => x && x.etf === etf);
    return s ? s.etf + " " + s.th : (etf || "");
  }
  function tickerCell(t) {
    let html = '<div class="tk-cell">';
    if (t.sector_etf) {
      const col = U.SECTOR_COLORS[t.sector_etf] || "#888";
      html += '<span class="sector-dot" style="background:' + col + '" title="' + U.esc(sectorInfo(t.sector_etf)) + '"></span>';
    }
    html += '<span class="tk-name">' + U.esc(t.ticker || "?") + "</span>";
    if (t.also_passive || t.passive_thesis) {
      const tip = t.passive_thesis
        ? "มีใน Passive book + มี thesis แล้ว (" + t.passive_thesis + ") — คนละสมุด คนละกติกา"
        : "มีใน Passive book ด้วย — คนละสมุด คนละกติกา";
      html += '<span class="mini-badge" title="' + U.esc(tip) + '">P</span>';
    }
    if (t.tracker) {
      const parked = t.tracker.parked === true;
      const tip = parked
        ? "trend_pullback ถูกพัก (PARKED) — " + U.esc(t.tracker.file || "")
        : "ติดตามอยู่ (" + U.esc(t.tracker.status || "") + ") — " + U.esc(t.tracker.file || "");
      html += '<span class="mini-badge" title="' + tip + '">' + (parked ? "P" : "W") + "</span>";
    }
    return html + "</div>";
  }
  function rankCell(t) {
    const r = U.get(t, "ind.tech_rank", null);
    if (!U.isNum(r)) return "—";
    const w = Math.max(0, Math.min(100, r));
    return '<div class="rank-cell"><span class="num">' + Math.round(r) + '</span>' +
      '<span class="rank-bar"><i style="width:' + w + '%"></i></span></div>';
  }
  function verdictCell(t) {
    const vi = U.verdictInfo(t);
    return '<span class="vbadge ' + vi.cls + '">' + U.esc(vi.label) + "</span>";
  }
  function pipsCell(t) {
    const checks = U.get(t, "verdict.checks", null);
    if (!checks) return "—";
    const { order, labels } = U.checkMeta();
    const keys = order.length ? order : Object.keys(checks);
    let html = '<span class="pips">';
    for (const k of keys) {
      const lab = labels[k] || {};
      const val = checks[k];
      const cls = val === true ? "pass" : val === false ? "fail" : "";
      const size = lab.kind === "mandatory" ? " m" : "";
      const stateTh = val === true ? "ผ่าน" : val === false ? "ไม่ผ่าน" : "ไม่มีข้อมูล";
      html += '<span class="pip ' + cls + size + '" title="' + U.esc((lab.th || k) + " — " + stateTh) + '"></span>';
    }
    return html + "</span>";
  }
  function earnCell(t) {
    const d = U.get(t, "earnings.days_to", null);
    if (d == null) return "—";
    if (d <= U.earnMinDays()) return '<span class="earn-block">' + d + " วัน</span>";
    return d + " วัน";
  }
  function trackerCell(t) {
    const tr = t.tracker;
    if (!tr) return "—";
    if (tr.parked === true) return '<span class="tr-chip tr-parked" title="trend_pullback ถูกพัก — ไม่มีการชวนทำรายการ">PARKED</span>';
    const st = tr.status || "?";
    const cls = st === "ARMED" || st === "TRIGGERED" ? "tr-armed" : st === "WATCH" ? "tr-watch" : "tr-parked";
    return '<span class="tr-chip ' + cls + '">' + U.esc(st) + "</span>";
  }
  function noteCell(t) {
    if (!t.note) return "—";
    return '<div class="note-cell" title="' + U.esc(t.note) + '">' + U.esc(t.note) + "</div>";
  }

  // ---------- mobile card list (สไตล์แอป Apple Stocks — CSS โชว์เฉพาะจอ ≤640px) ----------
  function cardHtml(t, selected) {
    const cls = "tk-card" + (selected ? " selected" : "") + (t.ok === false ? " dim" : "");
    let sub, right = "";
    if (t.ok === false) {
      sub = '<span class="tkc-fail">ดึงข้อมูลไม่สำเร็จ</span>';
    } else {
      const vi = U.verdictInfo(t);
      sub = '<span class="vbadge ' + vi.cls + '">' + U.esc(vi.label) + "</span>";
      const d = U.get(t, "earnings.days_to", null);
      if (d != null && d <= U.earnMinDays()) sub += '<span class="earn-block">งบอีก ' + d + " วัน</span>";
      const ind = t.ind || {};
      const d1 = U.get(ind, "d1_pct", null);
      const chipCls = U.isNum(d1) ? (d1 > 0 ? "up" : d1 < 0 ? "down" : "flat") : "flat";
      right = '<div class="tkc-r">' +
        '<div class="tkc-px num">' + U.fmtPrice(U.get(ind, "close", null)) + "</div>" +
        '<div class="tkc-chip ' + chipCls + '">' + U.fmtPct(d1) + "</div></div>";
    }
    return '<div class="' + cls + '" data-ticker="' + U.esc(t.ticker) + '" role="button" tabindex="0">' +
      '<div class="tkc-l"><div class="tkc-name">' + tickerCell(t) + "</div>" +
      '<div class="tkc-sub">' + sub + "</div></div>" + right + "</div>";
  }

  function sortBarHtml(cols, sort) {
    let html = '<div class="card-sortbar"><span>เรียงตาม</span>' +
      '<select class="card-sort" aria-label="เรียงรายการตาม">' +
      '<option value=""' + (!sort || !sort.key ? " selected" : "") + ">ตามรายการ (ค่าเริ่มต้น)</option>";
    for (const c of cols) {
      if (c.key === "note") continue;
      html += '<option value="' + c.key + '"' + (sort && sort.key === c.key ? " selected" : "") + ">" + U.esc(c.th) + "</option>";
    }
    return html + '</select><button type="button" class="card-sortdir" title="สลับมาก ↔ น้อย">' +
      (sort && sort.dir === "asc" ? "↑" : "↓") + "</button>" +
      '<button type="button" class="cl-toggle-all" data-collapsed="false" title="ย่อ/ขยายทุกกลุ่ม">ย่อทั้งหมด</button></div>';
  }

  // ---------- filtering ----------
  function applyFilters(tickers, state) {
    let list = tickers.filter(Boolean);
    if (state.sector) list = list.filter((t) => t.sector_etf === state.sector);
    if (state.search) {
      const q = state.search.trim().toUpperCase();
      if (q) list = list.filter((t) => (t.ticker || "").toUpperCase().includes(q));
    }
    return list;
  }
  const CATFN = {
    all: () => true,
    pass: (t) => U.get(t, "verdict.setup_found", false) === true,
    near: (t) => {
      if (t.ok === false || U.get(t, "verdict.setup_found", false) === true) return false;
      const mf = U.mandatoryFails(t);
      return mf != null && mf <= 1;
    },
    earnings: (t) => {
      const d = U.get(t, "earnings.days_to", null);
      return d != null && d <= U.earnMinDays();
    },
    problem: (t) => t.ok === false,
  };

  // ---------- render ----------
  function init(opts) {
    onSelect = opts.onSelect || null;
    onSort = opts.onSort || null;
  }

  function render(state) {
    const wrap = U.$("#tableWrap");
    if (!wrap) return;
    const all = U.get(window.WB, "tickers", []) || [];
    const cols = colsFor(state.view);
    const base = applyFilters(all, state);

    // อัปเดตจำนวนบนชิปตัวกรอง
    U.$$(".fchip").forEach((chip) => {
      const f = chip.dataset.filter;
      const n = base.filter(CATFN[f] || (() => true)).length;
      let cnt = chip.querySelector(".cnt");
      if (!cnt) { cnt = document.createElement("span"); cnt.className = "cnt"; chip.appendChild(cnt); }
      cnt.textContent = "(" + n + ")";
      chip.classList.toggle("active", state.filter === f);
    });

    let list = base.filter(CATFN[state.filter] || (() => true));

    // เรียงลำดับ
    const sort = state.view === "status" ? state.sortStatus : state.sortMarket;
    if (sort && sort.key) {
      const col = cols.find((c) => c.key === sort.key);
      if (col) list = U.sortBy(list, col.val, sort.dir);
    }

    let html = '<table class="wb-table"><thead><tr>';
    for (const c of cols) {
      let arrow = "";
      if (sort && sort.key === c.key) arrow = ' <span class="arrow">' + (sort.dir === "asc" ? "▲" : "▼") + "</span>";
      html += '<th data-key="' + c.key + '">' + U.esc(c.th) + arrow + "</th>";
    }
    html += "</tr></thead><tbody>";

    if (!list.length) {
      html += '<tr><td colspan="' + cols.length + '"><div class="empty-state">' +
        '<div class="big">ไม่พบรายการตามตัวกรอง</div>' +
        "<div>ลองล้างตัวกรอง คำค้น หรือชิปกลุ่มอุตสาหกรรม</div></div></td></tr>";
    }

    for (const t of list) {
      const sel = state.selected === t.ticker ? " selected" : "";
      const dim = t.ok === false ? " dim" : "";
      html += '<tr data-ticker="' + U.esc(t.ticker) + '" class="' + sel + dim + '">';
      if (t.ok === false) {
        html += "<td>" + tickerCell(t) + "</td>" +
          '<td class="fail-cell" colspan="' + (cols.length - 1) + '">ดึงข้อมูลไม่สำเร็จ</td>';
      } else {
        for (const c of cols) {
          if (c.key === "ticker") { html += "<td>" + tickerCell(t) + "</td>"; continue; }
          if (c.cell) { html += "<td>" + c.cell(t) + "</td>"; continue; }
          const v = c.val(t);
          if (c.pct) {
            html += '<td class="num ' + U.pctClass(v) + '">' + U.fmtPct(v) + "</td>";
          } else {
            html += '<td class="num">' + (c.fmt ? c.fmt(v) : (v == null ? "—" : U.esc(String(v)))) + "</td>";
          }
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";

    // การ์ดมือถือ: render คู่ตารางเสมอ (CSS เลือกโชว์ตาม breakpoint) — จัดกลุ่มตาม sector + ย่อ/ขยายได้ ลด scroll
    let cards = sortBarHtml(cols, sort);
    if (!list.length) {
      cards += '<div class="card-list"><div class="empty-state"><div class="big">ไม่พบรายการตามตัวกรอง</div>' +
        "<div>ลองล้างตัวกรอง คำค้น หรือชิปกลุ่มอุตสาหกรรม</div></div></div>";
    } else {
      const order = [], groups = {};
      for (const t of list) {
        const sk = t.sector_etf || "—";
        if (!groups[sk]) { groups[sk] = []; order.push(sk); }
        groups[sk].push(t);
      }
      cards += '<div class="card-list">';
      for (const sk of order) {
        const grp = groups[sk];
        const hasSel = grp.some((t) => t.ticker === state.selected);
        const label = sk === "—" ? "อื่น ๆ" : sectorInfo(sk);
        cards += '<section class="sec-group' + (hasSel ? " has-sel" : "") + '">' +
          '<button type="button" class="sec-head" aria-expanded="true">' +
            '<span class="sec-name">' + U.esc(label) + "</span>" +
            '<span class="sec-count">' + grp.length + "</span>" +
            '<span class="sec-chev" aria-hidden="true">▾</span>' +
          '</button><div class="sec-body">';
        for (const t of grp) cards += cardHtml(t, state.selected === t.ticker);
        cards += "</div></section>";
      }
      cards += "</div>";
    }

    wrap.innerHTML = cards + html;
    lastVisible = list.map((t) => t.ticker);

    // wiring
    wrap.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => { if (onSort) onSort(th.dataset.key); });
    });
    wrap.querySelectorAll("tr[data-ticker]").forEach((tr) => {
      tr.addEventListener("click", () => { if (onSelect) onSelect(tr.dataset.ticker); });
    });
    const pick = (id) => {
      if (onSelect) onSelect(id);
      // มือถือ: รายการอยู่บน ชาร์ตอยู่ล่าง — พาไปดูชาร์ตของตัวที่เพิ่งแตะ
      const chart = document.querySelector(".board-right");
      if (chart && window.innerWidth <= 640) chart.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    wrap.querySelectorAll(".tk-card[data-ticker]").forEach((el) => {
      el.addEventListener("click", () => pick(el.dataset.ticker));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(el.dataset.ticker); } });
    });
    const sortSel = wrap.querySelector(".card-sort");
    if (sortSel) sortSel.addEventListener("change", () => { if (onSort && sortSel.value) onSort(sortSel.value); });
    const dirBtn = wrap.querySelector(".card-sortdir");
    if (dirBtn) dirBtn.addEventListener("click", () => {
      if (onSort && sortSel && sortSel.value) onSort(sortSel.value);   // key เดิมซ้ำ = สลับทิศ (พฤติกรรม onSort)
    });

    // sector accordion (มือถือ): แตะหัวกลุ่ม = ย่อ/ขยายรายกลุ่ม · ปุ่มเดียวย่อ/ขยายทั้งหมด → ลด scroll
    wrap.querySelectorAll(".sec-head").forEach((h) => {
      h.addEventListener("click", () => {
        const g = h.closest(".sec-group");
        if (!g) return;
        const collapsed = g.classList.toggle("collapsed");
        h.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    });
    const allBtn = wrap.querySelector(".cl-toggle-all");
    if (allBtn) allBtn.addEventListener("click", () => {
      const collapse = allBtn.dataset.collapsed !== "true";
      wrap.querySelectorAll(".sec-group").forEach((g) => {
        g.classList.toggle("collapsed", collapse);
        const h = g.querySelector(".sec-head");
        if (h) h.setAttribute("aria-expanded", collapse ? "false" : "true");
      });
      allBtn.dataset.collapsed = collapse ? "true" : "false";
      allBtn.textContent = collapse ? "ขยายทั้งหมด" : "ย่อทั้งหมด";
    });
  }

  function visible() { return lastVisible.slice(); }

  function scrollToSelected() {
    const row = document.querySelector("#tableWrap tr.selected");
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }

  window.WBTable = { init, render, visible, scrollToSelected, COLUMNS };
})();
