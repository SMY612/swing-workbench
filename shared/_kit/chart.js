/* shared/_kit/chart.js — SWChart: chart library กลาง (offline · vanilla · SVG)
   ============================================================================
   ใช้ร่วม landing (site-src/index.html) + สรุปเช้า (site-src/briefing.html).
   **pure renderer** — รับ data ที่ประมวลแล้ว (series / groups) + opts → วาด SVG +
   interactive · ไม่อ่าน window.WB เอง (ต่างจาก signals.js) → reuse ได้ทุก domain
   (SPY · equity curve · P&L · sector …). ก๊อปแพตเทิร์น signals.js / earnings-calendar.js.

   organic-ready: render(el, spec) ขับด้วย spec.type → เฟส 3 เพิ่ม pickType(data)
   (ดูรูปร่างข้อมูล → เลือก type) ต่อได้โดยไม่ต้องรื้อ library.

   quality contract (ทุกชนิดต้องมี): hover tooltip (ค่า ณ จุด) + แกน/label +
   ค่าสำคัญ + legend (ถ้าหลาย series) + empty state + a11y (role+aria-label) +
   theme-aware (สีผ่าน CSS var / style → ตามธีมอัตโนมัติ) + responsive (viewBox scale).

   API
   ----
   window.SWChart.area(el, {
     series,            // number[] (เส้นเดียว) | number[][] (หลายเส้น — multi-line ready)
     dates,             // ISO string[] (ออปชัน · ใช้ใน tooltip/แกน X)
     size,              // "full" (มี crosshair+แกน · default) | "mini" (spark เล็ก)
     labels, colors,    // ชื่อ/สีต่อเส้น (multi-line)
     color,             // สีเส้นเดียว (default var(--accent))
     valueFmt,          // (v)=>string (default WBUtil.fmtPrice)
     title, note, empty, ariaLabel, crosshair
   })
   window.SWChart.donut(el, {
     groups,            // [{label, value, pct?, tickers?, href?, color?}]
     size,              // "full" (legend+คลิก+center · default) | "mini" (สรุป top-3 ข้าง)
     legend, clickable, // clickable: (g)=>href | true(ใช้ g.href)
     center,            // {value, label} เลขกลางวง
     title, ariaLabel, empty
   })
   window.SWChart.render(el, spec)        // spec.type → area | donut
   window.SWChart.thDate(iso, withYear)   // helper (reuse · เลิก duplicate ใน landing/briefing)
   window.SWChart.ramp(n, stops?)         // ไล่เฉดสี n สี (default โทนเย็น sector)
   ============================================================================ */
