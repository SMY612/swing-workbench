/* shared/_kit/theme-boot.js — ตั้งธีมก่อน first paint (กัน FOUC)
   ----------------------------------------------------------------------------
   ต้องโหลดเป็น <script> ตัวแรกใน <head> ของทุกหน้า (ก่อน stylesheet ใด ๆ).
   อ่าน preference ที่ผู้ใช้เคยเลือก (key เดียวทั้งเว็บ = sw_theme; fallback ค่า
   เดิมของ board = wb_theme) แล้ว set data-theme บน <html>. ถ้ายังไม่เคยเลือก →
   ใช้ค่า default ของหน้า (attribute data-theme-default).

   ปลอดภัย: ไม่ load-bearing — ถ้าสคริปต์นี้หาย ทุกหน้ายังถูก (board/replay ใส่
   data-theme="dark" ไว้แล้ว; academy/landing ปล่อย bare :root = สว่าง). สคริปต์นี้
   แค่ "ทับด้วยค่าที่ผู้ใช้เลือก" เท่านั้น. */
window.__SW = window.__SW || { key: "sw_theme", legacy: "wb_theme" };
(function () {
  try {
    var el = document.documentElement;
    var saved = null;
    try { saved = localStorage.getItem(window.__SW.key) || localStorage.getItem(window.__SW.legacy); } catch (e) { /* blocked */ }
    if (saved === "light" || saved === "dark") {
      el.setAttribute("data-theme", saved);
    } else {
      var def = el.getAttribute("data-theme-default");
      if (def === "light" || def === "dark") el.setAttribute("data-theme", def);
      /* ไม่มี default → ปล่อย bare :root (tokens.css = สว่าง) */
    }
  } catch (e) { /* ปล่อย default ของหน้า */ }
})();
