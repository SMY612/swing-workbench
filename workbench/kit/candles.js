/* Swing Workbench — candles.js: canvas chart (candles + volume + levels + crosshair) + side cards.
   Display-only math allowed: SMA rolling means, volume average, distance %. Rule verdicts come from data. */
(function () {
  "use strict";
  const U = window.WBUtil;

  let canvas = null, ctx = null;
  let t = null;           // ticker object currently shown
  let range = 126;        // bars
  let mouse = null;       // {x, y} css px
  let view = null;        // per-draw layout cache for crosshair hit-testing

  function rules() { return U.get(window.WB || {}, "rules", {}) || {}; }
  function volSpikeRatio() {
    const r = U.get(rules(), "breakout.vol_spike_ratio", null);
    return U.isNum(r) ? r : 1.25;
  }
  function kAtr() {
    const k = U.get(rules(), "breakout.k_atr", null);
    return U.isNum(k) ? k : 1.5;
  }

  function sma(values, len) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= len) sum -= values[i - len];
      if (i >= len - 1) out[i] = sum / len;
    }
    return out;
  }

  function barsAvailable() {
    const c = U.get(t, "ohlcv.c", null);
    return Array.isArray(c) ? c.length : 0;
  }

  // ---------- public API ----------
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    // Pointer Events ครอบทั้งเมาส์ + นิ้ว — ของเดิมผูกแค่ mousemove → มือถือ crosshair ไม่ตามนิ้ว
    // (pointer เป็น superset ของ mouse → พฤติกรรมเดสก์ท็อปเหมือนเดิม)
    // touch-action: pan-y = ลากแนวนอนคุม crosshair, ปัดแนวตั้งยังเลื่อนหน้าได้ตามปกติ
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      redraw();
    });
    canvas.addEventListener("pointerleave", () => { mouse = null; redraw(); });
    canvas.addEventListener("pointercancel", () => { mouse = null; redraw(); });
  }

  function setTicker(ticker) {
    t = ticker || null;
    mouse = null;
    renderSide();
    redraw();
  }
  function setRange(n) { range = n; redraw(); }
  function getRange() { return range; }
  function clearCrosshair() { if (mouse) { mouse = null; redraw(); } }
  function themeChanged() { U.invalidatePalette(); renderSide(); redraw(); }
  function liveTick() { renderSide(); redraw(); }   // ชั้นราคาสดอัปเดต: หัวชาร์ต + แท่ง ghost

  // ---------- chart empty state (เจ้าของเดียว — กัน "จอว่างเงียบ" เชิงโครงสร้าง) ----------
  function showEmpty(msg) {
    const el = document.getElementById("chartEmpty");
    if (el) { el.hidden = false; el.textContent = msg; }
  }
  function hideEmpty() {
    const el = document.getElementById("chartEmpty");
    if (el) el.hidden = true;
  }

  // ---------- canvas ----------
  function redraw() {
    try {
      redrawInner();
    } catch (err) {
      console.error("chart redraw failed:", err);
      showEmpty("วาดชาร์ตไม่สำเร็จ (" + (err && err.message ? err.message : err) + ") — ลองรีเฟรชหน้า หรือรัน workbench_refresh ใหม่");
    }
  }
  function redrawInner() {
    if (!canvas || !ctx) return;
    const cssW = canvas.clientWidth || 300;
    const cssH = canvas.clientHeight || 430;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    view = null;

    const P = U.palette();
    const ohlcv = U.get(t, "ohlcv", null);
    if (!t) { showEmpty("ยังไม่ได้เลือกหุ้น — แตะหุ้นในรายการด้านซ้าย"); return; }
    if (t.ok === false) { showEmpty("ไม่มีข้อมูลราคา — ดึงไม่สำเร็จ"); return; }
    if (!ohlcv || !Array.isArray(ohlcv.c) || ohlcv.c.length === 0) {
      showEmpty("ไม่มีข้อมูลแท่งราคาของ " + (t.ticker || "?") + " — รัน workbench_refresh ใหม่");
      return;
    }

    const len = ohlcv.c.length;
    const n0 = Math.min(range, len);
    const s = len - n0;
    const dates = ohlcv.dates.slice(s), O = ohlcv.o.slice(s), H = ohlcv.h.slice(s),
          L = ohlcv.l.slice(s), C = ohlcv.c.slice(s), V = ohlcv.v.slice(s);
    const sma20 = sma(ohlcv.c, 20).slice(s);
    const sma50 = sma(ohlcv.c, 50).slice(s);
    const volAvg = sma(ohlcv.v, 20).slice(s);

    // แท่ง "วันนี้ (ยังไม่ปิด)" จากชั้น live — ดูอย่างเดียว: โปร่ง + กรอบประ,
    // ไม่เข้าอินดิเคเตอร์ และไม่กระทบคำตัดสิน (ทั้งหมดนั้นมาจากแท่งปิดใน data.js)
    let ghostIdx = -1;
    const lq = U.liveQuote ? U.liveQuote(t.ticker) : null;
    if (lq && lq.bar_date && dates.length && lq.bar_date > dates[dates.length - 1] &&
        U.isNum(lq.day_open) && U.isNum(lq.day_high) &&
        U.isNum(lq.day_low) && U.isNum(lq.last)) {
      dates.push(lq.bar_date); O.push(lq.day_open); H.push(lq.day_high);
      L.push(lq.day_low); C.push(lq.last); V.push(lq.day_vol || 0);
      sma20.push(null); sma50.push(null); volAvg.push(null);
      ghostIdx = dates.length - 1;
    }
    const n = dates.length;

    // levels จาก engine (วาดเมื่อมีค่า)
    const vv = U.get(t, "verdict.values", {}) || {};
    const lv = U.get(t, "verdict.levels", {}) || {};
    const setup = U.get(t, "verdict.setup_found", false) === true;
    const levels = [];
    if (U.isNum(vv.resistance)) levels.push({ y: vv.resistance, color: P.orange, label: "แนวต้าน", dash: [5, 4] });
    if (U.isNum(vv.base_low)) levels.push({ y: vv.base_low, color: P.ink3, label: "ฐานล่าง", dash: [5, 4] });
    if (setup) {
      if (U.isNum(lv.entry_ref)) levels.push({ y: lv.entry_ref, color: P.blue, label: "entry", dash: [2, 3] });
      if (U.isNum(lv.stop)) levels.push({ y: lv.stop, color: P.down, label: "stop", dash: [2, 3] });
      if (U.isNum(lv.target)) levels.push({ y: lv.target, color: P.up, label: "target", dash: [2, 3] });
    }

    // scale ราคา: ครอบทั้งแท่งและเส้นระดับ + เผื่อ 5%
    // เกราะ NaN: ข้ามค่า null/ไม่ใช่ตัวเลข — ค่าเดียวหลุดเข้า pMin/pMax = พิกัดทั้งจอเป็น NaN
    // = แท่งหายเงียบทั้งชาร์ตโดยไม่มี error (บั๊กที่เจอ 2026-06-13)
    let pMin = Infinity, pMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(L[i]) && L[i] < pMin) pMin = L[i];
      if (Number.isFinite(H[i]) && H[i] > pMax) pMax = H[i];
    }
    for (const l of levels) { if (l.y < pMin) pMin = l.y; if (l.y > pMax) pMax = l.y; }
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
      showEmpty("ข้อมูลราคาของ " + (t.ticker || "?") + " มีค่าผิดปกติ — รัน workbench_refresh ใหม่");
      return;
    }
    const pad = (pMax - pMin) * 0.05 || 1;
    pMin -= pad; pMax += pad;

    let vMax = 0;
    for (let i = 0; i < n; i++) if (V[i] > vMax) vMax = V[i];
    vMax = vMax || 1;

    const ML = 8, MR = 64, MT = 8, MB = 20, GAP = 8;
    const plotW = cssW - ML - MR;
    const innerH = cssH - MT - MB - GAP;
    const priceH = innerH * 0.78, volH = innerH * 0.22;
    const volTop = MT + priceH + GAP;
    const slot = plotW / n;
    const bw = Math.max(1, Math.min(9, slot * 0.62));
    const xOf = (i) => ML + (i + 0.5) * slot;
    const yOf = (p) => MT + (pMax - p) / (pMax - pMin) * priceH;
    const yVol = (v) => volTop + volH - (v / vMax) * volH * 0.92;
    view = { n, ML, MR, MT, MB, plotW, priceH, volTop, volH, slot, xOf, yOf,
             dates, O, H, L, C, V, pMin, pMax, cssW, cssH };

    // grid + ป้ายแกนราคา
    ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
    ctx.strokeStyle = P.line2; ctx.fillStyle = P.ink3; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const p = pMin + (pMax - pMin) * g / 4;
      const y = Math.round(yOf(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + plotW, y); ctx.stroke();
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(U.fmtPrice(p), ML + plotW + 5, y);
    }

    // โซน entry↔stop (แดง) / entry↔target (เขียว) — ลักษณะ position tool
    if (setup && U.isNum(lv.entry_ref)) {
      const zx = ML + plotW * 0.55, zw = plotW * 0.45;
      if (U.isNum(lv.stop)) {
        ctx.fillStyle = U.hexToRgba(P.down, 0.08);
        ctx.fillRect(zx, Math.min(yOf(lv.entry_ref), yOf(lv.stop)), zw, Math.abs(yOf(lv.stop) - yOf(lv.entry_ref)));
      }
      if (U.isNum(lv.target)) {
        ctx.fillStyle = U.hexToRgba(P.up, 0.08);
        ctx.fillRect(zx, Math.min(yOf(lv.entry_ref), yOf(lv.target)), zw, Math.abs(yOf(lv.target) - yOf(lv.entry_ref)));
      }
    }

    // แท่งเทียน (ข้ามแท่งที่ข้อมูลแหว่ง — วาดที่เหลือต่อ ไม่พังทั้งจอ)
    let barsDrawn = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(O[i]) || !Number.isFinite(H[i]) ||
          !Number.isFinite(L[i]) || !Number.isFinite(C[i])) continue;
      barsDrawn++;
      const upBar = C[i] >= O[i];
      const col = upBar ? P.up : P.down;
      const x = xOf(i);
      const isGhost = i === ghostIdx;
      if (isGhost) ctx.globalAlpha = 0.45;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yOf(H[i])); ctx.lineTo(x, yOf(L[i])); ctx.stroke();
      const yO = yOf(O[i]), yC = yOf(C[i]);
      const top = Math.min(yO, yC), hgt = Math.max(1, Math.abs(yC - yO));
      ctx.fillStyle = col;
      ctx.fillRect(x - bw / 2, top, bw, hgt);
      if (isGhost) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = col;
        ctx.strokeRect(x - bw / 2 - 1, top - 1, bw + 2, hgt + 2);
        ctx.restore();
        ctx.fillStyle = P.ink3; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText("ยังไม่ปิด", x, yOf(H[i]) - 4);
      }
    }

    if (barsDrawn === 0) {
      showEmpty("แท่งราคาของ " + (t.ticker || "?") + " ขาดข้อมูลทั้งหมด — รัน workbench_refresh ใหม่");
      return;
    }

    // SMA20 (บาง, ฟ้า) / SMA50 (หนา, ม่วง)
    drawLine(sma20, P.blue, 1.25, xOf, yOf, n);
    drawLine(sma50, P.purple, 2, xOf, yOf, n);

    // เส้นระดับ + ป้ายราคาขอบขวา
    for (const l of levels) {
      const y = yOf(l.y);
      ctx.save();
      ctx.strokeStyle = l.color; ctx.lineWidth = 1; ctx.setLineDash(l.dash);
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + plotW, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = l.color; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText(l.label, ML + plotW - 4, y - 2);
      tag(ML + plotW + 2, y, U.fmtPrice(l.y), l.color, P);
    }
    if (setup && U.isNum(lv.rr) && U.isNum(lv.target)) {
      const y = yOf(lv.target);
      ctx.fillStyle = U.hexToRgba(P.up, 0.15);
      ctx.strokeStyle = P.up;
      roundRect(ML + plotW - 62, y + 4, 58, 16, 4, true, true);
      ctx.fillStyle = P.up; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("R:R " + U.fmtNum(lv.rr, 1), ML + plotW - 33, y + 12);
    }

    // volume pane
    const ratio = volSpikeRatio();
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(V[i])) continue;
      const upBar = C[i] >= O[i];
      const hot = U.isNum(volAvg[i]) && V[i] >= volAvg[i] * ratio;
      ctx.fillStyle = U.hexToRgba(upBar ? P.up : P.down, hot ? 0.95 : 0.38);
      const x = xOf(i);
      ctx.fillRect(x - bw / 2, yVol(V[i]), bw, volTop + volH - yVol(V[i]));
    }
    ctx.strokeStyle = P.ink2; ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (!U.isNum(volAvg[i])) continue;
      const x = xOf(i), y = yVol(volAvg[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // แกนวันที่ + เครื่องหมายงบ "E"
    ctx.fillStyle = P.ink3; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const step = Math.max(1, Math.round(n / 6));
    for (let i = Math.floor(step / 2); i < n; i += step) {
      ctx.fillText(dates[i] ? dates[i].slice(5) : "", xOf(i), volTop + volH + 5);
    }
    const recent = U.get(t, "earnings.recent", []) || [];
    for (const d of recent) {
      const i = dates.indexOf(d);
      if (i < 0) continue;
      const x = xOf(i);
      ctx.fillStyle = P.amber;
      ctx.fillRect(x - 1, volTop + volH + 2, 2, 5);
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("E", x, volTop + volH + 8);
      ctx.fillStyle = P.ink3;
    }

    // ชิปนับถอยหลังงบ มุมขวาบน
    const daysTo = U.get(t, "earnings.days_to", null);
    if (daysTo != null && U.get(t, "earnings.next_date", null)) {
      const txt = "งบอีก " + daysTo + " วัน";
      const wTxt = ctx.measureText(txt).width + 14;
      const x0 = ML + plotW - wTxt - 4, y0 = MT + 4;
      const danger = daysTo <= U.earnMinDays();
      ctx.fillStyle = U.hexToRgba(danger ? P.down : P.ink3, 0.15);
      ctx.strokeStyle = danger ? P.down : P.ink3;
      roundRect(x0, y0, wTxt, 18, 5, true, true);
      ctx.fillStyle = danger ? P.down : P.ink2;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(txt, x0 + wTxt / 2, y0 + 9.5);
    }

    // legend SMA
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = P.blue; ctx.fillText("— SMA20", ML + 4, MT + priceH - 22);
    ctx.fillStyle = P.purple; ctx.fillText("— SMA50", ML + 4, MT + priceH - 9);

    if (mouse) drawCrosshair(P);
    hideEmpty();   // วาดสำเร็จ — เคลียร์ป้ายว่างที่อาจค้างจาก renderSide/รอบก่อน
  }

  function drawLine(series, color, width, xOf, yOf, n) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (!U.isNum(series[i])) continue;
      const x = xOf(i), y = yOf(series[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    if (started) ctx.stroke();
  }

  function tag(x, yC, text, color) {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = color;
    roundRect(x, yC - 8, Math.min(w, 60), 16, 3, true, false);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 4, yC + 0.5);
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawCrosshair(P) {
    const v = view;
    if (!v) return;
    const { ML, MT, plotW, priceH, volTop, volH, slot, xOf, yOf } = v;
    const inX = mouse.x >= ML && mouse.x <= ML + plotW;
    const inY = mouse.y >= MT && mouse.y <= volTop + volH;
    if (!inX || !inY) return;
    const i = Math.max(0, Math.min(v.n - 1, Math.floor((mouse.x - ML) / slot)));
    const x = xOf(i);

    ctx.save();
    ctx.strokeStyle = U.hexToRgba(P.ink2, 0.6); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, volTop + volH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ML, mouse.y); ctx.lineTo(ML + plotW, mouse.y); ctx.stroke();
    ctx.restore();

    // ป้ายราคาที่เส้นนอน (เฉพาะใน pane ราคา)
    if (mouse.y <= MT + priceH) {
      const p = v.pMax - (mouse.y - MT) / priceH * (v.pMax - v.pMin);
      tag(ML + plotW + 2, mouse.y, U.fmtPrice(p), P.ink2, P);
    }
    // ป้ายวันที่ใต้แกน
    ctx.fillStyle = P.ink2;
    roundRect(Math.min(Math.max(x - 34, ML), ML + plotW - 68), volTop + volH + 2, 68, 15, 3, true, false);
    ctx.fillStyle = P.bg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(v.dates[i] || "", Math.min(Math.max(x, ML + 34), ML + plotW - 34), volTop + volH + 10);

    // กล่องอ่านค่า OHLC มุมซ้ายบน
    const chg = i > 0 ? (v.C[i] / v.C[i - 1] - 1) * 100 : null;
    const volTxt = U.isNum(v.V[i]) ? (v.V[i] >= 1e6 ? (v.V[i] / 1e6).toFixed(1) + "M" : U.fmtInt(v.V[i])) : "—";
    const lines = [
      v.dates[i] || "",
      "O " + U.fmtPrice(v.O[i]) + "  H " + U.fmtPrice(v.H[i]),
      "L " + U.fmtPrice(v.L[i]) + "  C " + U.fmtPrice(v.C[i]),
      "Δ " + U.fmtPct(chg) + "  Vol " + volTxt,
    ];
    ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
    let wMax = 0;
    for (const ln of lines) wMax = Math.max(wMax, ctx.measureText(ln).width);
    const bx = ML + 6, by = MT + 6, bw2 = wMax + 16, bh = lines.length * 15 + 10;
    ctx.fillStyle = U.hexToRgba(P.panel === "" ? "#121a2b" : P.panel, 0.92);
    ctx.strokeStyle = P.line;
    roundRect(bx, by, bw2, bh, 5, true, true);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    lines.forEach((ln, j) => {
      ctx.fillStyle = j === 3 && U.isNum(chg) ? (chg >= 0 ? P.up : P.down) : (j === 0 ? P.ink2 : P.ink);
      ctx.fillText(ln, bx + 8, by + 6 + j * 15);
    });
    ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
  }

  // ---------- side DOM (title, empty state, levels card, checklist) ----------
  function renderSide() {
    const titleEl = U.$("#chartTitle");
    const emptyEl = U.$("#chartEmpty");
    const lvlEl = U.$("#levelsCard");
    const chkEl = U.$("#checklistCard");
    if (!titleEl || !emptyEl || !lvlEl || !chkEl) return;

    // ปุ่มช่วงเวลา: ปิดถ้าแท่งไม่พอ
    const avail = barsAvailable();
    U.$$(".range-btn").forEach((b) => {
      const nReq = parseInt(b.dataset.range, 10) || 0;
      b.disabled = avail > 0 && avail < nReq;
      b.title = b.disabled ? "ข้อมูลไม่พอ (" + avail + " แท่ง)" : "";
    });

    if (!t) {
      titleEl.innerHTML = "";
      emptyEl.hidden = false;
      emptyEl.textContent = "เลือกหุ้นจากตารางเพื่อดูกราฟ";
      lvlEl.hidden = true; chkEl.hidden = true;
      return;
    }

    const vi = U.verdictInfo(t);
    const ind = t.ind || {};
    const d1 = U.get(ind, "d1_pct", null);
    // ชิปราคาสด (ชั้นดูอย่างเดียว) — โชว์เฉพาะเมื่อแท่ง live ใหม่กว่าแท่งปิดในข้อมูล
    let liveChip = "";
    const lq2 = U.liveQuote ? U.liveQuote(t.ticker) : null;
    if (lq2 && lq2.bar_date && U.get(t, "ohlcv.dates", []).length &&
        lq2.bar_date > t.ohlcv.dates[t.ohlcv.dates.length - 1] && U.isNum(lq2.last)) {
      liveChip = '<span class="live-chip ' + U.pctClass(lq2.chg_pct) + '" ' +
        'title="ราคาระหว่างวัน — ใช้ดูเท่านั้น คำตัดสิน/ระดับมาจากแท่งปิด">● สด ' +
        U.fmtPrice(lq2.last) + " (" + U.fmtPct(lq2.chg_pct) + ")</span>";
    }
    titleEl.innerHTML =
      '<span class="tk">' + U.esc(t.ticker) + "</span>" +
      '<span class="px num">' + U.fmtPrice(ind.close) + "</span>" +
      '<span class="num ' + U.pctClass(d1) + '">' + U.fmtPct(d1) + "</span>" +
      liveChip +
      '<span class="num" style="color:var(--ink2)">ATR ' + (U.isNum(ind.atr_pct) ? U.fmtNum(ind.atr_pct, 2) + "%" : "—") + "</span>" +
      '<span class="vbadge ' + vi.cls + '">' + U.esc(vi.label) + "</span>" +
      '<a class="lesson-link" href="../academy/visuals/setup-patterns.html" target="_blank" rel="noopener">เปิดบทเรียนกติกา breakout</a>';

    if (t.ok === false || !U.get(t, "ohlcv.c", null)) {
      emptyEl.hidden = false;
      emptyEl.textContent = "ไม่มีข้อมูลราคา — ดึงไม่สำเร็จ";
    } else {
      emptyEl.hidden = true;
    }

    renderLevelsCard(lvlEl);
    renderChecklist(chkEl);
  }

  function renderLevelsCard(el) {
    const ind = t.ind || {};
    const vv = U.get(t, "verdict.values", {}) || {};
    const close = U.get(ind, "close", null);
    const k = kAtr();
    const P = U.palette();
    const rows = [];
    const add = (label, val, color) => { if (U.isNum(val)) rows.push({ label, val, color }); };
    add("แนวต้าน (resistance)", vv.resistance, P.orange);
    add("ฐานล่าง (base low)", vv.base_low, P.ink3);
    add("SMA20", ind.sma20, P.blue);
    add("SMA50", ind.sma50, P.purple);
    add("52w สูงสุด", ind.w52_high, P.ink2);
    add("52w ต่ำสุด", ind.w52_low, P.ink2);
    if (U.isNum(close) && U.isNum(ind.atr14)) {
      add("close −" + k + "×ATR", close - k * ind.atr14, P.down);
      add("close +" + k + "×ATR", close + k * ind.atr14, P.up);
    }
    if (!rows.length) { el.hidden = true; return; }
    el.hidden = false;
    let html = "<h4>การ์ดระดับราคา (levels card)</h4>" +
      '<table class="side-table"><thead><tr><th>ระดับ</th><th>ราคา</th><th>ห่างจากราคาปิด</th></tr></thead><tbody>';
    for (const r of rows) {
      const dist = U.isNum(close) && close !== 0 ? (r.val / close - 1) * 100 : null;
      html += "<tr><td><span class=\"lvl-dot\" style=\"background:" + r.color + '"></span>' + U.esc(r.label) + "</td>" +
        '<td class="num">' + U.fmtPrice(r.val) + "</td>" +
        '<td class="num ' + U.pctClass(dist) + '">' + U.fmtPct(dist) + "</td></tr>";
    }
    html += "</tbody></table>";
    // ความเสี่ยง gap ช่วงงบ — การขยับ "คร่อมวันงบ" ในอดีต (แทน fair value ของ investing.com
    // ด้วยสถิติที่ swing แคร์จริง — ดู knowledge/pro-platform-feature-map.md)
    const er = t.earnings_react || null;
    if (er && U.isNum(er.median_abs_pct)) {
      html += '<p class="er-note">ขยับคร่อมวันงบ (' + (er.events || []).length +
        " ครั้งล่าสุด): มัธยฐาน ±" + U.fmtNum(er.median_abs_pct, 1) +
        "% · แรงสุด ±" + U.fmtNum(er.max_abs_pct, 1) +
        "% — ขนาด gap ที่ตัวนี้เคยทำช่วงงบ (เหตุผลของกติกา งบ >3 สัปดาห์)</p>";
    }
    el.innerHTML = html;
  }

  function renderChecklist(el) {
    const v = t.verdict || null;
    if (!v || !v.checks) { el.hidden = true; return; }
    el.hidden = false;
    const { order, labels } = U.checkMeta();
    const keys = order.length ? order : Object.keys(v.checks);
    const vv = v.values || {};
    const r = rules();
    const baseMax = U.get(r, "breakout.base_width_max", null);
    const ratio = volSpikeRatio();
    const minDays = U.get(r, "earnings.min_days", 21);
    const kindTh = { mandatory: "บังคับ", optional: "เสริม", screen: "คัดกรอง" };
    let html = "<h4>เช็คลิสต์ 7 ข้อ</h4>";
    for (const key of keys) {
      const lab = labels[key] || {};
      const val = v.checks[key];
      const ico = val === true ? '<span class="check-ico pass">✓</span>'
        : val === false ? '<span class="check-ico fail">✗</span>'
        : '<span class="check-ico miss">?</span>';
      let measured = "—";
      if (key === "m1_base" && U.isNum(vv.base_width_pct)) {
        measured = U.fmtNum(vv.base_width_pct, 1) + "%" + (U.isNum(baseMax) ? " (เกณฑ์ <" + U.fmtNum(baseMax * 100, 0) + "%)" : "");
      } else if (key === "m3_vol_spike" && U.isNum(vv.vol_ratio)) {
        measured = U.fmtNum(vv.vol_ratio, 2) + "× (เกณฑ์ ≥" + U.fmtNum(ratio, 2) + "×)";
      } else if (key === "o5_earnings" && vv.days_to_earnings != null) {
        measured = vv.days_to_earnings + " วัน (เกณฑ์ >" + minDays + " วัน)";
      }
      html += '<div class="check-row">' + ico +
        '<span class="check-label">' + U.esc(lab.th || key) +
        '<span class="kind">' + U.esc(kindTh[lab.kind] || lab.kind || "") + "</span></span>" +
        '<span class="check-val">' + U.esc(measured) + "</span></div>";
    }
    el.innerHTML = html;
  }

  window.WBCandles = { init, setTicker, setRange, getRange, redraw, clearCrosshair, themeChanged, liveTick };
})();