(function () {
  "use strict";
  if (window.SWChart) return;                       // guard กัน double-run
  var U = window.WBUtil || {};
  var esc = U.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var isNum = U.isNum || function (x) { return typeof x === "number" && isFinite(x); };
  var _uid = 0;                                      // unique id ต่อ instance (gradient/filter ไม่ชนกัน)

  // ---- helpers (ย้ายจาก landing/briefing → เลิก duplicate) ----
  var TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function thDate(iso, withYear) {
    if (!iso || typeof iso !== "string") return "";
    var p = iso.split("-"); if (p.length < 3) return iso;
    var mo = parseInt(p[1], 10) - 1;
    return parseInt(p[2], 10) + " " + (TH_MON[mo] || p[1]) + (withYear ? " " + p[0] : "");
  }
  var SECTOR_RAMP = ["#6FC9D6", "#3FA0D4", "#3D7CD0", "#4E5CC8", "#6B47BE", "#8A3DA0"];
  function lerpHex(a, b, t) {
    function h(x) { x = x.replace("#", ""); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
    var c1 = h(a), c2 = h(b), m = function (i) { return Math.round(c1[i] + (c2[i] - c1[i]) * t); };
    return "rgb(" + m(0) + "," + m(1) + "," + m(2) + ")";
  }
  function ramp(n, stops) {
    stops = stops || SECTOR_RAMP; var out = [];
    for (var i = 0; i < n; i++) {
      var p = n <= 1 ? 0 : i / (n - 1), s = p * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(s));
      out.push(lerpHex(stops[k], stops[k + 1], s - k));
    }
    return out;
  }
  function defFmt(v) { return isNum(v) ? (U.fmtPrice ? U.fmtPrice(v) : String(v)) : "—"; }

  // ============================ AREA / LINE ============================
  function area(wrapEl, opts) {
    if (!wrapEl) return;
    opts = opts || {};
    var size = opts.size === "mini" ? "mini" : "full";
    var fmt = opts.valueFmt || defFmt;
    var title = opts.title ? '<p class="ctitle">' + esc(opts.title) + "</p>" : "";

    // normalize series → array ของเส้น (รองรับทั้งเส้นเดียวและหลายเส้น)
    var raw = opts.series || [];
    var lines = (raw.length && Array.isArray(raw[0])) ? raw : [raw];
    lines = lines.filter(function (l) { return Array.isArray(l) && l.length >= 2; });
    if (!lines.length) {
      wrapEl.innerHTML = title + '<p class="cx-empty">' + esc(opts.empty || "ยังไม่มีข้อมูลซีรีส์") + "</p>";
      return;
    }
    var multi = lines.length > 1;
    var n = Math.max.apply(null, lines.map(function (l) { return l.length; }));
    var dates = Array.isArray(opts.dates) && opts.dates.length >= n ? opts.dates.slice(-n) : null;
    var colors = opts.colors || (multi ? ramp(lines.length) : [opts.color || "var(--accent)"]);

    // ขอบเขตค่า (รวมทุกเส้น)
    var all = []; lines.forEach(function (l) { all = all.concat(l); });
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (isNum(opts.baseline)) { min = Math.min(min, opts.baseline); max = Math.max(max, opts.baseline); } // underwater (drawdown): รวมเส้นฐานในช่วงค่า

    var uid = "swc" + (++_uid);
    if (size === "mini") return _areaMini(wrapEl, lines, colors, dates, fmt, min, max, n, title, opts);
    return _areaFull(wrapEl, lines, colors, dates, fmt, min, max, n, multi, title, uid, opts);
  }

  function _scaleX(W, x0, x1, n) { return function (i) { return x0 + (x1 - x0) * (i / (n - 1)); }; }
  function _scaleY(y0, y1, min, max) { return function (v) { return max === min ? (y0 + y1) / 2 : y1 - (y1 - y0) * (v - min) / (max - min); }; }
  function _path(line, sx, sy) {
    return "M" + line.map(function (v, i) { return sx(i).toFixed(1) + "," + sy(v).toFixed(1); }).join(" L");
  }

  function _areaFull(wrapEl, lines, colors, dates, fmt, min, max, n, multi, title, uid, opts) {
    var W = 320, H = 132, x0 = 4, x1 = W - 44, y0 = 14, y1 = H - 22;
    var sx = _scaleX(W, x0, x1, n), sy = _scaleY(y0, y1, min, max);
    var mid = (max + min) / 2, ymid = ((y0 + y1) / 2).toFixed(1);
    var aria = opts.ariaLabel || ("กราฟเส้น ต่ำสุด " + fmt(min) + " สูงสุด " + fmt(max));

    var defs = "", fills = "";
    if (!multi) {                                   // เส้นเดียว → เติม gradient ใต้เส้น
      var fillId = uid + "-fill", shId = uid + "-sh";
      defs = '<defs><linearGradient id="' + fillId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" style="stop-color:' + colors[0] + ';stop-opacity:0.30"/>' +
        '<stop offset="100%" style="stop-color:' + colors[0] + ';stop-opacity:0.02"/></linearGradient>' +
        '<filter id="' + shId + '" x="-5%" y="-15%" width="110%" height="135%">' +
        '<feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#000" flood-opacity="0.18"/></filter></defs>';
      var baseY = isNum(opts.baseline) ? sy(opts.baseline) : y1;   // ปิด polygon ที่เส้นฐาน (drawdown=0) แทนก้นกราฟ
      var areaD = "M" + sx(0).toFixed(1) + "," + baseY + " L" +
        lines[0].map(function (v, i) { return sx(i).toFixed(1) + "," + sy(v).toFixed(1); }).join(" L") +
        " L" + sx(lines[0].length - 1).toFixed(1) + "," + baseY + " Z";
      fills = '<path d="' + areaD + '" fill="url(#' + fillId + ')"/>' +
        (isNum(opts.baseline) ? '<line class="cx-base" x1="' + x0 + '" y1="' + baseY + '" x2="' + x1 + '" y2="' + baseY + '"/>' : "");
    }
    var paths = lines.map(function (l, li) {
      var filt = (!multi) ? ' filter="url(#' + uid + '-sh)"' : "";
      return '<path class="cx-line" style="stroke:' + colors[li % colors.length] + '" d="' + _path(l, sx, sy) + '"' + filt + "/>";
    }).join("");
    var lastDot = lines.length === 1
      ? '<circle class="cx-dot" style="fill:' + colors[0] + '" cx="' + sx(lines[0].length - 1).toFixed(1) + '" cy="' + sy(lines[0][lines[0].length - 1]).toFixed(1) + '" r="3.5"/>' : "";

    // ป้ายแกน X (เริ่ม/กลาง/ท้าย) เมื่อมีปฏิทินจริง
    var xlabels = "";
    if (dates) {
      var di = Math.floor((n - 1) / 2);
      xlabels =
        '<text x="' + x0 + '" y="124" text-anchor="start" class="cx-axl">' + esc(thDate(dates[0], false)) + "</text>" +
        '<text x="' + ((x0 + x1) / 2).toFixed(0) + '" y="124" text-anchor="middle" class="cx-axl">' + esc(thDate(dates[di], false)) + "</text>" +
        '<text x="' + x1 + '" y="124" text-anchor="end" class="cx-axl">' + esc(thDate(dates[n - 1], false)) + "</text>";
    }
    // crosshair (ค่าทุกเส้น ณ x) + จุด hot ต่อเส้น
    var hots = lines.map(function (l, li) {
      return '<circle class="cx-hot" data-li="' + li + '" style="fill:' + colors[li % colors.length] + ';display:none" r="3.5"/>';
    }).join("");
    // legend (เฉพาะหลายเส้น + มี labels)
    var legend = "";
    if (multi && opts.labels) {
      legend = '<div class="legend">' + lines.map(function (l, li) {
        return '<span class="lg-item"><i style="background:' + colors[li % colors.length] + '"></i>' + esc(opts.labels[li] || ("เส้น " + (li + 1))) + "</span>";
      }).join("") + "</div>";
    }
    var note = opts.note != null ? opts.note
      : (lines.length === 1 ? "ต่ำสุด " + fmt(min) + " · สูงสุด " + fmt(max) + " · ล่าสุด " + fmt(lines[0][lines[0].length - 1]) : "");

    wrapEl.innerHTML = title +
      '<div class="cx-host">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(aria) + '">' + defs +
          '<g class="cx-grid"><line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '"/>' +
          '<line x1="' + x0 + '" y1="' + ymid + '" x2="' + x1 + '" y2="' + ymid + '"/>' +
          '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '"/></g>' +
          '<text x="' + W + '" y="' + (y0 + 3) + '" text-anchor="end" class="cx-axl">' + fmt(max) + "</text>" +
          '<text x="' + W + '" y="' + (Number(ymid) + 3).toFixed(1) + '" text-anchor="end" class="cx-axl">' + fmt(mid) + "</text>" +
          '<text x="' + W + '" y="' + (y1 + 3) + '" text-anchor="end" class="cx-axl">' + fmt(min) + "</text>" +
          xlabels + fills + paths + lastDot +
          '<line class="cx-cross" x1="0" y1="' + y0 + '" x2="0" y2="' + y1 + '" style="display:none"/>' + hots +
        "</svg>" +
        '<div class="cx-tip" hidden></div>' +
      "</div>" + legend +
      (note ? '<p class="cx-note">' + esc(note) + "</p>" : "");

    if (opts.crosshair === false) return;
    var svg = wrapEl.querySelector("svg"), cross = wrapEl.querySelector(".cx-cross"),
        tip = wrapEl.querySelector(".cx-tip"), hotEls = wrapEl.querySelectorAll(".cx-hot"),
        host = svg.parentNode;
    function idxAt(clientX) {
      var r = svg.getBoundingClientRect();
      var px = (clientX - r.left) / r.width * W;
      return Math.max(0, Math.min(n - 1, Math.round((px - x0) / (x1 - x0) * (n - 1))));
    }
    function show(clientX) {
      var i = idxAt(clientX), X = sx(i);
      cross.setAttribute("x1", X); cross.setAttribute("x2", X); cross.style.display = "";
      var parts = [];
      Array.prototype.forEach.call(hotEls, function (h) {
        var li = +h.getAttribute("data-li"), v = lines[li][i];
        if (!isNum(v)) { h.style.display = "none"; return; }
        h.setAttribute("cx", X); h.setAttribute("cy", sy(v)); h.style.display = "";
        parts.push((opts.labels && multi ? esc(opts.labels[li] || "") + " " : "") + fmt(v));
      });
      tip.hidden = false;
      tip.textContent = parts.join(" · ") + (dates ? " · " + thDate(dates[i], true) : "");
      var r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var rawL = (X / W) * r.width + (r.left - hr.left), halfW = tip.offsetWidth / 2;
      tip.style.left = Math.max(halfW, Math.min(hr.width - halfW, rawL)) + "px";   // clamp ไม่ให้ tip ล้นขอบการ์ด
    }
    function hide() { cross.style.display = "none"; Array.prototype.forEach.call(hotEls, function (h) { h.style.display = "none"; }); tip.hidden = true; }
    svg.addEventListener("pointermove", function (e) { show(e.clientX); });
    svg.addEventListener("pointerleave", hide);
  }

  function _areaMini(wrapEl, lines, colors, dates, fmt, min, max, n, title, opts) {
    var W = 300, H = 54;
    var sx = function (i) { return W * (i / (n - 1)); };
    var sy = function (v) { return max === min ? H / 2 : (H - 4) - (H - 8) * (v - min) / (max - min); };
    var aria = opts.ariaLabel || "กราฟราคา";
    var paths = lines.map(function (l, li) {
      var c = colors[li % colors.length];
      return '<path d="' + _path(l, sx, sy) + '" fill="none" style="stroke:' + c + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + sx(l.length - 1).toFixed(1) + '" cy="' + sy(l[l.length - 1]).toFixed(1) + '" r="3.2" style="fill:' + c + '"/>';
    }).join("");
    wrapEl.innerHTML = title +
      '<div class="cx-host cx-mini">' +
        '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(aria) + '">' +
          paths + '<line class="cx-cross" x1="0" y1="0" x2="0" y2="' + H + '" style="display:none"/></svg>' +
        '<div class="cx-tip" hidden></div>' +
      "</div>";
    if (opts.crosshair === false) return;            // mini ก็ interactive (ตาม quality contract) เว้นปิดชัด
    var svg = wrapEl.querySelector("svg"), cross = wrapEl.querySelector(".cx-cross"),
        tip = wrapEl.querySelector(".cx-tip"), host = svg.parentNode, L0 = lines[0];
    function idxAt(clientX) { var r = svg.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round((clientX - r.left) / r.width * (n - 1)))); }
    svg.addEventListener("pointermove", function (e) {
      var i = idxAt(e.clientX), X = sx(i);
      cross.setAttribute("x1", X); cross.setAttribute("x2", X); cross.style.display = "";
      tip.hidden = false;
      tip.textContent = fmt(L0[i]) + (dates ? " · " + thDate(dates[i], true) : "");
      var r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var rawL = (X / W) * r.width + (r.left - hr.left), halfW = tip.offsetWidth / 2;
      tip.style.left = Math.max(halfW, Math.min(hr.width - halfW, rawL)) + "px";   // clamp ไม่ให้ tip ล้นขอบการ์ด
    });
    svg.addEventListener("pointerleave", function () { cross.style.display = "none"; tip.hidden = true; });
  }

  // ============================ DONUT ============================
  function donut(wrapEl, opts) {
    if (!wrapEl) return;
    opts = opts || {};
    var size = opts.size === "mini" ? "mini" : "full";
    var title = opts.title ? '<p class="ctitle">' + esc(opts.title) + "</p>" : "";
    var groups = (opts.groups || []).filter(function (g) { return g && isNum(g.value) && g.value > 0; });
    if (!groups.length) {
      wrapEl.innerHTML = title + '<p class="cx-empty">' + esc(opts.empty || "ไม่มีข้อมูล") + "</p>";
      return;
    }
    var sum = groups.reduce(function (a, g) { return a + g.value; }, 0);
    groups.forEach(function (g) { if (!isNum(g.pct)) g.pct = sum ? g.value / sum * 100 : 0; });
    var cols = ramp(groups.length);
    groups.forEach(function (g, i) { if (!g.color) g.color = cols[i]; });
    return size === "mini" ? _donutMini(wrapEl, groups, sum, title, opts) : _donutFull(wrapEl, groups, sum, title, opts);
  }

  function _donutFull(wrapEl, groups, sum, title, opts) {
    var r = 46, C = 2 * Math.PI * r, off = 0;
    var _term = document.documentElement.getAttribute("data-skin") === "terminal";
    var segs;
    if (_term) {
      // terminal: แต่ละหมวด = arc "ขอบล้วน" (กลวง · fill:none) แทนแท่งสีทึบ
      // วาด angle มาตรฐาน (0°=3 นาฬิกา · ตามเข็ม) แล้ว SVG rotate(-90°) ย้ายจุดเริ่มไปบนสุด (เหมือนเทคนิควงกลมเดิม)
      var ap = function (R, dgr) { var a = dgr * Math.PI / 180; return (66 + R * Math.cos(a)).toFixed(2) + "," + (66 + R * Math.sin(a)).toFixed(2); };
      var RO = 52, RI = 40, dg = 0;
      segs = groups.map(function (g, gi) {
        var dd = g.pct / 100 * 360, gap = Math.min(1.4, dd * 0.35), d0 = dg + gap / 2, d1 = dg + dd - gap / 2;   // clamp gap ≤ ขนาดหมวด (กัน arc ย้อน/degenerate กรณีหมวดจิ๋ว หรือหมวดเดียว 100%)
        var lg = (d1 - d0) > 180 ? 1 : 0;
        var d = "M" + ap(RO, d0) + "A" + RO + "," + RO + " 0 " + lg + " 1 " + ap(RO, d1) +
                "L" + ap(RI, d1) + "A" + RI + "," + RI + " 0 " + lg + " 0 " + ap(RI, d0) + "Z";
        dg += dd;
        return '<path class="seg" data-gi="' + gi + '" d="' + d + '" fill="none" stroke="' + g.color + '"></path>';
      }).join("");
    } else {
      segs = groups.map(function (g, gi) {
        var len = g.pct / 100 * C;
        var s = '<circle class="seg" data-gi="' + gi + '" cx="66" cy="66" r="' + r + '" stroke="' + g.color +
          '" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"></circle>';
        off += len; return s;
      }).join("");
    }
    var hrefOf = typeof opts.clickable === "function" ? opts.clickable : (opts.clickable ? function (g) { return g.href; } : null);
    // _term ประกาศไว้ด้านบนแล้ว — ใช้ทั้งเลือกโหมด seg + ป้าย legend กรอบกลวง + ปิด track
    var legend = opts.legend === false ? "" : '<div class="legend">' + groups.map(function (g, gi) {
      var _sw = _term ? "border:1.6px solid " + g.color + ";background:transparent" : "background:" + g.color;
      var inner = '<i style="' + _sw + '"></i>' + esc(g.label) + " <b>" + (g.count != null ? g.count : g.value) + "</b> " +
        '<span class="lg-pct">' + Math.round(g.pct) + "%</span>";
      var href = hrefOf && hrefOf(g);
      return href ? '<a class="lg-item" data-gi="' + gi + '" href="' + esc(href) + '">' + inner + "</a>"
                  : '<span class="lg-item" data-gi="' + gi + '">' + inner + "</span>";
    }).join("") + "</div>";
    var center = opts.center || { value: sum, label: "" };
    var aria = opts.ariaLabel || "สัดส่วนแยกตามกลุ่ม";
    wrapEl.innerHTML = title +
      '<div class="donut-host">' +
      '<div class="donut-wrap"><svg viewBox="0 0 132 132" style="width:132px;height:132px;transform:rotate(-90deg)" role="img" aria-label="' + esc(aria) + '">' +
        (_term ? "" : '<circle cx="66" cy="66" r="46" fill="none" style="stroke:var(--border-soft)" stroke-width="16" pointer-events="none"/>') + segs +
      '</svg><div class="donut-mid"><span style="font-size:1.3rem;font-weight:600">' + esc(String(center.value)) + "</span>" +
      (center.label ? '<span style="font-size:.7rem;color:var(--text-faint)">' + esc(center.label) + "</span>" : "") + "</div></div>" +
      legend +
      (opts.note ? '<p class="sector-miss">' + esc(opts.note) + "</p>" : "") +
      '<div class="sector-tip" hidden></div></div>';
    // tooltip (hover seg/legend → label + count + pct + tickers)
    // anchor = .donut-host (ซ้อน 1 ชั้น กันกฎ glass .ccard>*{position:relative} ทับ tip)
    var tip = wrapEl.querySelector(".sector-tip"); if (!tip) return;
    var card = wrapEl.querySelector(".donut-host") || wrapEl;
    function show(gi, clientX, clientY) {
      var g = groups[gi]; if (!g) return;
      var extra = "";
      if (g.tickers && g.tickers.length) {
        var list = g.tickers.slice(0, 12).join(" ") + (g.tickers.length > 12 ? " +" + (g.tickers.length - 12) : "");
        extra = '<span class="st-list">' + esc(list) + "</span>";
      }
      tip.innerHTML = "<b>" + esc(g.label) + "</b> · " + (g.count != null ? g.count : g.value) + " (" + Math.round(g.pct) + "%)" + extra;
      tip.hidden = false;
      var cr = card.getBoundingClientRect(), hw = tip.offsetWidth / 2, th = tip.offsetHeight;
      tip.style.left = Math.max(hw, Math.min(cr.width - hw, clientX - cr.left)) + "px";   // clamp แนวนอน
      tip.style.top = Math.max(th + 4, clientY - cr.top - 12) + "px";                     // กันล้นขอบบน (tip อยู่เหนือ cursor)
    }
    function hide() { tip.hidden = true; }
    Array.prototype.forEach.call(card.querySelectorAll(".seg, .lg-item"), function (el) {
      var gi = +el.getAttribute("data-gi");
      el.addEventListener("pointerenter", function (e) { show(gi, e.clientX, e.clientY); });
      el.addEventListener("pointermove", function (e) { show(gi, e.clientX, e.clientY); });
      el.addEventListener("pointerleave", hide);
    });
  }

  function _donutMini(wrapEl, groups, sum, title, opts) {
    var r = 34, C = 2 * Math.PI * r, off = 0;
    var _term = document.documentElement.getAttribute("data-skin") === "terminal";
    var segs;
    if (_term) {
      // terminal: แต่ละหมวด = arc "ขอบล้วน" (กลวง · fill:none) เหมือน _donutFull (ย่อสเกล viewBox 96 · center 48)
      var ap = function (R, dgr) { var a = dgr * Math.PI / 180; return (48 + R * Math.cos(a)).toFixed(2) + "," + (48 + R * Math.sin(a)).toFixed(2); };
      var RO = 40, RI = 28, dg = 0;
      segs = groups.map(function (g) {
        var dd = g.pct / 100 * 360, gap = Math.min(1.4, dd * 0.35), d0 = dg + gap / 2, d1 = dg + dd - gap / 2;   // clamp gap ≤ ขนาดหมวด (กัน arc ย้อน/degenerate)
        var lg = (d1 - d0) > 180 ? 1 : 0;
        var d = "M" + ap(RO, d0) + "A" + RO + "," + RO + " 0 " + lg + " 1 " + ap(RO, d1) +
                "L" + ap(RI, d1) + "A" + RI + "," + RI + " 0 " + lg + " 0 " + ap(RI, d0) + "Z";
        dg += dd;
        return '<path d="' + d + '" fill="none" stroke="' + g.color + '" stroke-width="1.6"></path>';
      }).join("");
    } else {
      segs = groups.map(function (g) {
        var len = g.pct / 100 * C;
        var s = '<circle cx="48" cy="48" r="' + r + '" fill="none" stroke="' + g.color + '" stroke-width="12" stroke-dasharray="' +
          len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"></circle>';
        off += len; return s;
      }).join("");
    }
    var top = groups.slice(0, 3).map(function (g) { return esc(g.label) + " <b>" + Math.round(g.pct) + "%</b>"; }).join(" · ");
    var aria = opts.ariaLabel || "สัดส่วนแยกตามกลุ่ม";
    wrapEl.innerHTML = title +
      '<div class="donut-row">' +
        '<svg viewBox="0 0 96 96" style="width:84px;height:84px;transform:rotate(-90deg);flex:none" role="img" aria-label="' + esc(aria) + '">' +
          (_term ? "" : '<circle cx="48" cy="48" r="' + r + '" fill="none" style="stroke:var(--border-soft)" stroke-width="12"/>') + segs + "</svg>" +
        '<div class="legmini"><div><b>' + (opts.center ? esc(String(opts.center.value)) : sum) + "</b> " + esc(opts.unit || "รายการ") +
          '</div><div style="opacity:.85">' + top + "</div></div>" +
      "</div>";
  }

  // ============================ HORIZONTAL RANKED BARS ============================
  // แทน donut สำหรับ "สัดส่วนแยกกลุ่ม" (sector breakdown) — ในธีม terminal อ่าน + ติดป้าย
  // ง่ายกว่าวงกลม (จัดอันดับมาก→น้อย · แท่งเทียบหมวดสูงสุด · ป้าย % = ค่าจริง) · #8
  function hbars(wrapEl, opts) {
    if (!wrapEl) return;
    opts = opts || {};
    var title = opts.title ? '<p class="ctitle">' + esc(opts.title) + "</p>" : "";
    var groups = (opts.groups || []).filter(function (g) { return g && isNum(g.value) && g.value > 0; });
    if (!groups.length) {
      wrapEl.innerHTML = title + '<p class="cx-empty">' + esc(opts.empty || "ไม่มีข้อมูล") + "</p>";
      return;
    }
    var sum = groups.reduce(function (a, g) { return a + g.value; }, 0);
    groups.forEach(function (g) { if (!isNum(g.pct)) g.pct = sum ? g.value / sum * 100 : 0; });
    groups = groups.slice().sort(function (a, b) { return b.value - a.value; });   // จัดอันดับมาก→น้อย
    var cols = ramp(groups.length);
    groups.forEach(function (g, i) { if (!g.color) g.color = cols[i]; });
    var maxPct = Math.max.apply(null, groups.map(function (g) { return g.pct; })) || 1;
    var hrefOf = typeof opts.clickable === "function" ? opts.clickable : (opts.clickable ? function (g) { return g.href; } : null);
    var center = opts.center;
    var head = center ? '<div class="hb-head"><b>' + esc(String(center.value)) + "</b> " + esc(opts.unit || center.label || "") + "</div>" : "";
    var rows = groups.map(function (g, gi) {
      var w = (g.pct / maxPct * 100).toFixed(1);     // แท่งเทียบหมวดสูงสุด = ลุคจัดอันดับ · % = ค่าจริง
      var inner = '<span class="hb-lab">' + esc(g.label) + "</span>" +
        '<span class="hb-track"><i style="width:' + w + '%;background:' + g.color + '"></i></span>' +
        '<span class="hb-val">' + (g.count != null ? g.count : g.value) + ' <span class="hb-pct">' + Math.round(g.pct) + "%</span></span>";
      var href = hrefOf && hrefOf(g);
      return href ? '<a class="hb-row" data-gi="' + gi + '" href="' + esc(href) + '">' + inner + "</a>"
                  : '<div class="hb-row" data-gi="' + gi + '">' + inner + "</div>";
    }).join("");
    var aria = opts.ariaLabel || "สัดส่วนแยกตามกลุ่ม (แท่งจัดอันดับ)";
    wrapEl.innerHTML = title +
      '<div class="hb-host' + (opts.compact ? " hb-compact" : "") + '" role="img" aria-label="' + esc(aria) + '">' + head +
        '<div class="hb-list">' + rows + "</div>" +
        (opts.note ? '<p class="sector-miss">' + esc(opts.note) + "</p>" : "") +
        '<div class="sector-tip" hidden></div></div>';
    // tooltip รายชื่อ ticker (ถ้ามี) — reuse .sector-tip เดียวกับ donut
    var tip = wrapEl.querySelector(".sector-tip"); if (!tip) return;
    var card = wrapEl.querySelector(".hb-host");
    if (!groups.some(function (g) { return g.tickers && g.tickers.length; })) return;
    function show(gi, clientX, clientY) {
      var g = groups[gi]; if (!g || !(g.tickers && g.tickers.length)) { tip.hidden = true; return; }
      var list = g.tickers.slice(0, 12).join(" ") + (g.tickers.length > 12 ? " +" + (g.tickers.length - 12) : "");
      tip.innerHTML = "<b>" + esc(g.label) + "</b> · " + (g.count != null ? g.count : g.value) +
        " (" + Math.round(g.pct) + "%)<span class=\"st-list\">" + esc(list) + "</span>";
      tip.hidden = false;
      var cr = card.getBoundingClientRect(), hw = tip.offsetWidth / 2, th = tip.offsetHeight;
      tip.style.left = Math.max(hw, Math.min(cr.width - hw, clientX - cr.left)) + "px";
      tip.style.top = Math.max(th + 4, clientY - cr.top - 12) + "px";
    }
    Array.prototype.forEach.call(card.querySelectorAll(".hb-row"), function (el) {
      var gi = +el.getAttribute("data-gi");
      el.addEventListener("pointerenter", function (e) { show(gi, e.clientX, e.clientY); });
      el.addEventListener("pointermove", function (e) { show(gi, e.clientX, e.clientY); });
      el.addEventListener("pointerleave", function () { tip.hidden = true; });
    });
  }

  // ============================ HISTOGRAM (การกระจาย เช่น R-multiple) ============================
  function histogram(wrapEl, opts) {
    if (!wrapEl) return;
    opts = opts || {};
    var fmt = opts.valueFmt || function (v) { return isNum(v) ? Math.round(v * 100) / 100 : "—"; };
    var title = opts.title ? '<p class="ctitle">' + esc(opts.title) + "</p>" : "";
    var vals = (opts.values || []).filter(isNum);
    if (!vals.length) {
      wrapEl.innerHTML = title + '<p class="cx-empty">' + esc(opts.empty || "ยังไม่มีข้อมูล") + "</p>";
      return;
    }
    var zero = opts.zeroLine !== false;                // R: บังคับให้ 0 อยู่ในช่วง (แยกได้/เสีย)
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (max === min) max = min + 1;
    var nb = opts.bins || Math.min(14, Math.max(6, Math.ceil(Math.sqrt(vals.length))));
    var bw = (max - min) / nb, bins = [];
    for (var b = 0; b < nb; b++) bins.push(0);
    vals.forEach(function (v) { var k = Math.floor((v - min) / bw); if (k >= nb) k = nb - 1; if (k < 0) k = 0; bins[k]++; });
    var maxC = Math.max.apply(null, bins) || 1;
    var W = 320, H = 132, x0 = 4, x1 = W - 24, y0 = 12, y1 = H - 22;
    var bx = function (i) { return x0 + (x1 - x0) * (i / nb); };
    var by = function (c) { return y1 - (y1 - y0) * (c / maxC); };
    var posCol = opts.color || "var(--up)", negCol = opts.negColor || "var(--down)", gap = 1.5;
    var bars = bins.map(function (c, i) {
      var lo = min + i * bw, x = bx(i) + gap, w = Math.max(1, bx(i + 1) - bx(i) - gap * 2), y = by(c);
      var fill = zero ? ((lo + bw / 2) < 0 ? negCol : posCol) : posCol;
      return '<rect class="hist-bar" data-i="' + i + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + w.toFixed(1) + '" height="' + Math.max(0, y1 - y).toFixed(1) + '" style="fill:' + fill + '"/>';
    }).join("");
    var zeroEl = "";
    if (zero && min < 0 && max > 0) {
      var zx = (x0 + (x1 - x0) * ((0 - min) / (max - min))).toFixed(1);
      zeroEl = '<line class="cx-base" x1="' + zx + '" y1="' + y0 + '" x2="' + zx + '" y2="' + y1 + '"/>';
    }
    var aria = opts.ariaLabel || ("ฮิสโทแกรมการกระจาย " + vals.length + " ค่า");
    wrapEl.innerHTML = title +
      '<div class="hist-host">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(aria) + '">' +
          '<text x="' + W + '" y="' + (y0 + 3) + '" text-anchor="end" class="cx-axl">' + maxC + "</text>" +
          '<line class="cx-grid-base" x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '"/>' +
          bars + zeroEl +
          '<text x="' + x0 + '" y="124" text-anchor="start" class="cx-axl">' + esc(String(fmt(min))) + "</text>" +
          '<text x="' + ((x0 + x1) / 2).toFixed(0) + '" y="124" text-anchor="middle" class="cx-axl">' + esc(String(fmt((min + max) / 2))) + "</text>" +
          '<text x="' + x1 + '" y="124" text-anchor="end" class="cx-axl">' + esc(String(fmt(max))) + "</text>" +
        "</svg>" +
        '<div class="cx-tip" hidden></div>' +
      "</div>" +
      (opts.note ? '<p class="cx-note">' + esc(opts.note) + "</p>" : "");
    var svg = wrapEl.querySelector("svg"), tip = wrapEl.querySelector(".cx-tip"),
        host = svg.parentNode, barEls = wrapEl.querySelectorAll(".hist-bar"), unit = opts.unit || "ไม้";
    function show(i) {
      var lo = min + i * bw, hi = lo + bw;
      tip.hidden = false;
      tip.innerHTML = "<b>" + esc(String(fmt(lo)) + " ถึง " + String(fmt(hi))) + "</b> · " + bins[i] + " " + esc(unit);
      var r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect(), mx = (bx(i) + bx(i + 1)) / 2;
      tip.style.left = ((mx / W) * r.width + (r.left - hr.left)) + "px";
    }
    Array.prototype.forEach.call(barEls, function (el) {
      var i = +el.getAttribute("data-i");
      el.addEventListener("pointerenter", function () { show(i); });
      el.addEventListener("pointermove", function () { show(i); });
      el.addEventListener("pointerleave", function () { tip.hidden = true; });
    });
  }

  // ============================ render (type-driven · organic-ready) ============================
  function render(wrapEl, spec) {
    spec = spec || {};
    if (spec.type === "donut") return donut(wrapEl, spec);
    if (spec.type === "hbars") return hbars(wrapEl, spec);
    if (spec.type === "histogram") return histogram(wrapEl, spec);
    return area(wrapEl, spec);                        // default = area
  }

  window.SWChart = { render: render, area: area, donut: donut, hbars: hbars, histogram: histogram, thDate: thDate, ramp: ramp, SECTOR_RAMP: SECTOR_RAMP };
})();
