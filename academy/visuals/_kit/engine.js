/* ============================================================================
   engine.js — MyInvest Visual Kit · DATA + INDICATOR MATH (single source of truth)
   ----------------------------------------------------------------------------
   No DOM, no I/O. Pure functions over an embedded dataset. Exposes window.ENGINE.
   Every visual page reads numbers from here so the whole library agrees.

   Data : GOOGL daily OHLC, yfinance, 2025-06-06 → 2026-06-05 (as_of 2026-06-05).
   ADX  : canonical Wilder(14). Smoothing = RMA (seed = mean of first 14 real bars);
          first ADX = mean of first 14 DX. Wilder RMA needs a long warmup to converge,
          so ~1y of bars is fed here → ADX(05-29) lands at the converged 40.40, matching
          src/indicators.py (the screening engine = single source of truth) + its
          regression test. A short window drifts high (~41.1) — un-converged, not
          canonical; see glossary "Wilder warmup / convergence".
   Check: ADX(2026-05-29) ≈ 40.40 · ADX(2026-06-05) ≈ 30.43  (console.assert below)
   ============================================================================ */
(function () {
  // --- Embedded GOOGL OHLC (verbatim yfinance) ------------------------------
  const GOOGL = [
    {date:"2025-06-06",o:170.83,h:174.50,l:170.83,c:173.68},
    {date:"2025-06-09",o:174.54,h:176.47,l:174.37,c:176.09},
    {date:"2025-06-10",o:176.20,h:181.11,l:174.91,c:178.60},
    {date:"2025-06-11",o:179.77,h:180.37,l:176.75,c:177.35},
    {date:"2025-06-12",o:176.18,h:176.72,l:174.75,c:175.70},
    {date:"2025-06-13",o:172.44,h:177.13,l:172.39,c:174.67},
    {date:"2025-06-16",o:174.73,h:176.94,l:174.65,c:176.77},
    {date:"2025-06-17",o:175.70,h:177.36,l:174.58,c:175.95},
    {date:"2025-06-18",o:176.01,h:176.56,l:173.20,c:173.32},
    {date:"2025-06-20",o:173.95,h:174.34,l:165.46,c:166.64},
    {date:"2025-06-23",o:166.27,h:167.34,l:162.00,c:165.19},
    {date:"2025-06-24",o:166.92,h:168.22,l:166.13,c:166.77},
    {date:"2025-06-25",o:167.63,h:172.36,l:167.55,c:170.68},
    {date:"2025-06-26",o:172.43,h:173.69,l:169.94,c:173.54},
    {date:"2025-06-27",o:173.54,h:178.68,l:171.73,c:178.53},
    {date:"2025-06-30",o:180.78,h:181.23,l:174.58,c:176.23},
    {date:"2025-07-01",o:175.74,h:176.09,l:173.53,c:175.84},
    {date:"2025-07-02",o:175.54,h:178.86,l:175.07,c:178.64},
    {date:"2025-07-03",o:178.50,h:179.67,l:177.05,c:179.53},
    {date:"2025-07-07",o:179.06,h:179.30,l:175.68,c:176.79},
    {date:"2025-07-08",o:177.85,h:177.95,l:172.81,c:174.36},
    {date:"2025-07-09",o:175.25,h:179.44,l:172.77,c:176.62},
    {date:"2025-07-10",o:175.63,h:178.43,l:174.38,c:177.62},
    {date:"2025-07-11",o:176.79,h:181.43,l:176.48,c:180.19},
    {date:"2025-07-14",o:181.01,h:183.67,l:179.68,c:181.56},
    {date:"2025-07-15",o:182.81,h:184.22,l:181.60,c:182.00},
    {date:"2025-07-16",o:183.24,h:184.33,l:182.03,c:182.97},
    {date:"2025-07-17",o:182.14,h:184.06,l:180.48,c:183.58},
    {date:"2025-07-18",o:185.40,h:186.42,l:183.71,c:185.06},
    {date:"2025-07-21",o:186.25,h:190.29,l:186.15,c:190.10},
    {date:"2025-07-22",o:191.50,h:191.65,l:187.46,c:191.34},
    {date:"2025-07-23",o:191.50,h:192.53,l:189.18,c:190.23},
    {date:"2025-07-24",o:197.03,h:197.95,l:191.00,c:192.17},
    {date:"2025-07-25",o:191.98,h:194.33,l:191.26,c:193.18},
    {date:"2025-07-28",o:193.65,h:194.05,l:190.84,c:192.58},
    {date:"2025-07-29",o:192.43,h:195.92,l:192.08,c:195.75},
    {date:"2025-07-30",o:195.60,h:197.60,l:194.69,c:196.53},
    {date:"2025-07-31",o:195.71,h:195.99,l:191.09,c:191.90},
    {date:"2025-08-01",o:189.03,h:190.83,l:187.82,c:189.13},
    {date:"2025-08-04",o:190.29,h:195.27,l:190.12,c:195.04},
    {date:"2025-08-05",o:194.71,h:197.86,l:193.89,c:194.67},
    {date:"2025-08-06",o:194.50,h:196.63,l:193.67,c:196.09},
    {date:"2025-08-07",o:197.06,h:197.54,l:194.33,c:196.52},
    {date:"2025-08-08",o:197.22,h:202.61,l:197.17,c:201.42},
    {date:"2025-08-11",o:200.94,h:201.48,l:199.07,c:201.00},
    {date:"2025-08-12",o:201.37,h:204.50,l:200.59,c:203.34},
    {date:"2025-08-13",o:204.13,h:204.53,l:197.51,c:201.96},
    {date:"2025-08-14",o:201.50,h:204.44,l:201.23,c:202.94},
    {date:"2025-08-15",o:203.85,h:206.44,l:201.28,c:203.90},
    {date:"2025-08-18",o:204.20,h:205.27,l:202.49,c:203.50},
    {date:"2025-08-19",o:203.03,h:203.44,l:199.96,c:201.57},
    {date:"2025-08-20",o:200.73,h:201.28,l:196.60,c:199.32},
    {date:"2025-08-21",o:199.75,h:202.48,l:199.43,c:199.75},
    {date:"2025-08-22",o:202.73,h:208.54,l:201.30,c:206.09},
    {date:"2025-08-25",o:206.43,h:210.52,l:205.28,c:208.49},
    {date:"2025-08-26",o:207.51,h:207.85,l:205.70,c:207.14},
    {date:"2025-08-27",o:205.70,h:208.91,l:205.65,c:207.48},
    {date:"2025-08-28",o:207.25,h:212.22,l:206.90,c:211.64},
    {date:"2025-08-29",o:210.51,h:214.65,l:210.20,c:212.91},
    {date:"2025-09-02",o:208.44,h:211.68,l:206.20,c:211.35},
    {date:"2025-09-03",o:226.21,h:231.31,l:224.79,c:230.66},
    {date:"2025-09-04",o:229.65,h:232.37,l:226.11,c:232.30},
    {date:"2025-09-05",o:232.20,h:235.76,l:231.90,c:235.00},
    {date:"2025-09-08",o:235.47,h:238.13,l:233.67,c:234.04},
    {date:"2025-09-09",o:234.17,h:240.47,l:233.23,c:239.63},
    {date:"2025-09-10",o:238.90,h:241.66,l:237.85,c:239.17},
    {date:"2025-09-11",o:239.88,h:242.25,l:236.25,c:240.37},
    {date:"2025-09-12",o:240.37,h:242.08,l:238.00,c:240.80},
    {date:"2025-09-15",o:244.66,h:252.41,l:244.66,c:251.61},
    {date:"2025-09-16",o:252.08,h:253.04,l:249.47,c:251.16},
    {date:"2025-09-17",o:251.22,h:251.60,l:246.28,c:249.53},
    {date:"2025-09-18",o:251.68,h:253.99,l:249.80,c:252.03},
    {date:"2025-09-19",o:253.25,h:256.00,l:251.81,c:254.72},
    {date:"2025-09-22",o:254.43,h:255.78,l:250.30,c:252.53},
    {date:"2025-09-23",o:253.04,h:254.36,l:250.48,c:251.66},
    {date:"2025-09-24",o:251.66,h:252.35,l:246.44,c:247.14},
    {date:"2025-09-25",o:244.40,h:246.49,l:240.74,c:245.79},
    {date:"2025-09-26",o:247.07,h:249.42,l:245.97,c:246.54},
    {date:"2025-09-29",o:247.85,h:251.15,l:242.77,c:244.05},
    {date:"2025-09-30",o:242.81,h:243.29,l:239.25,c:243.10},
    {date:"2025-10-01",o:240.75,h:246.30,l:238.61,c:244.90},
    {date:"2025-10-02",o:245.15,h:246.81,l:242.30,c:245.69},
    {date:"2025-10-03",o:244.49,h:246.30,l:241.66,c:245.35},
    {date:"2025-10-06",o:244.78,h:251.32,l:244.58,c:250.43},
    {date:"2025-10-07",o:248.27,h:250.44,l:245.52,c:245.76},
    {date:"2025-10-08",o:244.96,h:246.01,l:243.82,c:244.62},
    {date:"2025-10-09",o:244.47,h:244.76,l:239.15,c:241.53},
    {date:"2025-10-10",o:241.43,h:244.09,l:235.84,c:236.57},
    {date:"2025-10-13",o:240.21,h:244.50,l:239.71,c:244.15},
    {date:"2025-10-14",o:241.23,h:247.12,l:240.51,c:245.45},
    {date:"2025-10-15",o:247.25,h:252.11,l:245.99,c:251.03},
    {date:"2025-10-16",o:251.77,h:256.96,l:250.10,c:251.46},
    {date:"2025-10-17",o:250.76,h:254.22,l:247.81,c:253.30},
    {date:"2025-10-20",o:254.69,h:257.33,l:254.23,c:256.55},
    {date:"2025-10-21",o:254.74,h:254.88,l:244.15,c:250.46},
    {date:"2025-10-22",o:254.37,h:256.36,l:249.29,c:251.69},
    {date:"2025-10-23",o:252.98,h:255.04,l:251.85,c:253.08},
    {date:"2025-10-24",o:256.58,h:261.68,l:255.32,c:259.92},
    {date:"2025-10-27",o:264.82,h:270.14,l:264.28,c:269.27},
    {date:"2025-10-28",o:269.69,h:270.73,l:266.50,c:267.47},
    {date:"2025-10-29",o:267.75,h:275.34,l:267.67,c:274.57},
    {date:"2025-10-30",o:291.59,h:291.59,l:280.06,c:281.48},
    {date:"2025-10-31",o:283.21,h:286.00,l:277.03,c:281.19},
    {date:"2025-11-03",o:282.18,h:285.53,l:279.80,c:283.72},
    {date:"2025-11-04",o:276.75,h:281.27,l:276.26,c:277.54},
    {date:"2025-11-05",o:278.87,h:286.42,l:277.34,c:284.31},
    {date:"2025-11-06",o:285.33,h:288.35,l:281.14,c:284.75},
    {date:"2025-11-07",o:283.21,h:283.78,l:275.19,c:278.83},
    {date:"2025-11-10",o:284.42,h:290.80,l:282.86,c:290.10},
    {date:"2025-11-11",o:287.75,h:291.92,l:287.32,c:291.31},
    {date:"2025-11-12",o:291.68,h:292.01,l:283.69,c:286.71},
    {date:"2025-11-13",o:282.34,h:282.84,l:277.24,c:278.57},
    {date:"2025-11-14",o:271.41,h:278.56,l:270.70,c:276.41},
    {date:"2025-11-17",o:285.78,h:293.95,l:283.57,c:285.02},
    {date:"2025-11-18",o:287.92,h:288.80,l:278.20,c:284.28},
    {date:"2025-11-19",o:287.16,h:303.81,l:286.63,c:292.81},
    {date:"2025-11-20",o:304.54,h:306.42,l:288.67,c:289.45},
    {date:"2025-11-21",o:296.42,h:303.92,l:293.85,c:299.66},
    {date:"2025-11-24",o:311.13,h:319.48,l:309.60,c:318.58},
    {date:"2025-11-25",o:326.21,h:328.83,l:317.65,c:323.44},
    {date:"2025-11-26",o:320.68,h:324.50,l:316.79,c:319.95},
    {date:"2025-11-28",o:323.37,h:326.85,l:316.79,c:320.18},
    {date:"2025-12-01",o:317.70,h:319.85,l:313.89,c:314.89},
    {date:"2025-12-02",o:316.74,h:318.38,l:313.91,c:315.81},
    {date:"2025-12-03",o:315.89,h:321.58,l:314.10,c:319.63},
    {date:"2025-12-04",o:322.23,h:322.36,l:314.70,c:317.62},
    {date:"2025-12-05",o:319.49,h:323.16,l:319.17,c:321.27},
    {date:"2025-12-08",o:320.05,h:320.44,l:311.22,c:313.72},
    {date:"2025-12-09",o:312.37,h:317.99,l:311.90,c:317.08},
    {date:"2025-12-10",o:315.83,h:321.31,l:314.68,c:320.21},
    {date:"2025-12-11",o:320.08,h:321.12,l:308.60,c:312.43},
    {date:"2025-12-12",o:313.70,h:314.87,l:305.56,c:309.29},
    {date:"2025-12-15",o:311.32,h:311.42,l:304.88,c:308.22},
    {date:"2025-12-16",o:304.95,h:310.77,l:302.59,c:306.57},
    {date:"2025-12-17",o:308.01,h:308.09,l:296.12,c:296.72},
    {date:"2025-12-18",o:301.72,h:303.96,l:299.23,c:302.46},
    {date:"2025-12-19",o:301.73,h:307.25,l:300.97,c:307.16},
    {date:"2025-12-22",o:309.88,h:310.13,l:305.30,c:309.78},
    {date:"2025-12-23",o:309.63,h:314.94,l:309.32,c:314.35},
    {date:"2025-12-24",o:314.77,h:315.08,l:311.92,c:314.09},
    {date:"2025-12-26",o:314.48,h:315.09,l:312.28,c:313.51},
    {date:"2025-12-29",o:311.37,h:314.02,l:310.62,c:313.56},
    {date:"2025-12-30",o:312.50,h:316.95,l:312.46,c:313.85},
    {date:"2025-12-31",o:312.85,h:314.58,l:311.44,c:313.00},
    {date:"2026-01-02",o:316.90,h:322.50,l:310.33,c:315.15},
    {date:"2026-01-05",o:317.66,h:319.02,l:314.63,c:316.54},
    {date:"2026-01-06",o:316.40,h:320.94,l:311.78,c:314.34},
    {date:"2026-01-07",o:314.36,h:326.15,l:314.19,c:321.98},
    {date:"2026-01-08",o:328.97,h:330.32,l:321.50,c:325.44},
    {date:"2026-01-09",o:327.09,h:330.83,l:325.80,c:328.57},
    {date:"2026-01-12",o:325.80,h:334.04,l:325.00,c:331.86},
    {date:"2026-01-13",o:334.95,h:340.49,l:333.62,c:335.97},
    {date:"2026-01-14",o:335.06,h:336.52,l:330.48,c:335.84},
    {date:"2026-01-15",o:337.65,h:337.69,l:330.74,c:332.78},
    {date:"2026-01-16",o:334.41,h:334.65,l:327.70,c:330.00},
    {date:"2026-01-20",o:320.87,h:327.73,l:320.43,c:322.00},
    {date:"2026-01-21",o:320.92,h:332.48,l:319.35,c:328.38},
    {date:"2026-01-22",o:334.45,h:335.15,l:328.75,c:330.54},
    {date:"2026-01-23",o:332.49,h:333.69,l:327.45,c:327.93},
    {date:"2026-01-26",o:327.81,h:335.84,l:327.00,c:333.26},
    {date:"2026-01-27",o:335.37,h:337.91,l:333.48,c:334.55},
    {date:"2026-01-28",o:336.06,h:337.54,l:331.94,c:336.01},
    {date:"2026-01-29",o:340.30,h:342.29,l:326.54,c:338.25},
    {date:"2026-01-30",o:340.00,h:340.00,l:332.29,c:338.00},
    {date:"2026-02-02",o:336.22,h:344.83,l:335.63,c:343.69},
    {date:"2026-02-03",o:347.34,h:349.00,l:337.47,c:339.71},
    {date:"2026-02-04",o:342.96,h:343.31,l:328.52,c:333.04},
    {date:"2026-02-05",o:312.22,h:332.69,l:306.46,c:331.25},
    {date:"2026-02-06",o:327.18,h:330.38,l:319.92,c:322.86},
    {date:"2026-02-09",o:320.93,h:327.70,l:317.26,c:324.32},
    {date:"2026-02-10",o:320.97,h:321.67,l:314.61,c:318.58},
    {date:"2026-02-11",o:318.97,h:321.06,l:309.66,c:310.96},
    {date:"2026-02-12",o:312.09,h:316.24,l:307.20,c:309.00},
    {date:"2026-02-13",o:307.73,h:308.63,l:303.71,c:305.72},
    {date:"2026-02-17",o:300.04,h:304.44,l:296.25,c:302.02},
    {date:"2026-02-18",o:302.09,h:305.38,l:301.25,c:303.33},
    {date:"2026-02-19",o:301.82,h:305.47,l:300.04,c:302.85},
    {date:"2026-02-20",o:304.32,h:316.50,l:303.90,c:314.98},
    {date:"2026-02-23",o:319.05,h:319.52,l:309.87,c:311.49},
    {date:"2026-02-24",o:310.52,h:312.27,l:305.93,c:310.90},
    {date:"2026-02-25",o:312.06,h:313.64,l:309.44,c:312.90},
    {date:"2026-02-26",o:312.64,h:313.14,l:302.35,c:307.38},
    {date:"2026-02-27",o:304.14,h:312.37,l:303.80,c:311.76},
    {date:"2026-03-02",o:303.23,h:308.49,l:301.30,c:306.52},
    {date:"2026-03-03",o:298.59,h:303.94,l:296.71,c:303.58},
    {date:"2026-03-04",o:302.89,h:305.47,l:300.75,c:303.13},
    {date:"2026-03-05",o:303.04,h:303.30,l:297.99,c:300.88},
    {date:"2026-03-06",o:296.09,h:300.53,l:295.18,c:298.52},
    {date:"2026-03-09",o:294.36,h:306.80,l:294.08,c:306.36},
    {date:"2026-03-10",o:306.17,h:309.51,l:305.57,c:307.04},
    {date:"2026-03-11",o:306.75,h:311.42,l:305.92,c:308.70},
    {date:"2026-03-12",o:306.82,h:308.94,l:301.03,c:303.55},
    {date:"2026-03-13",o:307.01,h:307.69,l:300.44,c:302.28},
    {date:"2026-03-16",o:304.35,h:306.49,l:303.02,c:305.56},
    {date:"2026-03-17",o:305.86,h:311.42,l:305.50,c:310.92},
    {date:"2026-03-18",o:309.27,h:312.47,l:306.93,c:307.69},
    {date:"2026-03-19",o:304.01,h:308.06,l:302.35,c:307.13},
    {date:"2026-03-20",o:305.46,h:306.00,l:298.27,c:301.00},
    {date:"2026-03-23",o:302.11,h:305.98,l:300.93,c:302.06},
    {date:"2026-03-24",o:299.20,h:299.92,l:290.33,c:290.44},
    {date:"2026-03-25",o:293.44,h:296.00,l:289.24,c:290.93},
    {date:"2026-03-26",o:287.91,h:287.95,l:278.50,c:280.92},
    {date:"2026-03-27",o:277.28,h:279.37,l:273.95,c:274.34},
    {date:"2026-03-30",o:276.42,h:277.09,l:272.11,c:273.50},
    {date:"2026-03-31",o:278.04,h:288.08,l:277.09,c:287.56},
    {date:"2026-04-01",o:290.84,h:300.52,l:290.41,c:297.39},
    {date:"2026-04-02",o:290.69,h:298.08,l:289.45,c:295.77},
    {date:"2026-04-06",o:295.87,h:300.62,l:295.18,c:299.99},
    {date:"2026-04-07",o:302.73,h:305.63,l:297.72,c:305.46},
    {date:"2026-04-08",o:320.45,h:322.08,l:315.02,c:317.32},
    {date:"2026-04-09",o:315.91,h:319.54,l:311.06,c:318.49},
    {date:"2026-04-10",o:320.02,h:321.83,l:316.32,c:317.24},
    {date:"2026-04-13",o:317.14,h:321.63,l:315.47,c:321.31},
    {date:"2026-04-14",o:324.79,h:333.29,l:323.75,c:332.91},
    {date:"2026-04-15",o:332.89,h:337.48,l:330.90,c:337.12},
    {date:"2026-04-16",o:338.75,h:339.88,l:334.52,c:336.02},
    {date:"2026-04-17",o:337.65,h:342.32,l:336.24,c:341.68},
    {date:"2026-04-20",o:340.76,h:341.40,l:336.61,c:337.42},
    {date:"2026-04-21",o:337.69,h:339.34,l:331.35,c:332.29},
    {date:"2026-04-22",o:337.02,h:339.82,l:335.17,c:339.32},
    {date:"2026-04-23",o:341.18,h:341.96,l:336.18,c:338.89},
    {date:"2026-04-24",o:338.73,h:345.27,l:335.39,c:344.40},
    {date:"2026-04-27",o:345.98,h:353.18,l:342.73,c:350.34},
    {date:"2026-04-28",o:348.55,h:352.42,l:346.12,c:349.78},
    {date:"2026-04-29",o:347.57,h:355.79,l:344.21,c:349.94},
    {date:"2026-04-30",o:374.07,h:385.84,l:365.82,c:384.80},
    {date:"2026-05-01",o:381.63,h:386.76,l:379.05,c:385.69},
    {date:"2026-05-04",o:385.63,h:387.38,l:379.79,c:383.25},
    {date:"2026-05-05",o:386.23,h:392.82,l:384.02,c:388.43},
    {date:"2026-05-06",o:394.25,h:399.85,l:392.76,c:398.04},
    {date:"2026-05-07",o:399.92,h:400.10,l:392.68,c:397.99},
    {date:"2026-05-08",o:397.00,h:402.00,l:396.36,c:400.80},
    {date:"2026-05-11",o:393.65,h:397.44,l:388.47,c:388.64},
    {date:"2026-05-12",o:387.34,h:388.52,l:382.77,c:387.35},
    {date:"2026-05-13",o:385.60,h:403.70,l:385.00,c:402.62},
    {date:"2026-05-14",o:397.28,h:402.93,l:395.84,c:401.07},
    {date:"2026-05-15",o:396.32,h:399.54,l:393.18,c:396.78},
    {date:"2026-05-18",o:395.69,h:408.61,l:394.53,c:396.94},
    {date:"2026-05-19",o:396.96,h:397.15,l:386.11,c:387.66},
    {date:"2026-05-20",o:387.70,h:393.86,l:382.90,c:388.91},
    {date:"2026-05-21",o:385.70,h:392.50,l:383.02,c:387.66},
    {date:"2026-05-22",o:387.35,h:388.74,l:381.77,c:382.97},
    {date:"2026-05-26",o:384.51,h:389.26,l:382.60,c:388.88},
    {date:"2026-05-27",o:386.67,h:393.88,l:385.90,c:388.83},
    {date:"2026-05-28",o:388.00,h:391.87,l:385.16,c:390.13},
    {date:"2026-05-29",o:385.24,h:385.24,l:378.46,c:380.34},
    {date:"2026-06-01",o:376.52,h:378.56,l:373.52,c:376.37},
    {date:"2026-06-02",o:366.59,h:373.54,l:358.44,c:361.85},
    {date:"2026-06-03",o:362.03,h:366.45,l:358.08,c:358.99},
    {date:"2026-06-04",o:358.90,h:373.25,l:358.21,c:372.19},
    {date:"2026-06-05",o:366.34,h:372.08,l:364.12,c:368.53}
  ];
  const P = 14; // Wilder period

  // --- Step 1: True Range ----------------------------------------------------
  function trueRange(bar, prev) {
    if (!prev) return bar.h - bar.l;
    return Math.max(bar.h - bar.l, Math.abs(bar.h - prev.c), Math.abs(bar.l - prev.c));
  }

  // --- Step 2: Directional Movement (Wilder gating: dominant side only) -------
  function directionalMovement(bar, prev) {
    if (!prev) return { plusDM: 0, minusDM: 0 };
    const up = bar.h - prev.h, down = prev.l - bar.l;
    return {
      plusDM:  (up > down && up > 0) ? up : 0,
      minusDM: (down > up && down > 0) ? down : 0
    };
  }

  // --- Step 3: Wilder smoothing (RMA). values[0] = no-prev placeholder -------
  //     out[period] = mean(values[1..period]); out[t] = (out[t-1]*(P-1)+v[t])/P
  function wilderSmooth(values, period) {
    period = period || P;
    const out = new Array(values.length).fill(null);
    if (values.length <= period) return out;
    let seed = 0;
    for (let i = 1; i <= period; i++) seed += values[i];
    out[period] = seed / period;
    for (let i = period + 1; i < values.length; i++) {
      out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
    }
    return out;
  }

  // --- Master pass: one object per bar (indicator fields null during warmup) -
  function adx14(bars, period) {
    period = period || P;
    const tr = [], pDM = [], mDM = [];
    for (let i = 0; i < bars.length; i++) {
      const prev = i > 0 ? bars[i - 1] : null;
      tr.push(trueRange(bars[i], prev));
      const dm = directionalMovement(bars[i], prev);
      pDM.push(dm.plusDM); mDM.push(dm.minusDM);
    }
    const atr = wilderSmooth(tr, period);   // average true range (≈ $/bar)
    const sP  = wilderSmooth(pDM, period);
    const sM  = wilderSmooth(mDM, period);
    const plusDI = [], minusDI = [], dx = [];
    for (let i = 0; i < bars.length; i++) {
      if (atr[i] == null || atr[i] === 0) { plusDI.push(null); minusDI.push(null); dx.push(null); continue; }
      const pdi = 100 * sP[i] / atr[i], mdi = 100 * sM[i] / atr[i];
      plusDI.push(pdi); minusDI.push(mdi);
      const sum = pdi + mdi;
      dx.push(sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum);
    }
    // Step 5: ADX = RMA of DX. first DX at index P; first ADX = mean of first 14 DX.
    const adx = new Array(bars.length).fill(null);
    const firstDX = period, firstADX = firstDX + period - 1;
    if (bars.length > firstADX) {
      let s = 0;
      for (let i = firstDX; i <= firstADX; i++) s += dx[i];
      adx[firstADX] = s / period;
      for (let i = firstADX + 1; i < bars.length; i++) adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
    return bars.map((b, i) => ({
      date: b.date, o: b.o, h: b.h, l: b.l, c: b.c,
      tr: tr[i], plusDM: pDM[i], minusDM: mDM[i],
      atr: atr[i], sPlusDM: sP[i], sMinusDM: sM[i],   // Wilder-smoothed DM (avg form); ×14 = "DM14" sum form
      plusDI: plusDI[i], minusDI: minusDI[i], dx: dx[i], adx: adx[i]
    }));
  }

  // --- Simple moving average (for the U gate: price > SMA50) ------------------
  function sma(bars, period, field) {
    field = field || 'c';
    const out = new Array(bars.length).fill(null);
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i][field];
      if (i >= period) sum -= bars[i - period][field];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  // --- Swing position sizing (1% risk vs 10% cap; fractional under cap) -------
  function positionSize(o) {
    const stopDist = o.entry - o.stop;
    const riskShares = Math.floor(o.portfolio * o.riskPct / stopDist);
    const capShares  = Math.floor(o.portfolio * o.capPct / o.entry);
    const shares = Math.min(riskShares, capShares);
    const binding = riskShares <= capShares ? 'risk' : 'cap';
    const fracShares = o.portfolio * o.capPct / o.entry; // no floor
    const value = shares * o.entry;
    return {
      riskShares, capShares, shares, binding, fracShares,
      value, weight: value / o.portfolio, stopDist,
      actualRiskPct: binding === 'cap' ? (fracShares * stopDist / o.portfolio) : o.riskPct
    };
  }

  function rr(o) {
    const risk = o.entry - o.stop, reward = o.target - o.entry;
    return { rr: reward / risk, riskPerShare: risk, rewardPerShare: reward };
  }

  function expectancy(o) { // winR / lossR as positive R-multiples
    return { e: o.winPct * o.winR - (1 - o.winPct) * o.lossR };
  }

  function sliceWindow(rows, start, end) {
    return rows.filter(r => r.date >= start && r.date <= end);
  }

  function fmt(n, dp) {
    if (n == null || isNaN(n)) return '–';
    dp = dp == null ? 2 : dp;
    return Number(n).toFixed(dp);
  }

  // --- Regime helpers (for the "read the chart" concept page) ----------------
  // GATES = the 5 context/ranking flags U·A·R·D·V (Stage 2→3 layer), centralized.
  // Source: setups/_SCREENING.md (U=price>SMA50 · A=ADX≥adxMin · R=R:R≥rrMin ·
  // D=+DI>−DI · V=ATR% in [min,max]). NOT the entry gate since canonical_v2
  // (P1 2026-06-11): the real gate is the breakout scan in src/backtest/live.py
  // (4 mandatory + ≥1/2 optional — values mirrored in _kit/canon.js).
  // rrMin 2 = the legacy R-flag floor; an actual breakout trade is fixed at
  // R:R 2.5 by the r2 target rule.
  const GATES = { adxMin: 25, atrPctMin: 1.5, atrPctMax: 4, rrMin: 2 };

  // ATR as % of close — the volatility axis. Null-safe during warmup.
  function atrPct(row) {
    return (row && row.atr != null && row.c) ? row.atr / row.c * 100 : null;
  }

  // Fractal swing pivots over a window: index i is a swing HIGH if its high is the
  // strict max of [i-k .. i+k] (LOW symmetric on lows). Edges (first/last k) skipped.
  function swings(bars, k) {
    k = k || 2;
    const highs = [], lows = [];
    for (let i = k; i < bars.length - k; i++) {
      let isHi = true, isLo = true;
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (bars[j].h >= bars[i].h) isHi = false;
        if (bars[j].l <= bars[i].l) isLo = false;
      }
      if (isHi) highs.push({ i: i, date: bars[i].date, price: bars[i].h });
      if (isLo) lows.push({ i: i, date: bars[i].date, price: bars[i].l });
    }
    return { highs: highs, lows: lows };
  }

  // Classify a window (an adx14() slice) on two axes vs GATES; reads last non-null bar.
  // verdict 'trade' only when trend strong AND volatility in band — same logic the U·A·R·D·V
  // gate uses, so the 2×2 and the gate badges can never disagree.
  function regimeClassify(rows) {
    let r = null;
    for (let i = rows.length - 1; i >= 0; i--) { if (rows[i] && rows[i].adx != null) { r = rows[i]; break; } }
    if (!r) return { ok: false };
    const ap = r.atr / r.c * 100;
    const trend = r.adx >= GATES.adxMin ? 'strong' : 'weak';
    const direction = r.plusDI > r.minusDI ? 'up' : (r.minusDI > r.plusDI ? 'down' : 'side');
    const volInBand = ap >= GATES.atrPctMin && ap <= GATES.atrPctMax;
    return {
      ok: true, date: r.date, adx: r.adx, atrPct: ap,
      trend: trend, direction: direction, volInBand: volInBand,
      verdict: (trend === 'strong' && volInBand) ? 'trade' : 'avoid'
    };
  }

  window.ENGINE = {
    GOOGL,
    WINDOW: { start: '2026-05-19', end: '2026-06-05' },
    META: { symbol: 'GOOGL', source: 'yfinance', as_of: '2026-06-05', currency: 'USD' },
    SWING_HIGH: 408.61,       // 2026-05-18 high — chart level for demos only. LEGACY target frame:
                              // canonical_v2 (2026-06-11) replaced structural targets with r2
                              // (target = entry + rr_gate × risk) — pages may draw this level but
                              // must not teach it as "the target".
    SMA50_AS_OF: null,        // computed on load below
    SIZING_EXAMPLE: {         // Position Sizing demo — canonical_v2: k = 1.5 (breakout ATR-fallback
                              // stop), target = r2. atr/stop/target derived on load below so the
                              // demo always follows the rule instead of a hardcoded level.
      portfolioTHB: 100000, fx: 32.6, portfolioUSD: 3069,
      entry: 368.53, capPct: 0.10, riskPct: 0.01, k: 1.5, rrGate: 2.5,
      atr: null, stop: null, target: null
    },
    GATES,
    trueRange, directionalMovement, wilderSmooth, adx14, sma,
    positionSize, rr, expectancy, sliceWindow, fmt,
    atrPct, swings, regimeClassify
  };

  // convenience: SMA50 at the latest bar (for gate badges)
  window.ENGINE.SMA50_AS_OF = (function () { const s = sma(GOOGL, 50, 'c'); return s[s.length - 1]; })();

  // convenience: SIZING_EXAMPLE levels derived from the last bar's ATR per canonical_v2
  // (fallback stop = entry − k×ATR · target r2 = entry + rrGate × (entry − stop))
  (function () {
    const ex = window.ENGINE.SIZING_EXAMPLE;
    const rows = adx14(GOOGL), last = rows[rows.length - 1];
    ex.atr = last.atr;
    ex.stop = ex.entry - ex.k * last.atr;
    ex.target = ex.entry + ex.rrGate * (ex.entry - ex.stop);
  })();

  // --- dev self-check (console only) ----------------------------------------
  try {
    const s = adx14(GOOGL), at = d => s.find(r => r.date === d);
    console.assert(Math.abs(at('2026-05-29').adx - 40.40) < 0.2, 'ADX 05-29 ~40.40, got', at('2026-05-29').adx);
    console.assert(Math.abs(at('2026-06-05').adx - 30.43) < 0.2, 'ADX 06-05 ~30.43, got', at('2026-06-05').adx);
  } catch (e) { console.warn('engine self-check skipped:', e); }
})();
