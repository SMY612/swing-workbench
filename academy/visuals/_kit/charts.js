/* ============================================================================
   charts.js — MyInvest Visual Kit · SVG BUILDERS (stateless view layer)
   ----------------------------------------------------------------------------
   Every builder returns an SVG-fragment STRING. No state, no events — pages
   drop the string into an <svg> and wire interactivity themselves. Light theme.
   Exposes window.CHARTS.
   ============================================================================ */
(function () {
  // palette — อ่านจาก CSS tokens (theme-boot ตั้งธีมก่อน first paint → ค่าตรงตามธีมตั้งแต่โหลด)
  // โครงสร้าง (เส้นกริด) ใช้ class .chgrid ใน theme.css → สลับธีมกลางหน้าได้โดยไม่ต้อง re-render
  var _root = getComputedStyle(document.documentElement);
  function cv(name, fb) { var v = _root.getPropertyValue(name); return (v && v.trim()) ? v.trim() : fb; }
  const C = {
    up: cv('--up', '#34c759'), down: cv('--down', '#ff3b30'), adx: cv('--accent', '#0071e3'), cross: cv('--purple', '#af52de'),
    grid: cv('--border-soft', '#d2d2d7'), axis: cv('--text-faint', '#86868b'), ink: cv('--text', '#1d1d1f'), mute: cv('--text-muted', '#86868b'), warn: cv('--orange', '#ff9f0a')
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // makeScale: map data index -> x px, value -> y px, inside a padded plot box.
  function makeScale(o) {
    const { x, y, w, h, yMin, yMax, n } = o;
    return {
      x, y, w, h, n, yMin, yMax,
      step: n > 1 ? w / (n - 1) : 0,
      sx: i => x + (n > 1 ? i * (w / (n - 1)) : w / 2),
      sy: v => y + h - ((v - yMin) / (yMax - yMin)) * h
    };
  }

  // axis: baseline + horizontal gridlines (yTicks) + x labels.
  function axis(o) {
    const s = o.scale, parts = [];
    (o.yTicks || []).forEach(t => {
      const yy = s.sy(t.v);
      parts.push(`<line x1="${s.x}" y1="${yy.toFixed(1)}" x2="${s.x + s.w}" y2="${yy.toFixed(1)}" class="chgrid${t.strong ? ' s' : ''}" stroke-width="1" ${t.dash ? 'stroke-dasharray="4"' : ''}/>`);
      parts.push(`<text x="${s.x - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="vlbl">${esc(t.label)}</text>`);
    });
    (o.xLabels || []).forEach(t => {
      parts.push(`<text x="${s.sx(t.i).toFixed(1)}" y="${(s.y + s.h + 18).toFixed(1)}" text-anchor="middle" class="vlbl" ${t.color ? `fill="${t.color}"` : ''}>${esc(t.label)}</text>`);
    });
    return parts.join('');
  }

  // line: one polyline from an array of values (nulls break the line).
  function line(values, o) {
    const s = o.scale, color = o.color || C.ink;
    const pts = values.map((v, i) => v == null ? null : `${s.sx(i).toFixed(1)},${s.sy(v).toFixed(1)}`).filter(Boolean).join(' ');
    let out = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${o.width || 2.5}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.opacity ? `opacity="${o.opacity}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (o.dots) values.forEach((v, i) => { if (v != null) out += `<circle cx="${s.sx(i).toFixed(1)}" cy="${s.sy(v).toFixed(1)}" r="${o.dotR || 2.5}" fill="${color}"/>`; });
    return out;
  }

  // multiLine: [{values, color, dash, width, opacity, dots}] on one scale.
  function multiLine(series, o) {
    return series.map(sr => line(sr.values, Object.assign({ scale: o.scale }, sr))).join('');
  }

  // candle: wick + body. Needs a price->y mapper (sy) and a center x (cx).
  function candle(bar, o) {
    const sy = o.sy, cx = o.cx, w = o.w || 22;
    const upC = o.up || C.up, dnC = o.down || C.down;
    const isUp = bar.c >= bar.o, col = isUp ? upC : dnC;
    const top = sy(Math.max(bar.o, bar.c)), bot = sy(Math.min(bar.o, bar.c));
    const bh = Math.max(2, bot - top);
    return `<line x1="${cx}" y1="${sy(bar.h).toFixed(1)}" x2="${cx}" y2="${sy(bar.l).toFixed(1)}" stroke="${col}" stroke-width="1.6"/>`
      + `<rect x="${(cx - w / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" rx="2" fill="${col}"/>`;
  }

  // crossMarker: vertical guide spanning the plot + ring at (x, yCircle).
  function crossMarker(o) {
    const s = o.scale, x = o.x.toFixed(1), col = o.color || C.cross;
    let out = `<line x1="${x}" y1="${s.y}" x2="${x}" y2="${s.y + s.h}" stroke="${col}" stroke-width="1.3" stroke-dasharray="5"/>`;
    if (o.yCircle != null) out += `<circle cx="${x}" cy="${o.yCircle.toFixed(1)}" r="5" fill="none" stroke="${col}" stroke-width="2"/>`;
    if (o.label) out += `<text x="${(o.x + 6).toFixed(1)}" y="${(s.y + (o.labelDy || 12)).toFixed(1)}" class="vlbl" fill="${col}">${esc(o.label)}</text>`;
    return out;
  }

  // hoverGuide: movable vertical line + dots at each series value for index i.
  function hoverGuide(i, scale, pts) {
    const x = scale.sx(i).toFixed(1);
    let out = `<line x1="${x}" y1="${scale.y}" x2="${x}" y2="${scale.y + scale.h}" stroke="${C.axis}" stroke-width="1" stroke-dasharray="3" opacity="0.7"/>`;
    (pts || []).forEach(p => { if (p.v != null) out += `<circle cx="${x}" cy="${scale.sy(p.v).toFixed(1)}" r="4" fill="#fff" stroke="${p.color}" stroke-width="2.5"/>`; });
    return out;
  }

  // scrubLayer: invisible hit-rects (one per index) carrying data-i. Page wires events.
  function scrubLayer(scale) {
    const half = (scale.step || scale.w) / 2;
    let out = '';
    for (let i = 0; i < scale.n; i++) {
      const x = scale.sx(i) - half;
      out += `<rect class="scrub" data-i="${i}" x="${x.toFixed(1)}" y="${scale.y}" width="${(scale.step || scale.w).toFixed(1)}" height="${scale.h}"/>`;
    }
    return out;
  }

  // heatBar: horizontal threshold ribbon, e.g. ADX <20 / 20-25 / >25.
  function heatBar(segments, o) {
    let cx = o.x, out = '';
    const total = segments.reduce((a, s) => a + s.w, 0);
    segments.forEach(seg => {
      const w = (seg.w / total) * o.w;
      out += `<rect x="${cx.toFixed(1)}" y="${o.y}" width="${w.toFixed(1)}" height="${o.h}" rx="${seg.rx == null ? 5 : seg.rx}" fill="${seg.color}"/>`;
      if (seg.label) out += `<text x="${(cx + w / 2).toFixed(1)}" y="${(o.y + o.h / 2 + 4).toFixed(1)}" text-anchor="middle" class="vlbl" fill="${seg.text || '#fff'}">${esc(seg.label)}</text>`;
      cx += w;
    });
    return out;
  }

  // barCompare: horizontal bars; binding bar highlighted. (Position Sizing page)
  function barCompare(items, o) {
    o = o || {};
    const max = o.max || Math.max.apply(null, items.map(it => it.value)) || 1;
    const W = o.w || 520, rowH = o.rowH || 46, lblW = o.lblW || 130, x0 = lblW + 6;
    let out = '', y = 0;
    items.forEach((it, idx) => {
      const bw = Math.max(2, (it.value / max) * (W - x0 - 70));
      const bind = o.bindingIdx === idx;
      out += `<text x="${lblW}" y="${(y + rowH / 2 + 4).toFixed(1)}" text-anchor="end" class="vlbl" fill="${C.ink}">${esc(it.label)}</text>`;
      out += `<rect x="${x0}" y="${(y + 8).toFixed(1)}" width="${bw.toFixed(1)}" height="${rowH - 16}" rx="6" fill="${it.color || C.adx}" ${bind ? 'stroke="' + C.ink + '" stroke-width="2"' : 'opacity="0.85"'}/>`;
      out += `<text x="${(x0 + bw + 8).toFixed(1)}" y="${(y + rowH / 2 + 4).toFixed(1)}" class="vlbl" fill="${C.ink}">${esc(it.valueLabel != null ? it.valueLabel : it.value)}${bind ? ' ← ตัวที่บีบ' : ''}</text>`;
      y += rowH;
    });
    return { svg: out, height: y };
  }

  // legend: inline swatch rows (returns HTML, not SVG — used in a <div>).
  function legend(items) {
    return items.map(it => `<span><i style="background:${it.color}"></i>${esc(it.label)}</span>`).join('');
  }

  window.CHARTS = { C, makeScale, axis, line, multiLine, candle, crossMarker, hoverGuide, scrubLayer, heatBar, barCompare, legend };
})();
