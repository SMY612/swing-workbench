/* Swing Workbench — app.js: boot + state + header/ribbon/strip + tabs + keyboard + theme */
(function () {
  "use strict";
  const U = window.WBUtil;
  const WB = window.WB || {};

  const state = {
    tab: "board",
    view: "market",            // market | status
    filter: "all",
    sector: null,
    search: "",
    selected: null,
    sortMarket: null,                              // default: เรียงตามลำดับใน watchlist
    sortStatus: { key: "rank", dir: "desc" },      // default: tech_rank มาก → น้อย
    runId: null,
  };

  // ---------- header ----------
  function renderHeader() {
    const meta = U.get(WB, "meta", {}) || {};
    const rsEl = U.$("#chipRuleset");
    if (rsEl) rsEl.textContent = meta.ruleset || "—";
    const ps = meta.pattern_status || {};
    const patEl = U.$("#chipPattern");
    if (patEl) {
      const bo = ps.breakout || "—";
      const pb = ps.trend_pullback === "PARKED" ? "พัก" : (ps.trend_pullback || "—");
      patEl.textContent = "breakout " + bo + " · pullback " + pb;
      patEl.title = "trend_pullback = PARKED (มติ P0 2026-06-11) — เทรดได้เฉพาะ breakout";
    }
    const asEl = U.$("#asOf");
    if (asEl) asEl.textContent = "ข้อมูล ณ แท่งปิด " + (meta.as_of || "—");

    const lampEl = U.$("#regimeLamp");
    if (lampEl) {
      const rg = U.get(WB, "regime", {}) || {};
      const spyPct = U.get(rg, "spy.pct_vs_sma50", null);
      const qqqPct = U.get(rg, "qqq.pct_vs_sma50", null);
      // engine ให้ regime ละเอียด: bull_strong / bull_mild / bear / unknown
      // gate จริง (live.py) บล็อกเฉพาะ bear/unknown — bull ทั้งสองแบบเข้าได้
      let dot = "lamp-unknown", txt = "สภาพตลาดไม่ทราบ (ไม่มีข้อมูล SPY)";
      if (typeof rg.status === "string" && rg.status.indexOf("bull") === 0) {
        const strength = rg.status === "bull_strong" ? "เทรนด์แรง" :
          rg.status === "bull_mild" ? "เทรนด์เบา" : "";
        dot = "lamp-bull";
        txt = "ตลาดเปิดรับ" + (strength ? " · " + strength : "") +
          " (SPY เหนือ SMA50 " + U.fmtPct(spyPct) + ")";
      } else if (rg.status === "bear") {
        dot = "lamp-bear"; txt = "ห้ามเปิดไม้ใหม่ (SPY ใต้ SMA50)";
      }
      lampEl.innerHTML = '<span class="regime-main"><span class="lamp ' + dot + '"></span>' + U.esc(txt) + "</span>" +
        '<span class="regime-sub num">QQQ ' + U.fmtPct(qqqPct) + " เทียบ SMA50</span>";
    }

    const banner = U.$("#modeBanner");
    if (banner) {
      const mode = meta.mode || "live";
      if (mode === "fixture") {
        banner.hidden = false;
        banner.className = "mode-banner fixture";
        banner.textContent = "ข้อมูลสังเคราะห์ (fixture) — ห้ามใช้ตัดสินใจจริง";
      } else if (mode === "offline") {
        banner.hidden = false;
        banner.className = "mode-banner offline";
        banner.textContent = "ข้อมูลย้อนหลังจากคลังเก่า (offline) — รัน refresh เพื่ออัปเดต";
      } else {
        banner.hidden = true;
      }
    }

    const foot = U.$("#wbFooter");
    if (foot) {
      const warns = Array.isArray(meta.warnings) ? meta.warnings : [];
      foot.innerHTML = "สร้างเมื่อ " + U.esc(meta.generated_at || "—") + " · โหมด " + U.esc(meta.mode || "—") +
        " · แท่งปิดล่าสุด " + U.esc(meta.as_of || "—") +
        (warns.length ? "<br>คำเตือนจากตัวสร้างข้อมูล: " + warns.map((w) => U.esc(w)).join(" · ") : "");
    }
  }

  // ---------- sector heat strip ----------
  function renderSectors() {
    const el = U.$("#sectorStrip");
    if (!el) return;
    const sectors = U.get(WB, "sectors", []) || [];
    const P = U.palette();
    el.innerHTML = sectors.map((s) => {
      if (!s) return "";
      const v = s.d1_pct;
      const a = U.isNum(v) ? Math.min(0.45, 0.10 + Math.abs(v) * 0.18) : 0.05;
      const bg = U.isNum(v) && v !== 0 ? U.hexToRgba(v > 0 ? P.up : P.down, a) : "transparent";
      const active = state.sector === s.etf ? " active" : "";
      return '<button type="button" class="sector-chip' + active + '" data-etf="' + U.esc(s.etf) + '" style="background:' + bg + '"' +
        ' title="' + U.esc(s.etf + " " + (s.th || "") + " · 5 วัน " + U.fmtPct(s.d5_pct) + " · 20 วัน " + U.fmtPct(s.d20_pct)) + '">' +
        "<b>" + U.esc(s.etf) + "</b> " + U.esc(s.th || "") +
        ' <span class="pct ' + U.pctClass(v) + '">' + U.fmtPct(v) + "</span></button>";
    }).join("");
    el.querySelectorAll(".sector-chip").forEach((b) => {
      b.addEventListener("click", () => {
        state.sector = state.sector === b.dataset.etf ? null : b.dataset.etf;
        renderSectors();
        renderBoard();
      });
    });
  }

  // ---------- alert ribbon ----------
  function renderAlerts() {
    const el = U.$("#alertRibbon");
    if (!el) return;
    const alerts = (U.get(WB, "alerts", []) || []).filter(Boolean);
    if (!alerts.length) {
      el.innerHTML = '<span class="alert-none">ไม่มีการแจ้งเตือนในรอบนี้</span>';
      return;
    }
    const ranked = U.sortBy(alerts, (a) => U.get(U.SEVERITY, (a.severity || "info") + ".rank", 9), "asc");
    el.innerHTML = ranked.map((a) => {
      const sev = U.SEVERITY[a.severity] || U.SEVERITY.info;
      const tk = a.ticker ? '<span class="tk">' + U.esc(a.ticker) + "</span>" : "";
      return '<button type="button" class="alert-chip ' + sev.cls + '"' +
        (a.ticker ? ' data-ticker="' + U.esc(a.ticker) + '"' : "") + ">" +
        tk + " " + U.esc(U.alertText(a)) + "</button>";
    }).join("");
    el.querySelectorAll(".alert-chip[data-ticker]").forEach((b) => {
      b.addEventListener("click", () => {
        switchTab("board");
        selectTicker(b.dataset.ticker);
      });
    });
  }

  // ---------- panel registry (board tabs) — ทะเบียนแท็บเดียว ----------
  // 1 entry = 1 แท็บ · onShow = งานตอนเปิดแท็บ (วาด canvas ที่วัดขนาดได้เมื่อมองเห็นเท่านั้น)
  // เพิ่มแท็บใหม่ = เพิ่ม 1 entry ที่นี่ + 1 <section id="tab-{id}" class="tab-panel"> ใน index.html
  const PANELS = [
    { id: "board", label: "① กระดานเฝ้าดู", onShow: () => window.WBCandles.redraw() },
    { id: "calendar", label: "② ปฏิทินงบ" },
    { id: "port", label: "③ พอร์ต & เป้าหมาย" },
    { id: "backtest", label: "④ หลักฐาน backtest", onShow: () => window.WBPanels.renderBacktest(state.runId, onPickRun) },
    { id: "rules", label: "⑤ กติกา v2" },
  ];
  window.WB_PANELS = PANELS;

  // ---------- tabs ----------
  function renderTabbar() {
    const bar = U.$("#tabbar");
    if (!bar || !PANELS.length) return;          // ไม่มีทะเบียน = คงปุ่ม static ใน HTML (fallback)
    bar.innerHTML = PANELS.map((p) =>
      '<button type="button" class="tab-btn' + (p.id === state.tab ? " active" : "") +
      '" data-tab="' + U.esc(p.id) + '">' + U.esc(p.label) + "</button>").join("");
  }
  function switchTab(tab) {
    state.tab = tab;
    U.$$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    U.$$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
    const panel = PANELS.find((p) => p.id === tab);
    if (panel && panel.onShow) panel.onShow();
  }

  // ---------- board ----------
  function findTicker(id) {
    return (U.get(WB, "tickers", []) || []).find((t) => t && t.ticker === id) || null;
  }
  function selectTicker(id) {
    if (!id || !findTicker(id)) return;
    state.selected = id;
    renderBoard();
    window.WBCandles.setTicker(findTicker(id));
    window.WBTable.scrollToSelected();
  }
  function renderBoard() {
    window.WBTable.render(state);
  }
  function onSort(key) {
    const cur = state.view === "status" ? state.sortStatus : state.sortMarket;
    let next;
    if (cur && cur.key === key) next = { key, dir: cur.dir === "asc" ? "desc" : "asc" };
    else next = { key, dir: key === "ticker" || key === "note" || key === "tracker" ? "asc" : "desc" };
    if (state.view === "status") state.sortStatus = next;
    else state.sortMarket = next;
    renderBoard();
  }
  function onPickRun(runId) {
    state.runId = runId;
    window.WBPanels.renderBacktest(runId, onPickRun);
  }

  // ---------- keyboard ----------
  function isTyping(e) {
    const el = e.target;
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }
  function moveSelection(step, wrap) {
    const vis = window.WBTable.visible();
    if (!vis.length) return;
    let i = vis.indexOf(state.selected);
    if (i < 0) i = step > 0 ? -1 : 0;
    let next = i + step;
    if (wrap) next = (next + vis.length) % vis.length;
    else next = Math.max(0, Math.min(vis.length - 1, next));
    selectTicker(vis[next]);
  }
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const search = U.$("#searchBox");
      if (e.key === "Escape") {
        if (search && (document.activeElement === search || search.value)) {
          search.value = "";
          state.search = "";
          search.blur();
          renderBoard();
        } else {
          window.WBCandles.clearCrosshair();
        }
        return;
      }
      if (isTyping(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        switchTab("board");
        if (search) search.focus();
        return;
      }
      if (state.tab !== "board") return;
      if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(1, false); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(-1, false); }
      else if (e.key === " ") { e.preventDefault(); moveSelection(1, true); }
    });
  }

  // ---------- theme ----------
  // ปุ่มสลับธีมย้ายไปอยู่ในเปลือกร่วม (shared/_kit/shell.js) แล้ว — board แค่ "ฟัง"
  // event sw:themechange เพื่อวาดส่วนที่อ่านสีจาก palette ใหม่ (sector strip + candles +
  // กราฟ backtest). การตั้ง data-theme + เขียน localStorage (key sw_theme) shell ทำให้แล้ว
  function onThemeChange() {
    U.invalidatePalette();
    renderSectors();
    window.WBCandles.themeChanged();
    if (state.tab === "backtest") window.WBPanels.renderBacktest(state.runId, onPickRun);
  }
  function bindTheme() {
    window.addEventListener("sw:themechange", onThemeChange);
  }

  // ---------- wiring ----------
  function bindControls() {
    U.$$(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    U.$$(".view-btn").forEach((b) => {
      b.addEventListener("click", () => {
        state.view = b.dataset.view;
        U.$$(".view-btn").forEach((x) => x.classList.toggle("active", x === b));
        renderBoard();
      });
    });
    U.$$(".fchip").forEach((b) => {
      b.addEventListener("click", () => {
        state.filter = b.dataset.filter;
        U.$$(".fchip").forEach((x) => x.classList.toggle("active", x === b));
        renderBoard();
      });
    });
    const search = U.$("#searchBox");
    if (search) {
      search.addEventListener("input", () => {
        state.search = search.value;
        renderBoard();
      });
    }
    U.$$(".range-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        U.$$(".range-btn").forEach((x) => x.classList.toggle("active", x === b));
        window.WBCandles.setRange(parseInt(b.dataset.range, 10) || 126);
      });
    });
    const refresh = U.$("#refreshHint");
    if (refresh) {
      const original = refresh.textContent;
      refresh.addEventListener("click", () => {
        U.copyText("uv run python scripts/workbench_refresh.py", (okFlag) => {
          refresh.textContent = okFlag ? "คัดลอกแล้ว ✓" : "คัดลอกไม่สำเร็จ";
          setTimeout(() => { refresh.textContent = original; }, 1600);
        });
      });
    }
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.tab === "board") window.WBCandles.redraw();
        if (state.tab === "backtest") window.WBPanels.renderBacktest(state.runId, onPickRun);
      }, 120);
    });
  }

  // ---------- drill-down จากหน้า Landing (#sector= / #filter= / #ticker=) ----------
  // หน้า landing ลิงก์มาด้วย hash → board เปิดมาพร้อมตัวกรอง/หุ้นที่เลือกไว้ทันที
  function applyHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    const p = {};
    h.split("&").forEach((kv) => { const a = kv.split("="); if (a[0]) p[a[0]] = decodeURIComponent(a[1] || ""); });
    let touched = false;
    if (p.sector) { state.sector = p.sector; renderSectors(); touched = true; }
    if (p.filter && ["all", "pass", "near", "earnings", "problem"].indexOf(p.filter) >= 0) {
      state.filter = p.filter;
      U.$$(".fchip").forEach((b) => b.classList.toggle("active", b.dataset.filter === p.filter));
      touched = true;
    }
    if (touched) { switchTab("board"); renderBoard(); }
    if (p.ticker) { switchTab("board"); selectTicker(p.ticker); }
  }

  // ---------- boot ----------
  function boot() {
    if (!window.WB) {
      const banner = U.$("#modeBanner");
      if (banner) {
        banner.hidden = false;
        banner.className = "mode-banner fixture";
        banner.textContent = "ไม่พบข้อมูล (data/data.js) — รัน refresh ก่อนเปิดหน้านี้";
      }
      return;
    }
    window.WBTable.init({ onSelect: selectTicker, onSort });
    window.WBCandles.init(U.$("#chartCanvas"));

    renderTabbar();
    renderHeader();
    renderSectors();
    renderAlerts();
    bindControls();
    bindTheme();
    bindKeyboard();

    window.WBPanels.renderCalendar((tk) => { switchTab("board"); selectTicker(tk); });
    window.WBPanels.renderPort(() => switchTab("board"));
    window.WBPanels.renderBacktest(state.runId, onPickRun);
    window.WBPanels.renderRules();
    startLiveLoop();

    const first = (U.get(WB, "tickers", []) || []).find((t) => t && t.ticker);
    renderBoard();
    if (first) selectTicker(first.ticker);
    else window.WBCandles.setTicker(null);

    // การ์ด "วิธีอ่านจอนี้": เปิดเองครั้งแรก หลังจากนั้นจำสถานะที่ผู้ใช้เลือก
    const orient = U.$("#orientCard");
    if (orient) {
      if (localStorage.getItem("wb_orient") === "closed") orient.open = false;
      orient.addEventListener("toggle", () => {
        try { localStorage.setItem("wb_orient", orient.open ? "open" : "closed"); } catch (_) {}
      });
    }

    applyHash();                                       // เปิดมาพร้อม drill-down ถ้ามี hash (override ตัวแรก)
    window.addEventListener("hashchange", applyHash);
  }

  // ---------- ชั้นราคาสด (optional — data/live.js จาก scripts/workbench_live.py) ----------
  // ดูอย่างเดียว: แถบบอกสถานะ + ให้ชาร์ตวาดแท่ง "ยังไม่ปิด" — คำตัดสินมาจากแท่งปิดเสมอ
  function applyLive() {
    const el = U.$("#liveStrip");
    if (!el) return;
    const lv = U.liveFresh();
    if (!lv) { el.hidden = true; return; }
    const upd = (lv.updated_at || "").slice(11, 16);
    const open = lv.market_phase === "open";
    const chip = (tk) => {
      const q = lv.quotes[tk];
      if (!q || !U.isNum(q.chg_pct)) return "";
      return '<span class="live-mini num ' + U.pctClass(q.chg_pct) + '">' +
        tk + " " + U.fmtPct(q.chg_pct) + "</span>";
    };
    el.innerHTML =
      '<span class="live-dot' + (open ? " on" : "") + '"></span>' +
      '<span class="live-label">' +
      (open ? "ราคาระหว่างวัน · อัปเดต " + U.esc(upd)
            : "ตลาดปิด · ราคาสดชุดล่าสุด " + U.esc(upd)) + "</span>" +
      chip("SPY") + chip("QQQ") +
      '<span class="live-note">ใช้ดูเท่านั้น — คำตัดสิน/ระดับทั้งหมดมาจากแท่งปิด ' +
      U.esc(U.get(WB, "meta.as_of", "")) +
      ' · ตัวดึงสด: <code>uv run python scripts/workbench_live.py</code></span>';
    el.hidden = false;
  }
  let liveTimer = null;
  function startLiveLoop() {
    applyLive();
    if (liveTimer) return;
    liveTimer = setInterval(() => {
      const old = document.getElementById("liveReload");
      if (old) old.remove();
      const sc = document.createElement("script");
      sc.id = "liveReload";
      sc.src = "data/live.js?t=" + Date.now();
      sc.onload = () => {
        applyLive();
        if (state.tab === "board") window.WBCandles.liveTick();
      };
      sc.onerror = () => {};
      document.body.appendChild(sc);
    }, 90000);
  }

  boot();
})();
