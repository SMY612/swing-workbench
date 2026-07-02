/* ============================================================================
   quiz.js — MyInvest Visual Kit · GRADED QUIZ (เครื่องทำแบบทดสอบให้คะแนน)
   ----------------------------------------------------------------------------
   Vanilla · no fetch · no DOM at load (เหมือน kit ตัวอื่น) · ใช้คลาส .qz-* จาก theme.css
   Exposes window.QUIZ.

   ใช้งาน:  QUIZ.mount('#quizHost', QUIZ_BANK)
   BANK  =  { id:"slug-เฉพาะหน้า", pass:0.8, questions:[
              { q:"คำถาม (HTML ได้)", choices:["ก","ข","ค","ง"], answer:0,
                why:"เฉลย + เหตุผล", ref:"ที่มาของกฎ เช่น soul-swing.md §Stop" } ] }

   พฤติกรรม:
   - คลิกตัวเลือก → ล็อกข้อนั้นทันที + feedback: ถูก = ชม + เหตุผล · ผิด = เฉลย + ที่มา
     (ตัวเลือกที่ถูกถูกไฮไลต์เขียวเสมอ เพื่อให้เห็นคำตอบจริง)
   - แถบความคืบหน้า + คะแนนสะสมอัปเดตทุกครั้งที่ตอบ
   - ครบทุกข้อ → สรุป: ผ่านเมื่อคะแนน ≥ pass (default 80%) · ปุ่ม "ทำใหม่"
     สลับทั้งลำดับข้อและลำดับตัวเลือก (Fisher–Yates)
   - best score เก็บ localStorage ราย bank.id (ห่อ try/catch — ถ้าเบราว์เซอร์ไม่ให้ใช้
     บน file:// ก็แค่ไม่โชว์สถิติ ตัว quiz ทำงานปกติ)
   - เนื้อหา bank เป็นไฟล์ใน repo (trusted) → อนุญาต HTML ใน q/why ได้ เช่น <span class="eq">
   ============================================================================ */
(function () {
  var LS_PREFIX = 'myinvest-quiz-';

  function shuffled(n) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function loadBest(id) {
    try { var v = localStorage.getItem(LS_PREFIX + id); return v == null ? null : +v; }
    catch (e) { return null; }
  }
  function saveBest(id, pct) {
    try {
      var old = loadBest(id);
      if (old == null || pct > old) localStorage.setItem(LS_PREFIX + id, String(pct));
    } catch (e) { /* file:// อาจบล็อก storage — ข้ามเงียบ ๆ */ }
  }

  function mount(target, bank) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host || !bank || !bank.questions || !bank.questions.length) return null;
    var pass = bank.pass == null ? 0.8 : bank.pass;
    var total = bank.questions.length;
    var st = { qOrder: [], cOrder: [], picked: {}, answered: 0, correct: 0 };

    function reset() {
      st.qOrder = shuffled(total);
      st.cOrder = bank.questions.map(function (q) { return shuffled(q.choices.length); });
      st.picked = {}; st.answered = 0; st.correct = 0;
      render();
    }

    function render() {
      var html = '<div class="qz-bar"><div class="qz-track">' +
        '<div class="qz-fill" style="width:' + (st.answered / total * 100).toFixed(1) + '%"></div></div>' +
        '<span class="qz-scoretxt">ตอบแล้ว ' + st.answered + '/' + total + ' · ถูก ' + st.correct + '</span></div>';

      html += st.qOrder.map(function (qi, pos) {
        var q = bank.questions[qi];
        var pickedC = st.picked[qi];
        var done = pickedC != null;
        var choices = st.cOrder[qi].map(function (ci, k) {
          var cls = ['qz-choice'];
          if (done) {
            if (ci === q.answer) cls.push('ok');
            else if (ci === pickedC) cls.push('bad');
            else cls.push('dim');
          }
          return '<button type="button" class="' + cls.join(' ') + '" data-q="' + qi + '" data-c="' + ci + '"' +
            (done ? ' disabled' : '') + '>' +
            '<span class="qz-letter">' + String.fromCharCode(65 + k) + '</span><span>' + q.choices[ci] + '</span></button>';
        }).join('');
        var fb = '';
        if (done) {
          var good = pickedC === q.answer;
          fb = '<div class="qz-fb show ' + (good ? 'good' : 'poor') + '">' +
            (good ? '✓ ถูกต้อง — ' : '✗ ยังไม่ใช่ — ') + q.why +
            (q.ref ? '<span class="qz-ref">ที่มา: ' + q.ref + '</span>' : '') + '</div>';
        }
        return '<div class="qz-item card"><div class="qz-q">' + (pos + 1) + '. ' + q.q + '</div>' +
          '<div class="qz-choices">' + choices + '</div>' + fb + '</div>';
      }).join('');

      if (st.answered === total) {
        var pct = Math.round(st.correct / total * 100);
        var ok = (st.correct / total) >= pass;
        var prevBest = loadBest(bank.id);
        saveBest(bank.id, pct);
        html += '<div class="qz-result show">' +
          '<b class="qz-pct ' + (ok ? 'up' : 'flat') + '">' + st.correct + '/' + total + ' (' + pct + '%)</b>' +
          '<span class="pill ' + (ok ? 'g' : 'y') + '">' +
          (ok ? '✓ ผ่าน (เกณฑ์ ≥ ' + Math.round(pass * 100) + '%)'
              : 'ยังไม่ถึงเกณฑ์ ' + Math.round(pass * 100) + '% — อ่านเฉลยด้านบนแล้วลองใหม่ได้เลย') + '</span>' +
          (prevBest != null ? '<div class="tag" style="margin-top:.625rem">สถิติดีสุดรอบก่อน: ' + prevBest + '%</div>' : '') +
          '<br><button type="button" class="qz-retry">ทำใหม่ (สลับข้อ + ตัวเลือก)</button></div>';
      }
      host.innerHTML = html;
    }

    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.qz-choice') : null;
      if (btn && !btn.disabled) {
        var qi = +btn.getAttribute('data-q'), ci = +btn.getAttribute('data-c');
        if (st.picked[qi] == null) {
          st.picked[qi] = ci;
          st.answered++;
          if (ci === bank.questions[qi].answer) st.correct++;
          render();
        }
        return;
      }
      if (e.target.closest && e.target.closest('.qz-retry')) reset();
    });

    reset();
    return { reset: reset, state: st };
  }

  window.QUIZ = { mount: mount };
})();
