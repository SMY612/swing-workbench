# Card "picture-frame" textures (terminal skin)

ภาพเทา halftone/dither ที่ใช้เป็น **"ขอบกรอบรูป"** รอบการ์ดพาเนลดำ ในสกิน terminal
(หน้าสรุปเช้า · `data-skin="terminal"`).

## ใส่รูปยังไง
วางไฟล์ภาพเทา 3 รูปที่นี่ ตั้งชื่อ:

- `f1.jpg`
- `f2.jpg`
- `f3.jpg`

(`.png` ก็ได้ — ถ้าใช้ png บอก Kim เพื่อแก้ url ใน `shared/_kit/skin-terminal.css`)

## ทำงานยังไง
- `shared/_kit/skin-terminal.css` — คลาส `.fr-1/.fr-2/.fr-3` ชี้ไป `frames/f{1,2,3}.jpg`
  วางในแถบ `border` 15px ของการ์ด (เทคนิค `background-clip: border-box`)
- JS ใน`site-src/briefing.html` — สุ่มเติมคลาส `.fr-1/2/3` ให้การ์ดแต่ละใบ → กรอบรูปไม่ซ้ำกัน
- ยังไม่มีไฟล์รูป = สกิน fallback ไปลาย checkerboard อัตโนมัติ (ไม่พัง)

> ไฟล์ในโฟลเดอร์นี้ถูกก๊อปขึ้นเว็บอัตโนมัติโดย `scripts/workbench_publish.py` (copytree `shared/`).
