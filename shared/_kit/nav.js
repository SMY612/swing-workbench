/* shared/_kit/nav.js — ทะเบียนเมนูร่วม (NAV registry) ของ Swing Workbench
   ----------------------------------------------------------------------------
   หัวใจ modular: เพิ่ม/ลบ/เรียงเมนู = แก้ array นี้ที่เดียว → shell.js render
   ทั้ง sidebar (เดสก์ท็อป) + bottom-nav (มือถือ) จากที่นี่อัตโนมัติ

   - id    : ใช้จับคู่กับ <body data-nav="..."> เพื่อทำ active state
   - icon  : ชื่อไอคอน (shell.js มี inline-SVG ให้ — offline ไม่มี icon font)
   - href  : path "เทียบกับ root ของเว็บ" (shell เติม data-shell-root ให้เองต่อหน้า)
   - bottom: true = โผล่ใน bottom-nav มือถือด้วย (จำกัด 3-5 อันที่สำคัญสุด) */
window.NAV = [
  { id: "home",    label: "ภาพรวม",       icon: "home",      href: "index.html",                  bottom: true },
  { id: "briefing",label: "สรุปเช้า",      icon: "briefing",  href: "briefing.html",                bottom: true },
  { id: "board",   label: "กระดานเฝ้าดู",  icon: "board",     href: "workbench/index.html",         bottom: true },
  { id: "replay",  label: "ฝึกย้อนเวลา",   icon: "replay",    href: "workbench/replay.html",        bottom: true },
  { id: "academy", label: "คอร์สกติกา",    icon: "academy",   href: "academy/visuals/index.html",   bottom: true },
];
