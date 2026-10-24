/* Swing Workbench — panels.js: ปฏิทินงบ · พอร์ต & เป้าหมาย · หลักฐาน backtest · กติกา v2 */
(function () {
  "use strict";
  const U = window.WBUtil;

  const num = (v, dp) => (U.isNum(v) ? U.fmtNum(v, dp == null ? 2 : dp) : "—");
  // เศษส่วน → เปอร์เซ็นต์ (0.08 → "8")
  const f2p = (v) => (U.isNum(v) ? String(Math.round(v * 1000) / 10) : "—");

  // ---------- ② ปฏิทินงบ = shared component (shared/_kit/earnings-calendar.js) — ใช้ logic เดียวกับสรุปเช้า
  // (โหลด earnings-calendar.js ก่อน app.js ใน index.html → window.SWEarnCal มีตอนเรียก)
  function renderCalendar(onPick) {
    if (window.SWEarnCal) window.SWEarnCal.render(U.$("#calendarWrap"), onPick);
  }

  // ---------- ③ พอร์ต & เป้าหมาย ----------
  function renderPort(onGotoBoard) {
    const port = U.get(window.WB, "meta.port", {}) || {};
    const cardsEl = U.$("#portCards");
    if (cardsEl) {
      const vUsd = port.value_usd, risk = port.risk_pct, cap = port.max_pos_pct;
      const riskUsd = U.isNum(vUsd) && U.isNum(risk) ? vUsd * risk / 100 : null;
      const capUsd = U.isNum(vUsd) && U.isNum(cap) ? vUsd * cap / 100 : null;
      cardsEl.innerHTML =
        card("พอร์ตกระดาษ (paper)", "$" + U.fmtPrice(vUsd), "≈ " + U.fmtInt(port.value_thb) + " บาท") +
        card("เสี่ยงต่อไม้ " + num(risk, 0) + "%", "$" + U.fmtPrice(riskUsd), "= $" + U.fmtPrice(vUsd) + " × " + num(risk, 0) + "%") +
        card("เพดานต่อไม้ " + num(cap, 0) + "%", "$" + U.fmtPrice(capUsd), "= $" + U.fmtPrice(vUsd) + " × " + num(cap, 0) + "%") +
        card("เพดานกลุ่มอุตสาหกรรม", num(port.sector_cap_pct, 0) + "%", "ของมูลค่าพอร์ต");
    }

    const open = U.get(window.WB, "positions.open", []) || [];
    const openEl = U.$("#openPosWrap");
    if (openEl) {
      if (!open.length) {
        openEl.innerHTML = '<div class="empty-state"><div class="big">ยังไม่มีไม้เปิด — กระดานเฝ้าดูคือขั้นถัดไป</div>' +
          '<button type="button" class="jump-btn" id="gotoBoardBtn">ไปที่กระดานเฝ้าดู →</button></div>';
        const btn = U.$("#gotoBoardBtn");
        if (btn) btn.addEventListener("click", () => { if (onGotoBoard) onGotoBoard(); });
      } else {
        const vUsd = port.value_usd;
        let h = '<table class="pos-table"><thead><tr><th>Ticker</th><th>วันเข้า</th><th>จำนวนหุ้น</th>' +
          "<th>entry</th><th>stop</th><th>target</th><th>มูลค่า</th><th>% พอร์ต</th><th>ความเสี่ยง</th></tr></thead><tbody>";
        for (const p of open) {
          const pctPort = U.isNum(p.position_value) && U.isNum(vUsd) && vUsd ? p.position_value / vUsd * 100 : null;
          h += "<tr><td>" + U.esc(p.ticker || "—") + "</td><td class=\"num\">" + U.esc(p.date_entered || "—") + "</td>" +
            '<td class="num">' + num(p.shares) + '</td><td class="num">' + U.fmtPrice(p.entry_price) + "</td>" +
            '<td class="num">' + U.fmtPrice(p.stop_price) + '</td><td class="num">' + U.fmtPrice(p.target_price) + "</td>" +
            '<td class="num">$' + U.fmtPrice(p.position_value) + '</td><td class="num">' + U.fmtPct(pctPort, false) + "</td>" +
            '<td class="num">' + U.fmtPct(p.risk_pct, false) + "</td></tr>";
        }
        openEl.innerHTML = h + "</tbody></table>";
      }
    }

    const closed = U.get(window.WB, "positions.closed", []) || [];
    const closedEl = U.$("#closedPosWrap");
    if (closedEl) {
      if (!closed.length) {
        closedEl.innerHTML = '<div class="empty-state">ยังไม่มีไม้ปิด</div>';
      } else {
        let h = '<table class="pos-table"><thead><tr><th>Ticker</th><th>เข้า</th><th>ออก</th>' +
          "<th>R</th><th>กำไร/ขาดทุน</th><th>เหตุผลออก</th><th>ทำตามแผน</th></tr></thead><tbody>";
        for (const p of closed) {
          h += "<tr><td>" + U.esc(p.ticker || "—") + '</td><td class="num">' + U.esc(p.date_entered || "—") + "</td>" +
            '<td class="num">' + U.esc(p.date_exited || "—") + '</td><td class="num ' + U.pctClass(p.R_multiple) + '">' + num(p.R_multiple) + "R</td>" +
            '<td class="num ' + U.pctClass(p.pnl_abs) + '">$' + U.fmtPrice(p.pnl_abs) + "</td>" +
            "<td>" + U.esc(p.exit_reason || "—") + "</td><td>" + (p.followed_plan === true ? "✓" : p.followed_plan === false ? "✗" : "—") + "</td></tr>";
        }
        closedEl.innerHTML = h + "</tbody></table>";
      }
    }

    const msEl = U.$("#milestonesWrap");
    if (msEl) {
      const ms = U.get(window.WB, "milestones", []) || [];
      let h = "";
      for (const m of ms) {
        const na = m.current == null;
        const pct = !na && U.isNum(m.target) && m.target > 0 ? Math.min(100, m.current / m.target * 100) : 0;
        h += '<div class="ms-row"><span class="ms-label">' + U.esc(m.th || "") + "</span>" +
          '<span class="ms-bar' + (na ? " na" : "") + '"><i style="width:' + (na ? 100 : pct) + '%"></i></span>' +
          '<span class="ms-val num">' + (na ? "ยังวัดไม่ได้" : num(m.current, 0) + " / " + num(m.target, 0)) + "</span></div>";
      }
      msEl.innerHTML = h || '<div class="empty-state">ไม่มีข้อมูลด่านปลดล็อก</div>';
    }

    const capEl = U.$("#riskCapWrap");
    if (capEl) {
      const sum = U.get(window.WB, "positions.summary", {}) || {};
      const expo = U.isNum(sum.exposure_usd) ? sum.exposure_usd : 0;
      const vUsd = port.value_usd;
      const pct = U.isNum(vUsd) && vUsd > 0 ? Math.min(100, expo / vUsd * 100) : 0;
      capEl.innerHTML = '<div class="cap-bar"><i style="width:' + pct + '%"></i></div>' +
        '<p class="caption">ใช้พื้นที่ไป $' + U.fmtPrice(expo) + " จาก $" + U.fmtPrice(vUsd) +
        " (" + U.fmtNum(pct, 1) + "%) · ความเสี่ยงเปิดอยู่ (open risk) $" + U.fmtPrice(sum.open_risk_usd || 0) + "</p>";
    }
  }

  function card(k, v, s) {
    return '<div class="stat-card"><div class="k">' + U.esc(k) + '</div><div class="v">' + U.esc(v) + "</div>" +
      (s ? '<div class="s">' + U.esc(s) + "</div>" : "") + "</div>";
  }

  // ---------- ④ หลักฐาน backtest ----------
  function pickRun(runId) {
    const runs = U.get(window.WB, "backtest.runs", []) || [];
    if (!runs.length) return null;
    if (runId) {
      const r = runs.find((x) => x && x.id === runId);
      if (r) return r;
    }
    return runs.find((x) => x && x.kind === "OOS") || runs[0];
  }

  function renderBacktest(runId, onPickRun) {
    const runs = U.get(window.WB, "backtest.runs", []) || [];
    const pillsEl = U.$("#runPills"), statsEl = U.$("#btStats");
    const run = pickRun(runId);
    if (pillsEl) {
      if (!runs.length) {
        pillsEl.innerHTML = '<div class="empty-state">ยังไม่มีชุดผลสอบ backtest ในไฟล์ข้อมูล</div>';
      } else {
        pillsEl.innerHTML = runs.map((r) =>
          '<button type="button" class="run-pill' + (run && r.id === run.id ? " active" : "") + '" data-run="' + U.esc(r.id) + '">' +
          U.esc((r.kind || "?") + " · " + (r.pattern || "")) + "</button>").join("");
        pillsEl.querySelectorAll(".run-pill").forEach((b) => {
          b.addEventListener("click", () => { if (onPickRun) onPickRun(b.dataset.run); });
        });
      }
    }
    if (statsEl) {
      if (!run) { statsEl.innerHTML = ""; }
      else {
        const ci = Array.isArray(run.ci90) ? run.ci90 : [];
        const ex = run.excursion || {};
        statsEl.innerHTML =
          card("จำนวนไม้ (n)", String(run.n == null ? "—" : run.n), "ไม้ในชุด " + (run.kind || "")) +
          card("ค่าคาดหวัง (expectancy)", num(run.exp_r) + " R/ไม้", "เฉลี่ยต่อไม้ หน่วยเป็น R") +
          card("อัตราชนะ (win rate)", num(run.win_pct, 1) + "%", "สัดส่วนไม้ที่จบบวก") +
          card("ช่วงเชื่อมั่น CI90", "[" + num(ci[0]) + ", " + num(ci[1]) + "]", "ค่าคาดหวังจริงน่าจะอยู่ในช่วงนี้ (โดยประมาณ)") +
          (U.isNum(ex.avg_exit_eff_winner)
            ? card("เก็บได้กี่ส่วนของที่ตลาดให้", num(ex.avg_exit_eff_winner * 100, 0) + "%",
                   "ไม้ชนะ: R ที่ได้จริง ÷ จุดไกลสุดที่ราคาเคยไป (MFE)")
            : "") +
          (U.isNum(ex.avg_mae_loser)
            ? card("ไม้แพ้โดนลากลึกเฉลี่ย", num(ex.avg_mae_loser, 2) + " R",
                   ">1R ได้เพราะ gap ข้าม stop — จาก high/low รายวัน")
            : "") +
          '<span class="bt-tag">ผล backtest — ไม่ใช่ผลเทรดจริง</span>';
      }
    }
    drawBtCharts(run);
  }

  function prep(id) {
    const cv = U.$(id);
    if (!cv) return null;
    const W = cv.clientWidth || 280, H = cv.clientHeight || 160;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.font = "10.5px " + getComputedStyle(document.body).fontFamily;
    return { c, W, H };
  }
  function noTrades(p, P) {
    p.c.fillStyle = P.ink3; p.c.textAlign = "center"; p.c.textBaseline = "middle";
    p.c.fillText("ไม่มีรายการไม้ในชุดนี้", p.W / 2, p.H / 2);
  }

  function drawBtCharts(run) {
    const P = U.palette();
    const trades = run && Array.isArray(run.trades) ? run.trades.filter((t) => t && U.isNum(t.r)) : [];

    // (a) เส้นทุนสะสม R
    let p = prep("#btEquity");
    if (p) {
      if (!trades.length) noTrades(p, P);
      else {
        const cum = []; let s = 0;
        for (const t of trades) { s += t.r; cum.push(s); }
        const L = 34, R = 8, T = 10, B = 18;
        const lo = Math.min(0, ...cum), hi = Math.max(0, ...cum);
        const y = (v) => T + (hi - v) / ((hi - lo) || 1) * (p.H - T - B);
        const x = (i) => L + (trades.length === 1 ? 0 : i / (trades.length - 1) * (p.W - L - R));
        p.c.strokeStyle = P.ink3; p.c.setLineDash([4, 4]);
        p.c.beginPath(); p.c.moveTo(L, y(0)); p.c.lineTo(p.W - R, y(0)); p.c.stroke();
        p.c.setLineDash([]);
        p.c.fillStyle = P.ink3; p.c.textAlign = "left"; p.c.textBaseline = "middle";
        p.c.fillText("0R", 4, y(0));
        p.c.fillText(num(hi, 1) + "R", 4, y(hi));
        p.c.strokeStyle = P.accent; p.c.lineWidth = 1.5;
        p.c.beginPath();
        cum.forEach((v, i) => { i ? p.c.lineTo(x(i), y(v)) : p.c.moveTo(x(i), y(v)); });
        p.c.stroke();
        p.c.fillStyle = P.accent;
        cum.forEach((v, i) => { p.c.beginPath(); p.c.arc(x(i), y(v), 2, 0, 7); p.c.fill(); });
        p.c.fillStyle = P.ink3; p.c.textAlign = "center"; p.c.textBaseline = "top";
        p.c.fillText("ไม้ที่ 1 → " + trades.length, p.W / 2, p.H - 13);
      }
    }

    // (b) histogram ของ R
    p = prep("#btHist");
    if (p) {
      if (!trades.length) noTrades(p, P);
      else {
        const labels = ["≤−1", "−1..0", "0..1", "1..2", "≥2"];
        const bins = [0, 0, 0, 0, 0];
        for (const t of trades) {
          if (t.r <= -1) bins[0]++;
          else if (t.r < 0) bins[1]++;
          else if (t.r < 1) bins[2]++;
          else if (t.r < 2) bins[3]++;
          else bins[4]++;
        }
        drawVBars(p, P, labels, bins, (i) => (i <= 1 ? P.down : P.up));
      }
    }

    // (c) ส่วนผสมทางออก
    p = prep("#btExit");
    if (p) {
      if (!trades.length) noTrades(p, P);
      else {
        const order = ["stop", "target", "time_stop"];
        const agg = new Map();
        for (const t of trades) {
          const k = t.exit_reason || "อื่น ๆ";
          if (!agg.has(k)) agg.set(k, { n: 0, sum: 0 });
          const a = agg.get(k); a.n++; a.sum += t.r;
        }
        const keys = [...order.filter((k) => agg.has(k)), ...[...agg.keys()].filter((k) => order.indexOf(k) < 0)];
        const colors = { stop: P.down, target: P.up, time_stop: P.amber };
        const maxN = Math.max(...keys.map((k) => agg.get(k).n), 1);
        const rowH = Math.min(34, (p.H - 14) / keys.length);
        keys.forEach((k, i) => {
          const a = agg.get(k);
          const yTop = 8 + i * rowH;
          const wBar = (a.n / maxN) * (p.W - 170);
          p.c.fillStyle = colors[k] || P.ink3;
          p.c.fillRect(78, yTop + 4, Math.max(2, wBar), rowH - 12);
          p.c.fillStyle = P.ink2; p.c.textAlign = "right"; p.c.textBaseline = "middle";
          p.c.fillText(k, 74, yTop + rowH / 2 - 2);
          p.c.textAlign = "left";
          const avg = a.sum / a.n;
          p.c.fillText(a.n + " ไม้ · เฉลี่ย " + (avg > 0 ? "+" : "") + num(avg, 2) + "R", 82 + Math.max(2, wBar), yTop + rowH / 2 - 2);
        });
      }
    }

    // (e) ปฏิทิน R รายเดือน — แนว PnL calendar ของสมุดเทรด (Stonk Journal) แบบย่อ:
    // แถว = ปี, คอลัมน์ = เดือน, สี = ผลรวม R ของไม้ที่ปิดเดือนนั้น
    p = prep("#btMonthly");
    if (p) {
      const withDate = trades.filter((t) => t.exit_date);
      if (!withDate.length) noTrades(p, P);
      else {
        const agg = new Map();
        for (const t of withDate) {
          const ym = t.exit_date.slice(0, 7);
          agg.set(ym, (agg.get(ym) || 0) + t.r);
        }
        const years = [...new Set([...agg.keys()].map((k) => k.slice(0, 4)))].sort();
        const L = 38, T = 16, B = 4, R = 4;
        const cw = (p.W - L - R) / 12, ch = Math.min(22, (p.H - T - B) / years.length);
        const maxAbs = Math.max(...[...agg.values()].map(Math.abs), 0.5);
        p.c.textAlign = "center"; p.c.textBaseline = "middle";
        p.c.fillStyle = P.ink3;
        for (let m = 0; m < 12; m++) p.c.fillText(String(m + 1), L + cw * (m + 0.5), 8);
        years.forEach((yr, yi) => {
          p.c.fillStyle = P.ink3; p.c.textAlign = "right";
          p.c.fillText(yr, L - 5, T + ch * (yi + 0.5));
          p.c.textAlign = "center";
          for (let m = 0; m < 12; m++) {
            const key = yr + "-" + String(m + 1).padStart(2, "0");
            const x = L + cw * m + 1, y = T + ch * yi + 1;
            if (!agg.has(key)) {
              p.c.fillStyle = P.grid || "rgba(128,128,128,.12)";
              p.c.fillRect(x, y, cw - 2, ch - 2);
              continue;
            }
            const v = agg.get(key);
            const a = 0.18 + 0.72 * Math.min(1, Math.abs(v) / maxAbs);
            p.c.globalAlpha = a;
            p.c.fillStyle = v >= 0 ? P.up : P.down;
            p.c.fillRect(x, y, cw - 2, ch - 2);
            p.c.globalAlpha = 1;
            if (ch >= 14 && cw >= 26) {
              p.c.fillStyle = P.ink2;
              p.c.fillText((v > 0 ? "+" : "") + num(v, 1), x + (cw - 2) / 2, y + (ch - 2) / 2);
            }
          }
        });
      }
    }

    // (f) MFE vs R ที่เก็บได้จริง (ไม้ชนะ) — exit efficiency รายไม้:
    // จุดใต้เส้นทแยง = ทิ้งกำไรบนโต๊ะ (ตลาดเคยให้มากกว่าที่เก็บได้)
    p = prep("#btMaeMfe");
    if (p) {
      const wins = trades.filter((t) => t.r > 0 && U.isNum(t.mfe_r));
      if (!wins.length) noTrades(p, P);
      else {
        const L = 34, R = 8, T = 10, B = 22;
        const maxV = Math.max(...wins.map((t) => Math.max(t.mfe_r, t.r)), 3);
        const x = (v) => L + v / maxV * (p.W - L - R);
        const y = (v) => T + (1 - v / maxV) * (p.H - T - B);
        p.c.strokeStyle = P.ink3; p.c.setLineDash([4, 4]);
        p.c.beginPath(); p.c.moveTo(x(0), y(0)); p.c.lineTo(x(maxV), y(maxV)); p.c.stroke();
        p.c.setLineDash([]);
        p.c.fillStyle = P.up; p.c.globalAlpha = 0.75;
        for (const t of wins) {
          p.c.beginPath(); p.c.arc(x(t.mfe_r), y(t.r), 3, 0, 7); p.c.fill();
        }
        p.c.globalAlpha = 1;
        p.c.fillStyle = P.ink3;
        p.c.textAlign = "center"; p.c.textBaseline = "top";
        p.c.fillText("ตลาดเคยให้ไกลสุด MFE (R) →", (L + p.W - R) / 2, p.H - 14);
        p.c.save();
        p.c.translate(10, (T + p.H - B) / 2); p.c.rotate(-Math.PI / 2);
        p.c.textBaseline = "middle";
        p.c.fillText("เก็บได้จริง (R) →", 0, 0);
        p.c.restore();
      }
    }

    // (d) histogram วันที่ถือ
    p = prep("#btDays");
    if (p) {
      if (!trades.length) noTrades(p, P);
      else {
        const labels = ["1-5", "6-10", "11-15", "16-21", ">21"];
        const bins = [0, 0, 0, 0, 0];
        for (const t of trades) {
          const d = t.days_held;
          if (!U.isNum(d)) continue;
          if (d <= 5) bins[0]++;
          else if (d <= 10) bins[1]++;
          else if (d <= 15) bins[2]++;
          else if (d <= 21) bins[3]++;
          else bins[4]++;
        }
        drawVBars(p, P, labels, bins, () => P.accent);
        p.c.fillStyle = P.ink3; p.c.textAlign = "right"; p.c.textBaseline = "top";
        p.c.fillText("หน่วย: วัน", p.W - 6, 4);
      }
    }
  }

  function drawVBars(p, P, labels, bins, colorAt) {
    const n = bins.length;
    const L = 8, R = 8, T = 14, B = 20;
    const maxV = Math.max(...bins, 1);
    const slot = (p.W - L - R) / n;
    const bw = Math.min(46, slot * 0.6);
    bins.forEach((v, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const h = (v / maxV) * (p.H - T - B);
      p.c.fillStyle = colorAt(i);
      p.c.fillRect(x, p.H - B - h, bw, Math.max(v > 0 ? 2 : 0, h));
      p.c.fillStyle = P.ink2; p.c.textAlign = "center"; p.c.textBaseline = "bottom";
      if (v > 0) p.c.fillText(String(v), x + bw / 2, p.H - B - h - 2);
      p.c.fillStyle = P.ink3; p.c.textBaseline = "top";
      p.c.fillText(labels[i], x + bw / 2, p.H - B + 4);
    });
  }

  // ---------- ⑤ กติกา v2 ----------
  function renderRules() {
    const r = U.get(window.WB, "rules", {}) || {};
    const b = r.breakout || {}, st = r.stop || {}, ex = r.exit || {}, earn = r.earnings || {}, sz = r.sizing || {};
    const port = U.get(window.WB, "meta.port", {}) || {};
    const nameEl = U.$("#rulesName");
    if (nameEl) nameEl.textContent = r.name || U.get(window.WB, "meta.ruleset", "—");

    const chipsEl = U.$("#patternChips");
    if (chipsEl) {
      const ps = U.get(window.WB, "meta.pattern_status", {}) || {};
      chipsEl.innerHTML = Object.keys(ps).map((k) => {
        const on = ps[k] === "ACTIVE";
        return '<span class="chip ' + (on ? "chip-on" : "chip-park") + '">' +
          U.esc(k) + " — " + U.esc(ps[k]) + "</span>";
      }).join("");
    }

    const atrBand = Array.isArray(b.atr_band) ? b.atr_band : [];
    const boxes = [
      ["ประตูสภาพตลาด (regime gate)", "SPY ปิดเหนือ SMA" + (U.get(r, "regime.spy_sma_len", null) == null ? "—" : r.regime.spy_sma_len) + " เท่านั้นจึงเปิดไม้ใหม่ได้"],
      ["ฐานราคาแน่น (base)", "กว้าง < " + f2p(b.base_width_max) + "% · มองย้อน " + (b.base_days == null ? "—" : b.base_days) + " วัน"],
      ["แตะแนวต้าน (touches)", "≥ " + (b.touch_min == null ? "—" : b.touch_min) + " ครั้ง · ห่างกัน ≥ " + (b.touch_min_gap_days == null ? "—" : b.touch_min_gap_days) + " วัน · ระยะ ±" + f2p(b.touch_tol) + "%"],
      ["วอลุ่มวันทะลุ (volume spike)", "≥ " + (U.isNum(b.vol_spike_ratio) ? Math.round(b.vol_spike_ratio * 100) : "—") + "% ของเฉลี่ย " + (b.vol_avg_len == null ? "—" : b.vol_avg_len) + " วัน"],
      ["ปิดเหนือแนวต้าน (close above)", "ตัดสินจากราคาปิดของแท่งที่จบแล้วเท่านั้น"],
      ["ข้อเสริม (optional)", "ผ่าน ≥ " + (b.optional_min_pass == null ? "—" : b.optional_min_pass) + " จาก 2 — งบห่าง > " + (earn.min_days == null ? "—" : earn.min_days) + " วัน / sector ETF เขียว"],
      ["แบนด์ ATR (คัดกรอง)", num(atrBand[0], 1) + "–" + num(atrBand[1], 1) + "% ของราคา"],
      ["ระยะ stop", "[" + num(st.min_atr_mult, 1) + ", " + num(st.max_atr_mult, 1) + "]×ATR · โหมด " + (st.mode || "—") + " · ตั้งต้น " + num(b.k_atr, 1) + "×ATR"],
      ["เป้า target", "R:R ≥ " + num(b.rr_gate, 1) + " · โหมด " + (r.target_mode || "—")],
      ["time-stop", (ex.time_stop_days == null ? "—" : ex.time_stop_days) + " วัน — ถ้ายังไม่ถึง " + num(ex.time_stop_min_r, 1) + "R ให้ปิดไม้"],
      ["ขนาดไม้ (sizing)", "เสี่ยง " + num(port.risk_pct, 0) + "% ต่อไม้ · เพดานไม้ " + num(port.max_pos_pct, 0) + "% · เพดานกลุ่ม " + num(port.sector_cap_pct, 0) + "% · ถือพร้อมกันสูงสุด " + (sz.max_positions == null ? "—" : sz.max_positions) + " ไม้"],
    ];
    const gridEl = U.$("#rulesGrid");
    if (gridEl) {
      const boxHtml = (x) => '<div class="rule-box"><div class="rk">' + U.esc(x[0]) + '</div><div class="rv">' + U.esc(x[1]) + "</div></div>";
      // จัด 11 กติกาเป็น 3 กลุ่มย่อ/ขยาย (accordion) — ลดกำแพงกล่อง อ่านง่ายขึ้น (6 เข้า · 3 stop/target · 2 ถือ/ขนาด)
      const groups = [
        { title: "เงื่อนไขเข้า (breakout)", items: boxes.slice(0, 6) },
        { title: "ระยะ stop · target · คัดกรอง ATR", items: boxes.slice(6, 9) },
        { title: "ถือ · ออก · ขนาดไม้", items: boxes.slice(9) },
      ];
      gridEl.innerHTML = groups.map((gp) =>
        '<details class="rule-group" open><summary>' + U.esc(gp.title) +
        ' <span class="rg-count">' + gp.items.length + " ข้อ</span></summary>" +
        '<div class="rules-grid">' + gp.items.map(boxHtml).join("") + "</div></details>").join("");
    }
  }

  window.WBPanels = { renderCalendar, renderPort, renderBacktest, renderRules };
})();
