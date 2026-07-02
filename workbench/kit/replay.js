/* workbench/kit/replay.js — เครื่องฝึกย้อนเวลา (daily-bar replay trainer)
 *
 * ผู้อ่านของ workbench/data/replay.js (generated โดย scripts/workbench_replay_data.py)
 * ตาม DATA-CONTRACT.md: UI ห้ามคำนวณกฎ setup เอง — สัญญาณทุกจุดมาจาก detect_signals
 * (canonical_v2) ฝั่ง engine แล้ว ที่นี่มีแค่ "ตัวจำลองออกไม้อย่างง่าย" เพื่อการฝึก:
 *   ① Low ≤ stop      → ออกที่ stop   (R = −1)            ← เช็กก่อนเสมอ (อนุรักษนิยม)
 *   ② High ≥ target   → ออกที่ target (R ≈ +2.5)
 *   ③ ถือเกิน meta.time_stop_days แท่ง และ R ที่ราคาปิด < meta.time_stop_min_r
 *                      → ออกที่ราคาปิด (time-stop)
 *
 * โครงไฟล์: ส่วน Core เป็น logic ล้วน (ไม่มี DOM — ทดสอบใน node ได้) / ส่วน UI ใช้ Core
 * Anti-cheat: ไม่วาดแท่ง/สัญญาณที่เลย cursor เด็ดขาด และ baseline ของระบบบันทึก
 * ย้อนหลังตอนเดินผ่านแท่งแล้วเท่านั้น (กันตัวเลขฝั่งระบบสปอยล์ว่าแท่งปัจจุบันคือสัญญาณ)
 */
