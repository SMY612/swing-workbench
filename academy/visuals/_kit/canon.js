/* ============================================================================
   canon.js — MyInvest Visual Kit · กล่องเลขกติกา canonical_v2
   ----------------------------------------------------------------------------
   window.CANON   = mirror ตรงชื่อ field จาก src/backtest/rules.py::CANONICAL_V2
                    (Python = source of truth — **ห้ามแก้เลขที่นี่โดยไม่แก้ rules.py**)
                    ตรวจความตรงอัตโนมัติ: `uv run python scripts/check_canon.py`
                    หมายเหตุ: ไม่ mirror บล็อก pullback — pattern ถูกพัก (PARKED)
                    หน้าบทเรียนต้องไม่สอนค่าของมันเป็นกติกาที่ใช้งาน
   window.CANON_X = บริบทบทเรียนที่ไม่อยู่ใน rules.py — สถานะ pattern / ผลสอบ P0 /
                    drawdown ladder / 5 milestones · ที่มา: soul-swing.md (§Setup
                    Patterns, §Drawdown Protocol, §Phase Unlock) + รายงาน P0
                    `quant/backtests/2026-06-11-p0-oos-canonical_v2/`
                    ตัวเลขผลสอบ = อ้างอิงในอดีต ไม่ใช่คำสัญญาผลตอบแทน
   โหลดในหน้า: <script src="./_kit/canon.js"></script> ถัดจาก engine.js
   ============================================================================ */
window.CANON = /*CANON-JSON*/{
  "name": "canonical_v2",
  "target_mode": "r2",
  "regime": { "spy_sma_len": 50, "adx_season_gate": 25.0 },
  "breakout": {
    "base_days": 20, "base_width_max": 0.08,
    "touch_tol": 0.01, "touch_min": 2, "touch_min_gap_days": 3,
    "vol_spike_ratio": 1.25, "vol_avg_len": 20,
    "atr_band": [1.5, 4.0], "k_atr": 1.5, "rr_gate": 2.5, "optional_min_pass": 1
  },
  "stop": { "min_atr_mult": 1.5, "max_atr_mult": 3.0, "mode": "structure" },
  "exit": { "time_stop_days": 21, "time_stop_min_r": 0.5, "sma_exit": false, "sma_exit_len": 50 },
  "earnings": { "min_days": 21, "enabled": true },
  "sizing": {
    "start_equity": 3069.0, "risk_pct": 1.0, "max_weight_pct": 10.0,
    "max_positions": 5, "max_sector_pct": 30.0, "fractional": true
  }
}/*END-CANON-JSON*/;

window.CANON_X = {
  // soul-swing.md §Setup Patterns — สถานะตัดสินโดยผล backtest ไม่ใช่ความชอบ
  pattern_status: { breakout: 'ACTIVE', trend_pullback: 'PARKED' },
  pullback_insample_r: -0.079,   // เหตุที่พัก: expectancy ติดลบ + ลบ 25/27 ช่อง sensitivity

  // quant/backtests/2026-06-11-p0-oos-canonical_v2/ — breakout เท่านั้น
  results: {
    insample: { trades: 274, exp_r: 0.228, ci90: [0.07, 0.39], cells_positive: '27/27' },
    oos: { trades: 37, exp_r: 0.702, ci90: [0.27, 1.12], win_pct: 56.8,
           note: 'ข้อสอบ OOS รันครั้งเดียวตามกติกา P0 — ห้ามรันซ้ำ (รันหลายรอบ = เลือกคำตอบที่ถูกใจ)' },
    warnings: [
      'edge บาง — ฉาก friction โหด CI แตะศูนย์',
      'กำไรมาเป็นพัก ๆ — ปี 2024 แบกราว 3/4 ของกำไรรวม; 2019/2023 ติดลบบาง',
      'OOS = 1 ปีที่ตลาดเป็นใจ'
    ]
  },

  // soul-swing.md §Drawdown Protocol — Active (วัดจากจุดสูงสุดของพอร์ต Active)
  drawdown: [
    { dd: -5,  action: 'พักเข้าไม้ใหม่ 3 วัน + ทบทวน 5 ไม้ล่าสุดว่ามี pattern ความผิดพลาดไหม' },
    { dd: -10, action: 'พัก 1 สัปดาห์ · Rick รัน sizing + sector concentration ใหม่ · audit ไม้ที่แพ้' },
    { dd: -15, action: 'พัก 2 สัปดาห์ · ห้ามเปิด pattern ชนิดใหม่จนตัวเดิมพิสูจน์ได้' },
    { dd: -20, action: 'แช่แข็ง Active ทั้งเล่ม · retrospective เต็มกับ Kim · ตัดสิน: ไปต่อ / ปรับ / ปิด' }
  ],
  drawdown_recovery: 'การพักดำเนินต่อจนพอร์ตกู้คืน 50% ของส่วนที่หายไปจากจุดสูงสุด',

  // soul-swing.md §Phase Unlock — ครบทั้ง 5 จึงเข้า Phase 2 (แบ่งเงินจริง 5% จากเล่ม Passive)
  milestones: [
    { name: 'จำนวนไม้',            rule: '≥ 30 ไม้ปิดแล้ว',                                       why: 'พลังทางสถิติ' },
    { name: 'ความหลากหลาย regime', rule: 'เห็นสภาพตลาด ≥ 2 แบบ',                                  why: 'edge ไม่ผูกกับสภาพเดียว' },
    { name: 'expectancy ต่อเนื่อง', rule: 'rolling 30 ไม้ > 0 ติดกัน 3 รอบวัด',                     why: 'ไม่ใช่ดวงช่วงสั้น' },
    { name: 'วินัยตามแผน',          rule: '≥ 80% ของไม้ทำตามแผน (ตั้ง stop + sizing ตามกติกา)',     why: 'วินัยแกน D' },
    { name: 'journal',             rule: '≥ 25 ไม้มีบันทึกหลังปิด',                                why: 'กระบวนการหมุนจริง' }
  ],

  port: { usd: 3069, thb_approx: 100000 }   // มติ ก1 (2026-06-10): พอร์ตกระดาษ = เท่าที่ตั้งใจลงจริง
};
