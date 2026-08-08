/* Swing Workbench — util.js: formatters, DOM helpers, palette, Thai copy maps. No rule logic here. */
(function () {
  "use strict";

  // apply saved theme as early as possible (dark = default, no attribute needed)
  // ยอมให้ shared/_kit/theme-boot.js เป็นเจ้าของธีมถ้ามี (หน้า landing/หน้าใหม่) —
  // ที่นี่จัดการเฉพาะหน้าเดิมที่ยังไม่มี theme-boot (เช่น board) กัน key สองตัวขัดกัน
  if (!window.__SW) {
    try {
      // อ่าน key ร่วม sw_theme ก่อน (fallback wb_theme เดิม) — กัน key สองตัวขัดกัน
      var _t = localStorage.getItem("sw_theme") || localStorage.getItem("wb_theme");
      if (_t === "light") document.documentElement.setAttribute("data-theme", "light");
    } catch (e) { /* localStorage blocked — stay dark */ }
  }

  const isNum = (v) => typeof v === "number" && isFinite(v);

  function get(obj, path, dflt) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null || typeof cur !== "object") return dflt;
      cur = cur[k];
    }
    return cur == null ? dflt : cur;
  }

  function fmtPrice(v) {
    if (!isNum(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNum(v, dp) {
    if (!isNum(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp });
  }
  function fmtInt(v) {
    if (!isNum(v)) return "—";
    return Math.round(v).toLocaleString("en-US");
  }
  function fmtPct(v, signed) {
    if (!isNum(v)) return "—";
    const s = signed === false ? "" : (v > 0 ? "+" : "");
    return s + v.toFixed(2) + "%";
  }
  function pctClass(v) {
    if (!isNum(v) || v === 0) return "flat";
    return v > 0 ? "up" : "down";
  }
  // input = มูลค่าซื้อขายเฉลี่ยใน "ล้าน USD" อยู่แล้ว
  function fmtCompact(millions) {
    if (!isNum(millions)) return "—";
    if (Math.abs(millions) >= 1000) return "$" + (millions / 1000).toFixed(1) + "B";
    return "$" + Math.round(millions).toLocaleString("en-US") + "M";
  }

  // stable sort; nulls always last regardless of direction
  function sortBy(arr, keyFn, dir) {
    const d = dir === "asc" ? 1 : -1;
    return arr.map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const ka = keyFn(a.item), kb = keyFn(b.item);
        const na = ka == null || (typeof ka === "number" && !isFinite(ka));
        const nb = kb == null || (typeof kb === "number" && !isFinite(kb));
        if (na && nb) return a.i - b.i;
        if (na) return 1;
        if (nb) return -1;
        if (ka < kb) return -1 * d;
        if (ka > kb) return 1 * d;
        return a.i - b.i;
      })
      .map((x) => x.item);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  // ---------- palette (read CSS vars once; invalidated on theme switch) ----------
  let _pal = null;
  function palette() {
    if (_pal) return _pal;
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fb) => (cs.getPropertyValue(name) || "").trim() || fb;
    _pal = {
      up: v("--up", "#2ebd85"), down: v("--down", "#f6465d"),
      ink: v("--ink", "#d9e1ef"), ink2: v("--ink2", "#94a1ba"), ink3: v("--ink3", "#64718c"),
      line: v("--line", "#232c42"), line2: v("--line2", "#1a2236"),
      panel: v("--panel", "#121a2b"), bg: v("--bg", "#0b0f17"),
      accent: v("--accent", "#4d8df7"), blue: v("--blue", "#4d8df7"),
      amber: v("--amber", "#e2a93b"), orange: v("--orange", "#f08c3a"), purple: v("--purple", "#9d7bf0"),
    };
    return _pal;
  }
  function invalidatePalette() { _pal = null; }

  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
    if (!m) return "rgba(128,128,128," + a + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---------- maps ----------
  const SEVERITY = {
    block: { rank: 0, cls: "alert-block", icon: "" },
    go:    { rank: 1, cls: "alert-go",    icon: "" },
    warn:  { rank: 2, cls: "alert-warn",  icon: "" },
    info:  { rank: 3, cls: "alert-info",  icon: "" },
  };

  const SECTOR_COLORS = {
    XLK: "#4d8df7", XLF: "#2ebd85", XLV: "#f06292", XLY: "#f0b90b",
    XLP: "#9d7bf0", XLI: "#8d9aae", XLE: "#f08c3a", XLC: "#26c6da",
  };

  // UI เป็นเจ้าของข้อความไทยของ alert; data ส่งเฉพาะตัวเลขประกอบ
  const ALERT_TH = {
    SETUP_FOUND: (d) => "เข้าเกณฑ์ breakout ครบ — entry " + fmtPrice(d.entry) + " · stop " + fmtPrice(d.stop) + " · target " + fmtPrice(d.target),
    NEAR_RESISTANCE: (d) => "ใกล้แนวต้าน เหลือ " + fmtNum(d.dist_pct, 1) + "%",
    VOL_SURGE: (d) => "วอลุ่มผิดปกติ " + fmtNum(d.vol_ratio, 2) + "×",
    TIGHT_BASE: (d) => "ฐานแน่น " + fmtNum(d.base_width_pct, 1) + "%",
    EARNINGS_SOON: (d) => "งบอีก " + (d.days_to == null ? "—" : d.days_to) + " วัน — กติกาห้ามเข้า",
    ATR_OUT_OF_BAND: (d) => "ATR " + fmtNum(d.atr_pct, 1) + "% หลุดแบนด์เกณฑ์",
    REGIME_OFF: () => "SPY ใต้ SMA50 — ห้ามเปิดไม้ใหม่ทุกตัว",
    DATA_STALE: (d) => "ข้อมูลเก่า " + (d.days_old == null ? "—" : d.days_old) + " วัน — ควรรีเฟรช",
    FETCH_FAILED: () => "ดึงข้อมูลไม่สำเร็จ",
    BIG_MOVE: (d) => "ขยับแรง " + fmtPct(d.d1_pct) + " (เกิน 2×ATR) — เช็คข่าวด้วย /news-triage",
    GAP_OPEN: (d) => "เปิดกระโดด (gap) " + fmtPct(d.gap_pct) + " — เช็คข่าวด้วย /news-triage",
  };
  function alertText(alert) {
    const fn = ALERT_TH[alert.code];
    return fn ? fn(alert.data || {}) : alert.code; // code แปลก = โชว์ตรง ๆ (กัน engine เพิ่ม code ใหม่)
  }

  // ---------- verdict display helpers (นับ field ที่ engine ตัดสินแล้ว — ไม่รันกฎใหม่) ----------
  function checkMeta() {
    const meta = get(window.WB || {}, "meta", {}) || {};
    return {
      order: Array.isArray(meta.check_order) ? meta.check_order : [],
      labels: meta.check_labels || {},
    };
  }
  // นับผล false แยกตาม kind จาก verdict.checks (ค่าที่ engine ให้มา)
  function countChecks(verdict) {
    const out = { mfail: 0, ofail: 0, sfail: 0, missing: 0, total: 0 };
    const checks = verdict && verdict.checks;
    if (!checks) { out.missing = -1; return out; }
    const { order, labels } = checkMeta();
    const keys = order.length ? order : Object.keys(checks);
    for (const k of keys) {
      out.total++;
      const kind = get(labels, k + ".kind", "");
      const val = checks[k];
      if (val == null) { out.missing++; continue; }
      if (val === false) {
        if (kind === "mandatory") out.mfail++;
        else if (kind === "optional") out.ofail++;
        else out.sfail++;
      }
    }
    return out;
  }
  function verdictInfo(t) {
    const v = (t && t.verdict) || null;
    if (!t || t.ok === false || !v || v.ok === false) return { cls: "vb-none", label: "— ไม่มีข้อมูล", rank: 4 };
    if (v.setup_found) return { cls: "vb-pass", label: "✓ เข้าเกณฑ์", rank: 0 };
    if (!v.checks) return { cls: "vb-none", label: "— ไม่มีข้อมูล", rank: 4 };
    const c = countChecks(v);
    if (c.mfail === 0) return { cls: "vb-wait", label: "○ รอข้อเสริม", rank: 1 };
    if (c.mfail === 1) return { cls: "vb-near", label: "○ ใกล้ (ขาด 1)", rank: 2 };
    return { cls: "vb-no", label: "✗ ยังไม่เข้า (ขาด " + c.mfail + ")", rank: 3 };
  }
  function mandatoryFails(t) {
    const v = t && t.verdict;
    if (!v || !v.checks) return null;
    return countChecks(v).mfail;
  }
  // เกณฑ์ห้ามเข้าก่อนงบ (วัน) — จาก rules; fallback 21 ถ้าไฟล์เก่าไม่มี
  function earnMinDays() {
    const d = get(window.WB || {}, "rules.earnings.min_days", null);
    return isNum(d) ? d : 21;
  }
  // ห่างแนวต้าน % — display-only: (resistance/close − 1) × 100
  function distToResistancePct(t) {
    const res = get(t, "verdict.values.resistance", null);
    const close = get(t, "ind.close", null);
    if (!isNum(res) || !isNum(close) || close === 0) return null;
    return (res / close - 1) * 100;
  }

  function copyText(text, done) {
    const finish = (okFlag) => { if (done) done(okFlag); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true), () => fallback());
    } else { fallback(); }
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const okFlag = document.execCommand("copy");
        document.body.removeChild(ta);
        finish(okFlag);
      } catch (e) { finish(false); }
    }
  }

  // ---------- live view layer (optional — data/live.js เขียนโดย scripts/workbench_live.py) ----------
  // ชั้น "ดูอย่างเดียว": คำตัดสิน/ระดับทั้งหมดยังมาจากแท่งปิด (data.js) เสมอ
  function liveFresh() {
    const lv = window.WB_LIVE || null;
    if (!lv || !lv.quotes || !Object.keys(lv.quotes).length) return null;
    const age = Date.now() / 1000 - (lv.updated_epoch || 0);
    if (lv.market_phase === "open") return age < 900 ? lv : null;       // เปิด: สดภายใน 15 นาที
    return age < 2 * 86400 ? lv : null;                                  // ปิด: โชว์แบบสงบได้ถึง 2 วัน
  }
  function liveQuote(tk) {
    const lv = liveFresh();
    return (lv && lv.quotes && lv.quotes[tk]) || null;
  }

  window.WBUtil = {
    isNum, get, fmtPrice, fmtNum, fmtInt, fmtPct, pctClass, fmtCompact,
    sortBy, esc, $, $$, palette, invalidatePalette, hexToRgba,
    SEVERITY, SECTOR_COLORS, ALERT_TH, alertText,
    checkMeta, countChecks, verdictInfo, mandatoryFails, distToResistancePct, earnMinDays,
    copyText, liveFresh, liveQuote,
  };
})();