(function () {
'use strict';

/* ====================================================================
 * Core — logic ล้วน ไม่แตะ DOM
 * ==================================================================== */

var DEF_TS_DAYS = 21;
var DEF_TS_MINR = 0.5;

/** ประเมินการออกไม้ที่แท่ง i (ลำดับ: stop → target → time-stop) คืน null ถ้ายังถือต่อ */
function evalExit(pos, i, ohlcv, meta) {
  var den = pos.entry - pos.stop;
  if (!(den > 0)) den = Math.max(Math.abs(pos.entry) * 1e-4, 1e-9); // กันหารศูนย์ (ไม่ควรเกิดตามข้อมูลจริง)
  if (ohlcv.l[i] <= pos.stop) {
    return { kind: 'stop', price: pos.stop, r: (pos.stop - pos.entry) / den }; // = −1 พอดี
  }
  if (ohlcv.h[i] >= pos.target) {
    return { kind: 'target', price: pos.target, r: (pos.target - pos.entry) / den };
  }
  var held = i - pos.entryIndex;
  var rClose = (ohlcv.c[i] - pos.entry) / den;
  var tsDays = (meta && typeof meta.time_stop_days === 'number') ? meta.time_stop_days : DEF_TS_DAYS;
  var tsMinR = (meta && typeof meta.time_stop_min_r === 'number') ? meta.time_stop_min_r : DEF_TS_MINR;
  if (held > tsDays && rClose < tsMinR) {
    return { kind: 'time', price: ohlcv.c[i], r: rClose };
  }
  return null;
}

/** ระดับราคาเมื่อเข้านอกกติกา: stop = ปิด − 1.5×ATR (ถ้า ATR ใช้ไม่ได้ → ปิด×0.97), เป้า = 2.5R */
function falseEntryLevels(close, atrVal) {
  var stop;
  if (typeof atrVal === 'number' && isFinite(atrVal) && atrVal > 0) {
    stop = close - 1.5 * atrVal;
  } else {
    stop = close * 0.97;
  }
  if (!(stop > 0 && stop < close)) stop = close * 0.97; // กัน ATR ผิดสเกล
  return { entry: close, stop: stop, target: close + 2.5 * (close - stop) };
}

/** สร้างสถานะรอบฝึกใหม่ */
function createSession(tk, meta, startIdx, stepCap) {
  var n = tk.ohlcv.dates.length;
  var start = Math.max(0, Math.min(startIdx | 0, n - 2));
  var cap = (stepCap == null) ? 500 : stepCap;
  var sigByDate = {};
  (tk.signals || []).forEach(function (s) { sigByDate[s.date] = s; });
  return {
    tk: tk,
    meta: meta || {},
    start: start,
    cursor: start,
    maxSteps: Math.max(1, Math.min(cap, n - 1 - start)),
    steps: 0,
    pos: null,
    closed: [],
    yourR: 0,
    stats: { passed: 0, caught: 0, missed: 0, false_entries: 0, clash: 0 },
    sys: { pos: null, r: 0, taken: 0, closed: 0, skippedClash: 0, settled: false },
    settledOpen: false,
    claimed: {},          // date → true เมื่อสัญญาณถูกนับแล้ว (จับได้/พลาด/ชน)
    sigByDate: sigByDate,
    ended: false,
    endReason: null
  };
}

/** ผู้เล่นกด "เข้าไม้" ที่แท่งปัจจุบัน (เข้าที่ราคาปิด) — คืนรายการเหตุการณ์ให้ UI */
function enter(sess) {
  var ev = [];
  if (sess.ended || sess.pos) return ev;
  var i = sess.cursor;
  var o = sess.tk.ohlcv;
  var date = o.dates[i];
  var sig = sess.sigByDate[date];
  if (sig) {
    // ตรงสัญญาณจริง → ใช้ entry/stop/target ของ engine เป๊ะ ๆ
    sess.pos = { entry: sig.entry, stop: sig.stop, target: sig.target, entryIndex: i, isSignal: true };
    sess.claimed[date] = true;
    sess.stats.caught++;
    sess.stats.passed++;
    ev.push({ type: 'entry-signal', index: i, date: date, entry: sig.entry, stop: sig.stop, target: sig.target });
  } else {
    var atrArr = sess.tk.atr || [];
    var lv = falseEntryLevels(o.c[i], atrArr[i]);
    sess.pos = { entry: lv.entry, stop: lv.stop, target: lv.target, entryIndex: i, isSignal: false };
    sess.stats.false_entries++;
    ev.push({ type: 'entry-false', index: i, date: date, entry: lv.entry, stop: lv.stop, target: lv.target });
  }
  return ev;
}

/** ปิดรอบ: เคลียร์บัญชีสัญญาณบนแท่งสุดท้าย + ปิดไม้ค้างที่ราคาปิด (mark-to-market) */
function finish(sess, reason, ev) {
  ev = ev || [];
  if (sess.ended) return ev;
  sess.ended = true;
  sess.endReason = reason;
  var o = sess.tk.ohlcv;
  var i = sess.cursor;
  var date = o.dates[i];
  var sig = sess.sigByDate[date];
  if (sig && !sess.claimed[date]) { // สัญญาณบนแท่งปิดรอบที่ไม่ได้กด → ยังต้องนับ (ระบบไม่เปิดไม้ใหม่บนแท่งปิดรอบ)
    sess.claimed[date] = true;
    if (sess.pos) { sess.stats.clash++; sess.stats.passed++; ev.push({ type: 'clash', index: i, date: date, sig: sig }); }
    else { sess.stats.missed++; sess.stats.passed++; ev.push({ type: 'missed', index: i, date: date, sig: sig }); }
  }
  if (sess.pos) {
    var den = sess.pos.entry - sess.pos.stop;
    if (!(den > 0)) den = 1e-9;
    var r = (o.c[i] - sess.pos.entry) / den;
    sess.yourR += r;
    sess.closed.push({ r: r, kind: 'settle', isSignal: sess.pos.isSignal, entryIndex: sess.pos.entryIndex, exitIndex: i });
    ev.push({ type: 'exit', index: i, kind: 'settle', r: r, price: o.c[i], isSignal: sess.pos.isSignal });
    sess.pos = null;
    sess.settledOpen = true;
  }
  if (sess.sys.pos) {
    var d2 = sess.sys.pos.entry - sess.sys.pos.stop;
    if (!(d2 > 0)) d2 = 1e-9;
    sess.sys.r += (o.c[i] - sess.sys.pos.entry) / d2;
    sess.sys.closed++;
    sess.sys.pos = null;
    sess.sys.settled = true;
  }
  ev.push({ type: 'end', reason: reason });
  return ev;
}

/** เดินไปข้างหน้า 1 แท่ง — คืนรายการเหตุการณ์ให้ UI
 *  ลำดับใน 1 ก้าว (สำคัญต่อความถูกต้อง):
 *   1) ปิดบัญชีแท่งที่กำลังทิ้งไว้ข้างหลัง (prev): สัญญาณที่ไม่ได้กด → พลาด/ชน
 *   1b) baseline ระบบ: ถ้าแท่ง prev มีสัญญาณและระบบว่าง → ระบบเข้าที่ราคาปิดแท่ง prev
 *       (บันทึก "ย้อนหลัง" ตอนเดินผ่านแล้ว — UI จึงโชว์ตัวเลขระบบได้โดยไม่สปอยล์แท่งปัจจุบัน)
 *   2) เลื่อน cursor → เห็นแท่งใหม่ i
 *   3) ประเมินไม้ผู้เล่นที่แท่ง i (stop → target → time-stop)
 *   4) ประเมินไม้ระบบที่แท่ง i แบบเดียวกัน
 *   5) เช็กเงื่อนไขจบรอบ (ครบโควต้าแท่ง / สุดข้อมูล)
 */
function stepBar(sess) {
  var ev = [];
  if (sess.ended) return ev;
  var o = sess.tk.ohlcv;
  var n = o.dates.length;
  var prev = sess.cursor;

  if (prev + 1 >= n) return finish(sess, 'data-end', ev); // กันพลาด (ตามปกติจบไปก่อนแล้วในข้อ 5)

  // 1) สัญญาณบนแท่ง prev ที่ยังไม่ถูกนับ
  var prevDate = o.dates[prev];
  var sig = sess.sigByDate[prevDate];
  if (sig && !sess.claimed[prevDate]) {
    sess.claimed[prevDate] = true;
    if (sess.pos) {
      sess.stats.clash++; sess.stats.passed++;
      ev.push({ type: 'clash', index: prev, date: prevDate, sig: sig });
    } else {
      sess.stats.missed++; sess.stats.passed++;
      ev.push({ type: 'missed', index: prev, date: prevDate, sig: sig });
    }
  }
  // 1b) baseline ระบบ (ทีละไม้เหมือนผู้เล่น)
  if (sig) {
    if (!sess.sys.pos) {
      sess.sys.pos = { entry: sig.entry, stop: sig.stop, target: sig.target, entryIndex: prev };
      sess.sys.taken++;
    } else {
      sess.sys.skippedClash++;
    }
  }

  // 2) เปิดแท่งใหม่
  sess.cursor = prev + 1;
  sess.steps++;
  var i = sess.cursor;

  // 3) ไม้ผู้เล่น
  if (sess.pos) {
    var ex = evalExit(sess.pos, i, o, sess.meta);
    if (ex) {
      sess.yourR += ex.r;
      sess.closed.push({ r: ex.r, kind: ex.kind, isSignal: sess.pos.isSignal, entryIndex: sess.pos.entryIndex, exitIndex: i });
      ev.push({ type: 'exit', index: i, kind: ex.kind, r: ex.r, price: ex.price, isSignal: sess.pos.isSignal });
      sess.pos = null;
    }
  }

  // 4) ไม้ระบบ
  if (sess.sys.pos) {
    var sx = evalExit(sess.sys.pos, i, o, sess.meta);
    if (sx) {
      sess.sys.r += sx.r;
      sess.sys.closed++;
      sess.sys.pos = null;
    }
  }

  // 5) เงื่อนไขจบรอบ
  if (sess.steps >= sess.maxSteps || i >= n - 1) {
    finish(sess, (i >= n - 1) ? 'data-end' : 'steps', ev);
  }
  return ev;
}

/** R ที่ยังไม่เกิดขึ้นจริง (unrealized) ของไม้ที่ถืออยู่ ณ ราคาปิดแท่งปัจจุบัน */
function unrealizedR(sess) {
  if (!sess.pos) return null;
  var den = sess.pos.entry - sess.pos.stop;
  if (!(den > 0)) return null;
  return (sess.tk.ohlcv.c[sess.cursor] - sess.pos.entry) / den;
}

var Core = {
  evalExit: evalExit,
  falseEntryLevels: falseEntryLevels,
  createSession: createSession,
  enter: enter,
  stepBar: stepBar,
  finish: finish,
  unrealizedR: unrealizedR
};

/* ---- ทางออกสำหรับ node (ทดสอบ logic โดยไม่มี DOM) ---- */
if (typeof window === 'undefined') {
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  return;
}
window.WB_REPLAY_CORE = Core; // เผื่อหน้าอื่น/สคริปต์ทดสอบเรียกใช้

/* ====================================================================
 * UI — DOM + canvas (เริ่มจากนี่ลงไปแตะหน้าเว็บ)
 * ==================================================================== */

var D = window.WB_REPLAY;
var $ = function (id) { return document.getElementById(id); };

/* ---------- boot guard ---------- */
if (!D || !D.tickers || !D.tickers.length || !D.meta) {
  var be = $('bootError');
  if (be) be.style.display = 'block';
  var scr = document.querySelectorAll('.screen');
  for (var bi = 0; bi < scr.length; bi++) scr[bi].classList.remove('active');
  return;
}

/* ---------- ค่าคงที่ / ธีมจาก CSS variables (แหล่งเดียวกับ stylesheet) ---------- */
var rootCss = getComputedStyle(document.documentElement);
function cssVar(name, fallback) {
  var v = rootCss.getPropertyValue(name);
  return (v && v.trim()) ? v.trim() : fallback;
}
var COL = {};
function readCOL() {
  // re-read สด — ครอบ getComputedStyle ใหม่เผื่อบางเบราว์เซอร์ snapshot ค่าเดิมไว้
  rootCss = getComputedStyle(document.documentElement);
  COL.bg     = cssVar('--bg', '#0d1117');
  COL.panel  = cssVar('--panel', '#161b22');
  COL.border = cssVar('--border', '#30363d');
  COL.text   = cssVar('--text', '#e6edf3');
  COL.muted  = cssVar('--muted', '#8b949e');
  COL.green  = cssVar('--green', '#2ea043');
  COL.red    = cssVar('--red', '#f85149');
  COL.amber  = cssVar('--amber', '#d29922');
  COL.blue   = cssVar('--blue', '#58a6ff');
}
readCOL();
var WINDOW_BARS = 130;   // จำนวนแท่งที่โชว์บนกราฟ (เลื่อนตาม cursor)
var WARMUP = 260;        // เว้นช่วงอุ่นเครื่องอินดิเคเตอร์
var STEP_CAP = 500;      // โควต้าแท่งต่อรอบ
var AUTOPLAY_MS = 400;
var HISTORY_KEY = 'wbReplayHistory';
var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* ---------- สถานะฝั่ง UI ---------- */
var UI = {
  screen: 'setup',
  selIdx: -1,
  sess: null,
  markers: [],       // {i, kind} — เติมจากเหตุการณ์เท่านั้น (ไม่พรีวาดอนาคต)
  autoplay: false,
  timer: null,
  viewBack: 0,       // ย้อนดูแท่ง: หน้าต่างกราฟถอยหลังกี่แท่งจากปัจจุบัน (0 = สด · ไม่ขยับ cursor จริง)
  confirmClear: false,
  confirmTimer: null
};

/* ---------- ตัวช่วยรูปแบบตัวเลข/วันที่ ---------- */
function fmtP(x) {
  if (typeof x !== 'number' || !isFinite(x)) return '—';
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtAxis(x) {
  if (x >= 1000) return x.toFixed(0);
  if (x >= 100) return x.toFixed(1);
  return x.toFixed(2);
}
function fmtR(x) {
  if (typeof x !== 'number' || !isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(2) + 'R';
}
function rClass(x) { return x > 0.0001 ? 'r-pos' : (x < -0.0001 ? 'r-neg' : 'r-zero'); }
function thDate(iso) { // "2019-03-12" → "12 มี.ค. 2019"
  if (!iso || iso.length < 10) return iso || '—';
  var y = iso.slice(0, 4), m = parseInt(iso.slice(5, 7), 10) - 1, d = parseInt(iso.slice(8, 10), 10);
  return d + ' ' + (TH_MONTHS[m] || '?') + ' ' + y;
}
function pad2(x) { return (x < 10 ? '0' : '') + x; }

/* ---------- toast ---------- */
function toast(kind, html, ms) {
  var box = $('toasts');
  if (!box) return;
  while (box.children.length >= 4) box.removeChild(box.firstChild);
  var el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = html;
  box.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('show'); });
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
  }, ms || 4200);
}
function clearToasts() {
  var box = $('toasts');
  if (box) box.innerHTML = '';
}

