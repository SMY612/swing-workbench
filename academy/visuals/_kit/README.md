# `_kit/` — MyInvest Visual Library shared kit

ชุดเครื่องมือกลางที่ทุกหน้า visual ใน `academy/visuals/` เรียกใช้ร่วมกัน เพื่อให้ **เลขตรงกันทั้งระบบ** และไม่ต้องเขียนซ้ำ (single source of truth · ประหยัด token).

## ไฟล์
| ไฟล์ | หน้าที่ |
|------|--------|
| `theme.css` | ธีม Apple-Store โทนสว่าง (system font, ไม่มี asset ภายนอก) + คลาส component (`.card .eq .adxtbl .step .gate .badge .selfcheck` ฯลฯ) |
| `engine.js` | **แหล่งข้อมูล + สูตรเดียว** — GOOGL OHLC จริง (yfinance) ฝังในไฟล์ + `adx14()`, `trueRange`, `wilderSmooth`, `sma`, `positionSize`, `rr`, `expectancy` + regime helpers `GATES`, `atrPct`, `swings`, `regimeClassify`. มี `console.assert` ตรวจ ADX เอง |
| `charts.js` | ฟังก์ชันวาด SVG คืนเป็น string (`makeScale, axis, line, multiLine, candle, crossMarker, hoverGuide, scrubLayer, heatBar, barCompare, legend`) — ไม่มี state |
| `ui.js` | โมชัน/นำทางสไตล์ Apple — `reveal()` (scroll-reveal), `chipNav()` (แถบชิปติดบน), `tooltip()` |
| `canon.js` | **กล่องเลขกติกา canonical_v2** — `window.CANON` (mirror ตรงชื่อ field จาก `src/backtest/rules.py::CANONICAL_V2`; มี `scripts/check_canon.py` เทียบอัตโนมัติ) + `window.CANON_X` (บริบทบทเรียน: สถานะ pattern / ผลสอบ P0 / drawdown ladder / 5 milestones — ที่มา soul-swing.md + รายงาน P0) |
| `quiz.js` | **เครื่องทำแบบทดสอบให้คะแนน** — `QUIZ.mount(elOrSelector, BANK)`: MCQ/จริง-เท็จ, feedback ทันที (ผิด = เฉลย + ที่มาของกฎ), แถบคะแนน, ผ่าน ≥ `pass` (default 80%), ปุ่มทำใหม่สลับข้อ+ตัวเลือก, best score ลง localStorage (try/catch) |

## เพิ่มหน้าใหม่
1. สร้าง `academy/visuals/<slug>.html`
2. `<head>`: `<link rel="stylesheet" href="./_kit/theme.css">`
3. ก่อน `</body>`: โหลด `engine.js` → `canon.js` → `charts.js` → `ui.js` (+ `quiz.js` ถ้าหน้านั้นมีแบบทดสอบ) แล้วเขียน glue ของหน้าใน `<script>` ปิดท้าย
4. โครงหน้า: `hero` → `chipnav` → `section` (มี `.reveal`) ตามด้วย `UI.reveal()` + `UI.chipNav()`
5. ดึงเลขจาก `ENGINE` เท่านั้น (อย่า hardcode) เพื่อให้ทุกหน้าตรงกัน — **เลขกติกา canonical_v2 ดึงจาก `CANON`/`CANON_X`** (อย่าพิมพ์ 125% / [1.5,3.0] / 21 วัน ฯลฯ ลงหน้าเอง)

## แบบทดสอบ (quiz.js) — แบบแผนคลังคำถาม
ฝังคลังคำถามเป็น object ในหน้า (ไม่แยกไฟล์ .json — `fetch()` ติด CORS บน `file://`):
```html
<div id="quizHost"></div>
<script>
var QUIZ_BANK = {
  id: "stop-target-exit", pass: 0.8,
  questions: [
    { q: "เข้า $100 stop $96 — target (เป้าขาย) อยู่ตรงไหน?",
      choices: ["$104", "$108", "$110", "$120"], answer: 2,
      why: "target = entry + " + CANON.breakout.rr_gate + " × (entry − stop) = 100 + 2.5×4 = 110",
      ref: "soul-swing.md §Target · rules.py rr_gate=2.5" }
  ]
};
QUIZ.mount('#quizHost', QUIZ_BANK);
</script>
```
- ข้อความคำถาม/เฉลยที่มีเลขกติกา ให้ **ประกอบ string จาก `CANON`** — กติกาเปลี่ยนแล้วข้อความไม่ค้าง
- ตัวเลือกหลอกของคำถามเชิงกฎ = ค่า v1 เก่าโดยตั้งใจ (150%, ≥5/6, swing-high target, หลุด SMA50) — เป็นเลขที่ user เคยเห็นจากหน้าเวอร์ชันก่อน
- ใส่ `<noscript class="note">เปิด JavaScript เพื่อทำแบบทดสอบ — เนื้อหาบทเรียนด้านบนอ่านได้ปกติ</noscript>` กำกับทุกจุดที่ mount

## พรีวิวแบบ offline
- เปิดเซิร์ฟเวอร์ static ที่โฟลเดอร์ `academy/visuals/` แล้วเข้า `/<slug>.html`
  - `python -m http.server 8753` → `http://localhost:8753/adx.html`
  - หรือใช้ Claude Preview (`launch.json` config ที่ชี้ root = `academy/visuals/`)
- เปิดด้วย `file://` ก็ได้ (ลิงก์ `_kit/` เป็น relative path ทั้งหมด ไม่มี CDN)

## กฎ
- **ห้าม** external/CDN/asset Apple จริง — self-contained 100%, เปิด offline ได้
- ภาษาไทยธรรมชาติ ศัพท์เทคนิคใส่วงเล็บ (ตาม `CLAUDE.md` Response Style)
- ราคา/ตัวเลขหุ้นต้อง verify จาก source (history.csv → portfolio → yfinance) หรือ flag ว่าเป็นสมมุติ

## หมายเหตุ kit
- `GATES` (เพิ่ม 2026-06-07 · reframe 2026-06-11) = **5 ธงบริบท** U·A·R·D·V รวมศูนย์ (`adxMin 25 / atrPctMin 1.5 / atrPctMax 4 / rrMin 2`, อิง `setups/_SCREENING.md`) — ชั้นจัดอันดับตัวเฝ้า (Stage 2→3) **ไม่ใช่ประตูเข้าไม้**; ประตูจริงตั้งแต่ canonical_v2 คือสแกน breakout ใน `src/backtest/live.py` (เลข mirror อยู่ใน `canon.js`)
- `regimeClassify(rows)` คืน `{trend, direction, volInBand, verdict}` (อ่านแท่ง non-null ตัวท้าย) ให้ตาราง 2×2 กับ gate badge ใช้เกณฑ์เดียวกัน ไม่มีวันขัดกัน · `swings(bars,k)` = fractal pivots, `atrPct(row)` = ATR÷close×100