/* ---------- สลับจอ ---------- */
function showScreen(name) {
  UI.screen = name;
  ['setup', 'play', 'end'].forEach(function (s) {
    var el = $('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  });
}

/* ====================================================================
 * จอเลือกหุ้น (setup)
 * ==================================================================== */

function buildTickerGrid() {
  var grid = $('tickerGrid');
  grid.innerHTML = '';
  D.tickers.forEach(function (t, idx) {
    // นับเฉพาะสัญญาณที่เข้าถึงได้จริง (อยู่หลังช่วงอุ่นเครื่อง — จุดเริ่มเล่นต่ำสุดคือแท่ง WARMUP)
    var sigs = t.signals || [];
    var nSig = 0;
    for (var k = 0; k < sigs.length; k++) {
      if (t.ohlcv.dates.indexOf(sigs[k].date) >= WARMUP) nSig++;
    }
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'tcard';
    card.setAttribute('aria-pressed', 'false');
    card.innerHTML =
      '<div class="tkr">' + t.ticker + '</div>' +
      '<div class="sig' + (nSig === 0 ? ' zero' : '') + '">สัญญาณที่เข้าถึงได้: ' + nSig + '</div>';
    card.addEventListener('click', function () { selectTicker(idx); });
    grid.appendChild(card);
  });
}

function selectTicker(idx) {
  UI.selIdx = idx;
  var cards = document.querySelectorAll('#tickerGrid .tcard');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('selected', i === idx);
    cards[i].setAttribute('aria-pressed', i === idx ? 'true' : 'false');
  }
  var t = D.tickers[idx];
  var n = t.ohlcv.dates.length;
  $('selInfo').innerHTML =
    'เลือกแล้ว: <span class="picked">' + t.ticker + '</span> — สัญญาณในคลัง ' + (t.signals || []).length +
    ' จุด · ' + n.toLocaleString('en-US') + ' แท่ง (' + thDate(t.ohlcv.dates[0]) + ' → ' + thDate(t.ohlcv.dates[n - 1]) + ')';
  $('btnStartRandom').disabled = false;
  $('btnStartBegin').disabled = false;
}

/* ---------- ประวัติการฝึก (localStorage) ---------- */
function loadHistory() {
  try {
    var raw = localStorage.getItem(HISTORY_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveHistoryRecord(rec) {
  try {
    var arr = loadHistory();
    arr.unshift(rec);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 20)));
  } catch (e) { /* โหมด file:// บางเครื่องเขียนไม่ได้ — ข้ามเงียบ ๆ */ }
}
function renderHistory() {
  var wrap = $('historyWrap');
  var btn = $('btnClearHistory');
  var arr = loadHistory();
  if (!arr.length) {
    wrap.innerHTML = '<div class="hist-empty">ยังไม่มีประวัติ — จบรอบแรกแล้วจะโผล่ที่นี่</div>';
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  var html = '<table class="hist"><thead><tr>' +
    '<th>เมื่อ</th><th>หุ้น</th><th>จับได้/สัญญาณ</th><th>เข้านอกกติกา</th><th>R คุณ</th><th>R ระบบ</th>' +
    '</tr></thead><tbody>';
  arr.forEach(function (h) {
    var dt = new Date(h.ts);
    var when = isNaN(dt.getTime()) ? '—'
      : pad2(dt.getDate()) + '/' + pad2(dt.getMonth() + 1) + '/' + String(dt.getFullYear()).slice(2) +
        ' ' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
    var yr = Number(h.your_r) || 0;
    var sr = Number(h.system_r) || 0;
    html += '<tr><td>' + when + '</td><td>' + (h.ticker || '—') + '</td>' +
      '<td>' + (h.caught || 0) + '/' + (h.passed || 0) + '</td>' +
      '<td>' + (h.false_entries || 0) + '</td>' +
      '<td class="' + rClass(yr) + '">' + fmtR(yr) + '</td>' +
      '<td class="' + rClass(sr) + '">' + fmtR(sr) + '</td></tr>';
  });
  wrap.innerHTML = html + '</tbody></table>';
}
function clearHistoryClicked() {
  var btn = $('btnClearHistory');
  if (!UI.confirmClear) {
    UI.confirmClear = true;
    btn.textContent = 'แน่ใจนะ? กดอีกครั้งเพื่อล้าง';
    UI.confirmTimer = setTimeout(function () {
      UI.confirmClear = false;
      btn.textContent = 'ล้างประวัติ';
    }, 3000);
    return;
  }
  clearTimeout(UI.confirmTimer);
  UI.confirmClear = false;
  btn.textContent = 'ล้างประวัติ';
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ข้าม */ }
  renderHistory();
}

/* ====================================================================
 * เริ่ม / เดิน / จบรอบ
 * ==================================================================== */

function startSession(mode) {
  if (UI.selIdx < 0) return;
  var t = D.tickers[UI.selIdx];
  var n = t.ohlcv.dates.length;
  var lo = Math.min(WARMUP, Math.max(0, n - 2));
  var hi = Math.max(lo, n - WARMUP);
  var startIdx = (mode === 'random') ? lo + Math.floor(Math.random() * (hi - lo + 1)) : lo;

  UI.sess = Core.createSession(t, D.meta, startIdx, STEP_CAP);
  UI.markers = [];
  UI.viewBack = 0;
  clearToasts();
  stopAutoplay();
  showScreen('play');
  renderPlay();
  toast('info', 'เริ่มรอบฝึกที่ ' + thDate(t.ohlcv.dates[startIdx]) +
    ' — เดินด้วยปุ่ม "ถัดไป" (<b>→</b>/<b>Space</b>) เห็นสัญญาณเมื่อไหร่กด "เข้าไม้" (<b>E</b>)', 6000);
}

/* ---------- ย้อนดูแท่ง (view-rewind) — เลื่อน "หน้าต่างที่มองเห็น" กลับไปดูอดีต
   โดย cursor จริงไม่ขยับ (ไม่ใช่ undo) · อนุญาตเฉพาะตอนไม่ถือไม้/ไม่เล่นอัตโนมัติ ---------- */
function rewindView() {
  var s = UI.sess;
  if (!s || s.ended || s.pos || UI.autoplay || UI.screen !== 'play') return;
  var maxBack = s.cursor - s.start; // ย้อนได้เฉพาะแท่งที่เดินผ่านในรอบนี้
  if (UI.viewBack >= maxBack) return;
  UI.viewBack++;
  renderPlay();
}
function forwardView() {
  if (UI.viewBack <= 0) return;
  UI.viewBack--;
  renderPlay();
}

function doStep() {
  var s = UI.sess;
  if (!s || s.ended || UI.screen !== 'play') return;
  if (UI.viewBack > 0) { forwardView(); return; } // กำลังย้อนดู → เดินหน้ากลับมาปัจจุบันก่อน
  var evts = Core.stepBar(s);
  processEvents(evts);
  if (!s.ended) renderPlay();
}

function doEnter() {
  var s = UI.sess;
  if (!s || s.ended || UI.screen !== 'play') return;
  if (UI.viewBack > 0) return; // กำลังย้อนดูอดีต — เข้าไม้ได้เฉพาะที่แท่งปัจจุบัน
  if (s.pos) return; // ปุ่มถูก disable อยู่แล้ว — กันคีย์ลัดซ้ำ
  var evts = Core.enter(s);
  processEvents(evts);
  renderPlay();
}

function endSessionManually() {
  var s = UI.sess;
  if (!s || s.ended) return;
  var evts = Core.finish(s, 'manual');
  processEvents(evts);
}

/* ---------- แปลงเหตุการณ์จาก Core → toast/marker/จอจบ ---------- */
function processEvents(evts) {
  var s = UI.sess;
  evts.forEach(function (e) {
    switch (e.type) {
      case 'entry-signal':
        UI.markers.push({ i: e.index, kind: 'entry-sig' });
        toast('ok', 'ตรงสัญญาณจริงของ engine — เข้า ' + fmtP(e.entry) +
          ' / stop ' + fmtP(e.stop) + ' / เป้า ' + fmtP(e.target));
        break;
      case 'entry-false':
        UI.markers.push({ i: e.index, kind: 'entry-false' });
        toast('warn', 'แท่งนี้ไม่ใช่สัญญาณตามกติกา — จำลองให้ดูผลของการเข้ามั่ว ' +
          '(เข้า ' + fmtP(e.entry) + ' / stop ' + fmtP(e.stop) + ' / เป้า ' + fmtP(e.target) + ')');
        break;
      case 'exit':
        UI.markers.push({ i: e.index, kind: 'exit-' + e.kind });
        if (e.kind === 'stop') {
          toast('bad', 'โดนตัดขาดทุน (stop) ที่ ' + fmtP(e.price) + ' · ' + fmtR(e.r));
        } else if (e.kind === 'target') {
          toast('ok', 'ถึงเป้า (target) ที่ ' + fmtP(e.price) + ' · ' + fmtR(e.r));
        } else if (e.kind === 'time') {
          toast('warn', 'ครบเวลาถือแล้วกำไรไม่มา (time-stop) — ออกที่ราคาปิด ' +
            fmtP(e.price) + ' · ' + fmtR(e.r));
        } else { // settle ตอนจบรอบ
          toast('dim', 'จบรอบ — ปิดไม้ค้างให้ที่ราคาปิดแท่งสุดท้าย ' + fmtP(e.price) + ' · ' + fmtR(e.r));
        }
        break;
      case 'missed':
        UI.markers.push({ i: e.index, kind: 'missed' });
        toast('info', 'พลาดสัญญาณ (เฉลย: entry ' + fmtP(e.sig.entry) +
          ' / stop ' + fmtP(e.sig.stop) + ' / target ' + fmtP(e.sig.target) + ')');
        break;
      case 'clash':
        UI.markers.push({ i: e.index, kind: 'clash' });
        toast('dim', 'สัญญาณมาตอนถือไม้อยู่ — นับเป็น "ชนกับไม้ที่ถือ" (ระบบจริงก็ทีละไม้ ข้ามเหมือนกัน)');
        break;
      case 'end':
        onSessionEnd(e.reason);
        break;
    }
  });
}

/* ====================================================================
 * จอเล่น — HUD / กระดานคะแนน / กราฟ
 * ==================================================================== */

function renderPlay() {
  var s = UI.sess;
  if (!s) return;
  var o = s.tk.ohlcv;
  var rewinding = (UI.viewBack || 0) > 0;
  var viewIdx = s.cursor - (UI.viewBack || 0);
  if (viewIdx < 0) viewIdx = 0;

  // HUD (วันที่ = แท่งที่กำลังดู — ตรงกับ cursor เมื่อไม่ได้ย้อน)
  $('hudTicker').textContent = s.tk.ticker;
  $('hudDate').textContent = thDate(o.dates[viewIdx]);
  $('hudBars').textContent = 'เดินแล้ว ' + s.steps + '/' + s.maxSteps + ' แท่ง · เหลือ ' + (s.maxSteps - s.steps);

  // ชิปสถานะไม้ (ระหว่างย้อนดู → โชว์สถานะย้อน เพราะย้อนได้เฉพาะตอนไม่ถือไม้)
  var chip = $('posChip');
  if (rewinding) {
    chip.className = 'poschip';
    chip.innerHTML = 'กำลังย้อนดูแท่งวันที่ <b>' + thDate(o.dates[viewIdx]) +
      '</b> — กด <b>▸</b>/<b>→</b> เพื่อกลับมาปัจจุบัน';
  } else if (s.pos) {
    var ur = Core.unrealizedR(s);
    var urTxt = (ur == null) ? '—' : fmtR(ur);
    var urCls = (ur != null && ur >= 0) ? 'r-pos' : 'r-neg';
    chip.className = 'poschip open';
    chip.innerHTML = 'ถือไม้อยู่' + (s.pos.isSignal ? ' (ตามสัญญาณ)' : ' (นอกกติกา)') +
      ' · เข้า ' + fmtP(s.pos.entry) +
      ' · R ตอนนี้ <span class="' + urCls + '">' + urTxt + '</span>';
  } else {
    chip.className = 'poschip';
    chip.textContent = 'ว่าง — ยังไม่มีไม้ในมือ';
  }

  // ปุ่ม
  var bE = $('btnEnter');
  bE.disabled = !!s.ended || !!s.pos || rewinding; // ย้อนดูอยู่ก็เข้าไม้ไม่ได้
  bE.textContent = (s.pos && !s.ended) ? 'ถือไม้อยู่ — ระบบนี้ทีละไม้' : 'เข้าไม้ (E)';
  $('btnNext').disabled = !!s.ended;
  $('btnAuto').disabled = !!s.ended || rewinding;
  $('btnAuto').textContent = UI.autoplay ? 'หยุด' : 'เล่นอัตโนมัติ ▸▸';

  // ปุ่มย้อน: ปิดตอนจบ/ถือไม้/เล่นอัตโนมัติ/ย้อนสุดแล้ว
  var bR = $('btnRewind');
  if (bR) bR.disabled = !!s.ended || !!s.pos || UI.autoplay || (UI.viewBack >= (s.cursor - s.start));

  renderScoreboard();
  drawChart();
}

function disciplineText(st) {
  var W = st.false_entries, Y = st.caught, Z = st.missed, V = st.clash;
  if (W === 0 && Y > 0) return { cls: 'good', txt: 'วินัยดี — เข้าเฉพาะตามกติกา' };
  if (W > Y) return { cls: 'bad', txt: 'เข้ามั่วบ่อยกว่าเข้าถูก — อ่านบท setup-patterns อีกรอบ' };
  if (W === 0 && Y === 0 && Z === 0 && V === 0) {
    return { cls: '', txt: 'ยังไม่มีสัญญาณผ่านมา — การนั่งรอโดยไม่เข้ามั่วก็คือทักษะหลักของระบบนี้' };
  }
  if (W === 0 && Y === 0) {
    return { cls: 'warn', txt: 'ไม่เข้ามั่วเลย ดีมาก — แต่มีสัญญาณจริงหลุดมือไป รอบหน้าลองกดให้ทัน' };
  }
  return { cls: 'warn', txt: 'พอใช้ — เข้าถูกไม่น้อยกว่าเข้ามั่ว แต่เป้าหมายคือเข้านอกกติกา = 0' };
}

function renderScoreboard() {
  var s = UI.sess;
  var st = s.stats;
  $('scPassed').textContent = st.passed;
  $('scCaught').textContent = st.caught;
  $('scMissed').textContent = st.missed;
  $('scFalse').textContent = st.false_entries;
  $('scClash').textContent = st.clash;

  var yr = $('scYourR');
  yr.textContent = fmtR(s.yourR);
  yr.className = 'bigr ' + rClass(s.yourR);
  var sr = $('scSysR');
  sr.textContent = fmtR(s.sys.r);
  sr.className = 'bigr ' + rClass(s.sys.r);
  sr.style.fontSize = '17px';

  var disc = disciplineText(st);
  var dEl = $('scDiscipline');
  dEl.className = 'discipline ' + disc.cls;
  dEl.textContent = disc.txt;
}

/* ---------- กราฟแท่งเทียน + วอลุ่ม (canvas, รองรับ devicePixelRatio) ---------- */
function drawChart() {
  var s = UI.sess;
  var cv = $('chart');
  if (!s || !cv) return;
  var cssW = cv.clientWidth, cssH = cv.clientHeight;
  if (cssW < 10 || cssH < 10) return; // จอซ่อนอยู่ / ยัง layout ไม่เสร็จ
  var dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
  }
  var ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var o = s.tk.ohlcv;
  // ขอบขวาของหน้าต่าง = view cursor (ถอยหลังตาม viewBack) — ยังไง ๆ ก็ ≤ s.cursor → anti-cheat คงอยู่
  var cur = s.cursor - (UI.viewBack || 0);
  if (cur < 0) cur = 0;
  var a = Math.max(0, cur - (WINDOW_BARS - 1)); // ห้ามวาดเกิน cursor เด็ดขาด (anti-cheat)
  var count = cur - a + 1;

  // พื้นที่วาด
  var padL = 8, padR = 58, padT = 12, padB = 22, gap = 8;
  var plotW = cssW - padL - padR;
  var fullH = cssH - padT - padB;
  var volH = Math.round(fullH * 0.18);
  var priceH = fullH - volH - gap;
  var priceTop = padT, priceBot = padT + priceH;
  var volTop = priceBot + gap, volBot = volTop + volH;

  // สเกลแกน Y จากแท่งที่มองเห็น (+ ระดับไม้ที่ถือ เพื่อให้เส้นอยู่ในจอ)
  var lo = Infinity, hi = -Infinity, vmax = 0;
  for (var i = a; i <= cur; i++) {
    if (o.l[i] < lo) lo = o.l[i];
    if (o.h[i] > hi) hi = o.h[i];
    if (o.v[i] > vmax) vmax = o.v[i];
  }
  if (s.pos) {
    lo = Math.min(lo, s.pos.stop);
    hi = Math.max(hi, s.pos.target);
  }
  if (!(isFinite(lo) && isFinite(hi)) || hi <= lo) { lo = 0; hi = 1; }
  var padY = (hi - lo) * 0.05;
  lo -= padY; hi += padY;
  if (vmax <= 0) vmax = 1;

  var xOf = function (idx) { return padL + (idx - a + 0.5) * (plotW / count); };
  var yOf = function (p) { return priceTop + (hi - p) / (hi - lo) * priceH; };
  var bw = Math.max(1, Math.floor((plotW / count) * 0.66));

  // ---- พื้นหลัง ----
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // ---- เส้นกริดราคา + ป้ายแกนขวา ----
  ctx.font = '11px "Segoe UI", Tahoma, sans-serif';
  ctx.textBaseline = 'middle';
  var step = niceStep((hi - lo) / 5);
  var gv = Math.ceil(lo / step) * step;
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  while (gv < hi) {
    var gy = Math.round(yOf(gv)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padL + plotW, gy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.muted;
    ctx.textAlign = 'left';
    ctx.fillText(fmtAxis(gv), padL + plotW + 6, gy);
    ctx.globalAlpha = 0.55;
    gv += step;
  }
  ctx.globalAlpha = 1;

  // ---- ป้ายวันที่ (เปลี่ยนเดือน — เว้นถี่ตามความกว้างจริง กันป้ายชนกัน) ----
  var ticks = [];
  for (var ti = a + 1; ti <= cur; ti++) {
    if (o.dates[ti].slice(5, 7) !== o.dates[ti - 1].slice(5, 7)) ticks.push(ti);
  }
  var slots = Math.max(1, Math.floor(plotW / 64)); // ~64px ต่อหนึ่งป้าย
  var keepEvery = Math.max(1, Math.ceil(ticks.length / slots));
  var lastLabelX = -Infinity;
  ctx.fillStyle = COL.muted;
  ctx.textAlign = 'center';
  ticks.forEach(function (tIdx, k) {
    if (k % keepEvery !== 0) return;
    if (xOf(tIdx) - lastLabelX < 58) return; // กันชนกรณีเดือนสั้น (ก.พ.)
    lastLabelX = xOf(tIdx);
    var m = parseInt(o.dates[tIdx].slice(5, 7), 10) - 1;
    var lbl = (m === 0) ? o.dates[tIdx].slice(0, 4) : (TH_MONTHS[m] + ' ' + o.dates[tIdx].slice(2, 4));
    ctx.fillText(lbl, xOf(tIdx), cssH - padB / 2);
    ctx.strokeStyle = COL.border;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    var tx = Math.round(xOf(tIdx)) + 0.5;
    ctx.moveTo(tx, priceTop);
    ctx.lineTo(tx, volBot);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ---- ไฮไลต์แท่งปัจจุบัน ----
  var curX = xOf(cur);
  ctx.fillStyle = 'rgba(88,166,255,0.10)';
  ctx.fillRect(curX - (plotW / count) / 2, priceTop, plotW / count, volBot - priceTop);

  // ---- วอลุ่ม ----
  for (var vi = a; vi <= cur; vi++) {
    var up = o.c[vi] >= o.o[vi];
    ctx.fillStyle = up ? COL.green : COL.red;
    ctx.globalAlpha = 0.45;
    var vh = Math.max(1, (o.v[vi] / vmax) * volH);
    ctx.fillRect(xOf(vi) - bw / 2, volBot - vh, bw, vh);
  }
  ctx.globalAlpha = 1;

  // ---- แท่งเทียน ----
  for (var ci = a; ci <= cur; ci++) {
    var upC = o.c[ci] >= o.o[ci];
    var col = upC ? COL.green : COL.red;
    var x = xOf(ci);
    var yH = yOf(o.h[ci]), yL = yOf(o.l[ci]);
    var yO = yOf(o.o[ci]), yC = yOf(o.c[ci]);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1;
    // ไส้เทียน
    ctx.beginPath();
    var wx = Math.round(x) + 0.5;
    ctx.moveTo(wx, yH);
    ctx.lineTo(wx, yL);
    ctx.stroke();
    // ตัวเทียน
    var bodyTop = Math.min(yO, yC);
    var bodyH = Math.max(1, Math.abs(yC - yO));
    ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);
    if (ci === cur) { // ขอบสว่างที่แท่งปัจจุบัน
      ctx.strokeStyle = COL.text;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(x - bw / 2 - 0.5, bodyTop - 0.5, bw + 1, bodyH + 1);
      ctx.globalAlpha = 1;
    }
  }

  // ---- เส้นระดับของไม้ที่ถือ (entry น้ำเงิน / stop แดง / target เขียว) ----
  if (s.pos) {
    var startX = (s.pos.entryIndex >= a) ? xOf(s.pos.entryIndex) : padL;
    drawLevel(ctx, startX, padL + plotW, yOf(s.pos.entry), COL.blue, fmtAxis(s.pos.entry));
    drawLevel(ctx, startX, padL + plotW, yOf(s.pos.stop), COL.red, fmtAxis(s.pos.stop));
    drawLevel(ctx, startX, padL + plotW, yOf(s.pos.target), COL.green, fmtAxis(s.pos.target));
  }

  // ---- เครื่องหมายเหตุการณ์ (เฉพาะที่เกิดแล้วเท่านั้น) ----
  UI.markers.forEach(function (mk) {
    if (mk.i < a || mk.i > cur) return;
    var mx = xOf(mk.i);
    var yLo = yOf(o.l[mk.i]) + 7;
    var yHi = yOf(o.h[mk.i]) - 7;
    switch (mk.kind) {
      case 'entry-sig':   drawTriUp(ctx, mx, yLo, 5, COL.blue); break;
      case 'entry-false': drawTriUp(ctx, mx, yLo, 5, COL.amber); break;
      case 'exit-stop':   drawTriDown(ctx, mx, yHi, 5, COL.red); break;
      case 'exit-target': drawTriDown(ctx, mx, yHi, 5, COL.green); break;
      case 'exit-time':   drawTriDown(ctx, mx, yHi, 5, COL.amber); break;
      case 'exit-settle': drawTriDown(ctx, mx, yHi, 5, COL.muted); break;
      case 'missed':      drawDiamond(ctx, mx, yLo + 2, 5, COL.amber); break;
      case 'clash':       drawSquare(ctx, mx, yLo + 2, 4, COL.muted); break;
    }
  });
}

function drawLevel(ctx, x1, x2, y, color, label) {
  y = Math.round(y) + 0.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // ป้ายราคาฝั่งขวา (ทับป้ายกริดได้ — สำคัญกว่า)
  ctx.font = 'bold 11px "Segoe UI", Tahoma, sans-serif';
  var tw = ctx.measureText(label).width;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(x2 + 3, y - 8, tw + 8, 16);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x2 + 7, y);
  ctx.restore();
}
function drawTriUp(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.lineTo(x + r, y + r);
  ctx.closePath();
  ctx.fill();
}
function drawTriDown(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(x - r, y - r);
  ctx.lineTo(x + r, y - r);
  ctx.closePath();
  ctx.fill();
}
function drawDiamond(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.stroke();
}
function drawSquare(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - r, y - r, r * 2, r * 2);
}
function niceStep(raw) {
  if (!(raw > 0) || !isFinite(raw)) return 1;
  var pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var m = raw / pow;
  var nice = (m <= 1) ? 1 : (m <= 2) ? 2 : (m <= 2.5) ? 2.5 : (m <= 5) ? 5 : 10;
  return nice * pow;
}

/* ====================================================================
 * เล่นอัตโนมัติ
 * ==================================================================== */

function toggleAutoplay() {
  if (!UI.sess || UI.sess.ended || UI.screen !== 'play') return;
  if (UI.autoplay) stopAutoplay();
  else {
    UI.viewBack = 0; // เริ่มเล่นอัตโนมัติ = กลับมาปัจจุบันก่อน
    UI.autoplay = true;
    UI.timer = setInterval(doStep, AUTOPLAY_MS);
  }
  if (UI.sess && !UI.sess.ended) renderPlay();
}
function stopAutoplay() {
  UI.autoplay = false;
  if (UI.timer) { clearInterval(UI.timer); UI.timer = null; }
}

/* ====================================================================
 * จอจบรอบ
 * ==================================================================== */

function onSessionEnd(reason) {
  stopAutoplay();
  var s = UI.sess;
  var o = s.tk.ohlcv;
  var st = s.stats;

  // บันทึกประวัติ (20 รอบล่าสุด)
  saveHistoryRecord({
    ts: new Date().toISOString(),
    ticker: s.tk.ticker,
    passed: st.passed,
    caught: st.caught,
    missed: st.missed,
    false_entries: st.false_entries,
    clash: st.clash,
    your_r: Math.round(s.yourR * 100) / 100,
    system_r: Math.round(s.sys.r * 100) / 100
  });

  $('endTitle').textContent = 'จบรอบฝึก — ' + s.tk.ticker;
  var reasonTxt = (reason === 'steps') ? 'ครบโควต้า ' + s.maxSteps + ' แท่ง'
    : (reason === 'data-end') ? 'เดินจนสุดข้อมูลในคลัง'
    : 'กดจบรอบเอง';
  $('endReason').textContent = reasonTxt + ' · ช่วงที่เดิน: ' +
    thDate(o.dates[s.start]) + ' → ' + thDate(o.dates[s.cursor]) + ' (' + s.steps + ' แท่ง)';

  var ey = $('endYourR');
  ey.textContent = fmtR(s.yourR);
  ey.className = 'v ' + rClass(s.yourR);
  var es = $('endSysR');
  es.textContent = fmtR(s.sys.r);
  es.className = 'v ' + rClass(s.sys.r);

  var diff = s.yourR - s.sys.r;
  var vEl = $('endVerdict');
  if (Math.abs(diff) < 0.005) {
    vEl.textContent = (st.false_entries === 0)
      ? 'เสมอกับระบบ — ทำตามกติกาได้ครบถ้วน'
      : 'R เสมอกับระบบ — แต่มีเข้านอกกติกา ' + st.false_entries + ' ครั้ง (รอบนี้รอด ไม่ได้แปลว่าถูก)';
  } else if (diff > 0) {
    vEl.textContent = (st.false_entries === 0)
      ? 'คุณนำระบบ ' + fmtR(diff) + ' — และไม่เข้านอกกติกาเลย ยอดเยี่ยม'
      : 'คุณนำระบบ ' + fmtR(diff) + ' — แต่มีเข้านอกกติกา ' + st.false_entries +
        ' ครั้ง ชนะแบบนี้ระวังกลายเป็นนิสัยในสนามจริง';
  } else {
    vEl.textContent = 'คุณตามหลังระบบ ' + fmtR(Math.abs(diff)) +
      ' — บทเรียนคลาสสิก: แค่ตามสัญญาณให้ครบ ไม่ต้องเก่งกว่าระบบก็พอ';
  }

  var stats = [
    ['สัญญาณที่ผ่านมา', st.passed, ''],
    ['จับได้', st.caught, 'color:var(--green)'],
    ['พลาด', st.missed, 'color:var(--red)'],
    ['เข้านอกกติกา', st.false_entries, 'color:var(--amber)'],
    ['ชนกับไม้ที่ถือ', st.clash, 'color:var(--muted)']
  ];
  $('endStats').innerHTML = stats.map(function (x) {
    return '<div class="end-stat"><div class="k">' + x[0] + '</div>' +
      '<div class="v"' + (x[2] ? ' style="' + x[2] + '"' : '') + '>' + x[1] + '</div></div>';
  }).join('');

  var ts = s.meta.time_stop_days != null ? s.meta.time_stop_days : DEF_TS_DAYS;
  var minR = s.meta.time_stop_min_r != null ? s.meta.time_stop_min_r : DEF_TS_MINR;
  $('endSysDetail').textContent =
    'ฝั่งระบบ: เข้า ' + s.sys.taken + ' ไม้ · ข้ามสัญญาณที่มาตอนถือไม้อยู่ ' + s.sys.skippedClash +
    ' ครั้ง · เกณฑ์ออกเดียวกัน (stop −1R / เป้า +2.5R / time-stop ' + ts + ' วันถ้า R ยังไม่ถึง ' + minR + ')';
  $('endSettleNote').style.display = (s.settledOpen || s.sys.settled) ? '' : 'none';

  var disc = disciplineText(st);
  var dEl = $('endDiscipline');
  dEl.className = 'discipline ' + disc.cls;
  dEl.textContent = disc.txt;

  showScreen('end');
}

/* ====================================================================
 * ผูกเหตุการณ์ + boot
 * ==================================================================== */

function bindEvents() {
  $('btnStartRandom').addEventListener('click', function () { startSession('random'); });
  $('btnStartBegin').addEventListener('click', function () { startSession('begin'); });
  $('btnNext').addEventListener('click', doStep);
  var rwBtn = $('btnRewind');
  if (rwBtn) rwBtn.addEventListener('click', rewindView);
  $('btnAuto').addEventListener('click', toggleAutoplay);
  $('btnEndSession').addEventListener('click', endSessionManually);
  $('btnEnter').addEventListener('click', doEnter);
  $('btnClearHistory').addEventListener('click', clearHistoryClicked);

  $('btnReplaySame').addEventListener('click', function () { startSession('random'); });
  $('btnPickOther').addEventListener('click', function () {
    stopAutoplay();
    UI.sess = null;
    renderHistory();
    showScreen('setup');
  });

  // คีย์ลัด — ใช้ e.code เพื่อให้กดได้แม้แป้นพิมพ์อยู่โหมดภาษาไทย
  document.addEventListener('keydown', function (e) {
    if (UI.screen !== 'play') return;
    if (e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
      doStep();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      rewindView();
    } else if (e.code === 'KeyE') {
      doEnter();
    } else if (e.code === 'KeyP') {
      toggleAutoplay();
    }
  });

  var rafPending = false;
  window.addEventListener('resize', function () {
    if (rafPending || UI.screen !== 'play') return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      if (UI.screen === 'play' && UI.sess) drawChart();
    });
  });

  // สลับธีม (จากเปลือกร่วม shell.js) → อ่านสีใหม่ + วาดกราฟใหม่ (canvas ไม่ตาม CSS เอง)
  window.addEventListener('sw:themechange', function () {
    readCOL();
    if (UI.screen === 'play' && UI.sess) drawChart();
  });
}

(function boot() {
  // ป้ายเวลา time-stop ใน footer ตาม meta จริง
  var ft = $('ftTimeStop');
  if (ft && D.meta && D.meta.time_stop_days != null) ft.textContent = D.meta.time_stop_days;
  buildTickerGrid();
  renderHistory();
  bindEvents();
  showScreen('setup');
})();

})();
