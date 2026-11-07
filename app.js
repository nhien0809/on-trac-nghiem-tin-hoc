(function () {
  'use strict';

  var DATA = window.QUIZ_DATA;
  var app = document.getElementById('app');
  var main = document.getElementById('main');
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var LEVEL_NAME = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng' };
  var STORE_KEY = 'ontn-tinhoc-v1';

  // ---------- GSAP (optional: the site works without it) ----------
  var G = window.gsap || null;
  var ST = window.ScrollTrigger || null;
  if (G && ST) G.registerPlugin(ST);
  if (G) G.defaults({ duration: 0.5, ease: 'power3.out' });
  var REDUCE_Q = '(prefers-reduced-motion: reduce)';
  function motionOK() { return !!G && !(window.matchMedia && window.matchMedia(REDUCE_Q).matches); }

  // Every page render gets its own gsap.matchMedia(): its tweens only run when the
  // viewer allows motion, and all of them are reverted before the next render.
  var pageMM = null;
  var listTriggers = [];
  function killListTriggers() {
    listTriggers.forEach(function (t) { t.kill(); });
    listTriggers = [];
  }
  function resetAnimations() {
    if (pageMM) { pageMM.revert(); pageMM = null; }
    killListTriggers();
    if (ST) ST.getAll().forEach(function (t) { t.kill(); });
  }
  function animate(fn) {
    if (!G) return;
    pageMM = pageMM || G.matchMedia();
    pageMM.add('(prefers-reduced-motion: no-preference)', fn, app);
  }
  // Fade/slide list items in as they scroll into view (ScrollTrigger.batch).
  function revealOnScroll(elements) {
    killListTriggers();
    if (!motionOK() || !ST || !elements.length) return;
    G.set(elements, { autoAlpha: 0, y: 22 });
    listTriggers = ST.batch(elements, {
      start: 'top 92%',
      once: true,
      interval: 0.1,
      batchMax: 6,
      onEnter: function (batch) {
        G.to(batch, { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.55, overwrite: true, clearProps: 'transform' });
      }
    });
  }
  function countUp(el, to, duration) {
    var o = { v: 0 };
    return G.to(o, {
      v: to, duration: duration || 1.1, ease: 'power2.out',
      onUpdate: function () { el.textContent = String(Math.round(o.v)); },
      onComplete: function () { el.textContent = String(to); }
    });
  }

  var byId = {};
  DATA.questions.forEach(function (q) { byId[q.id] = q; });
  var weekById = {};
  DATA.weeks.forEach(function (w) { weekById[w.id] = w; });
  var TOTAL_TESTS = DATA.weeks.reduce(function (s, w) { return s + w.tests.length; }, 0);

  // ---------- storage (per-viewer convenience only) ----------
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  var store = loadStore();
  store.best = store.best || {};
  store.prefs = store.prefs || { mode: 'practice', shuffleQ: false, shuffleO: true };

  // ---------- helpers ----------
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fold(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
  function setTitle(t) { document.title = t ? t + ' · Ôn trắc nghiệm Tin học' : 'Ôn trắc nghiệm Tin học GDPT 2018'; }
  function setNav(name) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function render(nodes, focus) {
    resetAnimations();
    app.innerHTML = '';
    nodes.forEach(function (n) { if (n) app.appendChild(n); });
    if (focus !== false) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }
  function levelTag(level) {
    return level ? h('span', { class: 'tag tag--' + level, text: LEVEL_NAME[level] || level }) : null;
  }
  function sourcesText(q) { return 'Nguồn: Nhóm ' + q.sources.join(', '); }
  function testKey(weekId, testId) { return weekId + ':' + testId; }
  function bestBadge(key) {
    var b = store.best[key];
    if (!b) return null;
    return h('span', { class: 'score' + (b.correct === b.total ? ' is-full' : ''), text: b.correct + '/' + b.total });
  }
  function weekNum(w) { return w.label.replace(/^Tuần\s*/, '').replace(/\s*–\s*/, '–'); }
  function weekBadge(w) {
    return h('div', { class: 'week__num', 'aria-hidden': 'true' }, [h('small', { text: 'Tuần' }), h('span', { text: weekNum(w) })]);
  }
  function levelCounts(ids) {
    var c = { NB: 0, TH: 0, VD: 0, x: 0 };
    ids.forEach(function (id) { var l = byId[id].level; if (c[l] !== undefined) c[l]++; else c.x++; });
    return c;
  }
  function doneTests(w) {
    return w.tests.filter(function (_, i) { return store.best[testKey(w.id, i + 1)]; }).length;
  }

  // ---------- pages ----------
  function pageHome() {
    setTitle(''); setNav('home');
    var total = DATA.questions.length;
    var done = DATA.weeks.reduce(function (s, w) { return s + doneTests(w); }, 0);
    var frac = TOTAL_TESTS ? done / TOTAL_TESTS : 0;

    var hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' }, [
      h('span', { class: 'blob blob--1', 'aria-hidden': 'true' }),
      h('span', { class: 'blob blob--2', 'aria-hidden': 'true' }),
      h('span', { class: 'blob blob--3', 'aria-hidden': 'true' }),
      h('div', null, [
        h('span', { class: 'eyebrow', text: '✿ Học phần Tin học · GDPT 2018' }),
        h('h1', { id: 'hero-title', html: 'Ôn trắc nghiệm <em>theo tuần</em>' }),
        h('p', { class: 'lead', text: 'Phân tích chương trình và xây dựng kế hoạch dạy học môn Tin học. Mỗi tuần chia thành các đề ngắn — làm hết các đề là đã ôn đủ mọi câu của tuần.' }),
        h('div', { class: 'actions' }, [
          h('a', { class: 'btn btn--primary', href: '#/start/' + DATA.weeks[0].id + '/1', text: 'Bắt đầu ' + DATA.weeks[0].label }),
          h('a', { class: 'btn', href: '#/start/mix/30', text: 'Đề tổng hợp 30 câu' })
        ])
      ]),
      h('div', { class: 'hero-stats' }, [
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(total), text: String(total) }), h('span', { text: 'câu hỏi không trùng' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(DATA.meta.rawCount), text: String(DATA.meta.rawCount) }), h('span', { text: 'câu trong tài liệu gốc' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(DATA.meta.groups), text: String(DATA.meta.groups) }), h('span', { text: 'nhóm đóng góp' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(TOTAL_TESTS), text: String(TOTAL_TESTS) }), h('span', { text: 'đề theo tuần' })]),
        h('div', { class: 'stat stat--wide' }, [
          h('span', { text: 'Tiến độ của bạn: ' + done + '/' + TOTAL_TESTS + ' đề đã làm' }),
          h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Số đề đã làm', 'aria-valuemin': '0', 'aria-valuemax': String(TOTAL_TESTS), 'aria-valuenow': String(done) }, [
            h('span', { style: 'transform:scaleX(' + frac + ')' })
          ])
        ])
      ])
    ]);

    var list = h('ul', { class: 'weeks' });
    DATA.weeks.forEach(function (w) {
      var c = levelCounts(w.ids);
      var bar = h('div', { class: 'levelbar', role: 'img', 'aria-label': c.NB + ' câu nhận biết, ' + c.TH + ' thông hiểu, ' + c.VD + ' vận dụng' });
      ['NB', 'TH', 'VD', 'x'].forEach(function (l) {
        if (c[l]) bar.appendChild(h('span', { class: 'lv-' + l, style: 'width:' + (c[l] / w.count * 100) + '%' }));
      });
      var tests = h('div', { class: 'week__tests' });
      w.tests.forEach(function (ids, i) {
        var key = testKey(w.id, i + 1);
        tests.appendChild(h('a', { class: 'test-btn' + (store.best[key] ? ' is-done' : ''), href: '#/start/' + w.id + '/' + (i + 1) }, [
          h('span', { class: 'test-btn__top' }, ['Đề ' + (i + 1), bestBadge(key)]),
          h('small', { text: ids.length + ' câu' })
        ]));
      });
      list.appendChild(h('li', { class: 'week' }, [
        h('div', { class: 'week__head' }, [
          weekBadge(w),
          h('div', null, [
            h('h3', { class: 'week__title', text: w.title }),
            h('div', { class: 'week__meta', text: w.count + ' câu · ' + w.tests.length + ' đề · ' + c.NB + ' NB · ' + c.TH + ' TH · ' + c.VD + ' VD' })
          ])
        ]),
        bar,
        tests,
        h('div', { class: 'week__foot' }, [
          h('span', { class: 'muted small', text: 'Đã làm ' + doneTests(w) + '/' + w.tests.length + ' đề' }),
          h('a', { class: 'btn btn--ghost btn--sm', href: '#/start/' + w.id + '/all', text: 'Làm cả tuần (' + w.count + ' câu) →' })
        ])
      ]));
    });

    var mix = h('section', { class: 'panel panel--accent mix', 'aria-labelledby': 'mix-title' }, [
      h('div', null, [
        h('h2', { id: 'mix-title', text: 'Đề tổng hợp ngẫu nhiên' }),
        h('p', { class: 'muted', style: 'margin:0', text: 'Lấy ngẫu nhiên từ tất cả các tuần để ôn tổng trước khi thi.' })
      ]),
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn--primary', href: '#/start/mix/30', text: '30 câu' }),
        h('a', { class: 'btn', href: '#/start/mix/50', text: '50 câu' })
      ])
    ]);

    render([
      hero,
      h('div', { class: 'section-head' }, [
        h('h2', { text: 'Chọn tuần để ôn' }),
        h('div', { class: 'legend', 'aria-hidden': 'true' }, [
          h('span', null, [h('i', { class: 'lv-NB', style: 'background:#f7a8c4' }), 'Nhận biết']),
          h('span', null, [h('i', { style: 'background:#e05891' }), 'Thông hiểu']),
          h('span', null, [h('i', { style: 'background:#9c1f52' }), 'Vận dụng'])
        ])
      ]),
      list,
      mix
    ]);

    animate(function () {
      var tl = G.timeline();
      tl.from('.hero .eyebrow, .hero h1, .hero .lead, .hero .actions', { y: 22, autoAlpha: 0, stagger: 0.08, duration: 0.7 })
        .from('.stat', { y: 18, autoAlpha: 0, scale: 0.96, stagger: 0.06, duration: 0.6 }, '<0.2')
        .from('.meter > span', { scaleX: 0, duration: 1.1, ease: 'power2.out' }, '<0.3');
      app.querySelectorAll('.stat b[data-count]').forEach(function (el) {
        tl.add(countUp(el, parseInt(el.getAttribute('data-count'), 10)), 0.35);
      });
      G.to('.blob--1', { x: -40, y: 30, scale: 1.08, duration: 8, ease: 'sine.inOut', repeat: -1, yoyo: true });
      G.to('.blob--2', { x: 50, y: -24, duration: 9, ease: 'sine.inOut', repeat: -1, yoyo: true });
      G.to('.blob--3', { x: 30, y: -20, scale: 1.15, duration: 7, ease: 'sine.inOut', repeat: -1, yoyo: true });
      G.from('.section-head', { y: 14, autoAlpha: 0, delay: 0.3 });
    });
    revealOnScroll(Array.prototype.slice.call(app.querySelectorAll('.week, .mix')));
  }

  function resolveSet(weekId, testId) {
    if (weekId === 'mix') {
      var n = Math.min(parseInt(testId, 10) || 30, DATA.questions.length);
      return { title: 'Đề tổng hợp · ' + n + ' câu ngẫu nhiên', ids: null, mixCount: n, key: null };
    }
    var w = weekById[weekId];
    if (!w) return null;
    if (testId === 'all') return { title: w.label + ' · Cả tuần', ids: w.ids.slice(), key: testKey(w.id, 'all'), week: w };
    var t = w.tests[parseInt(testId, 10) - 1];
    if (!t) return null;
    return { title: w.label + ' · Đề ' + testId, ids: t.slice(), key: testKey(w.id, testId), week: w };
  }

  function pageStart(weekId, testId) {
    var set = resolveSet(weekId, testId);
    if (!set) return pageNotFound();
    setTitle(set.title); setNav('home');
    var p = store.prefs;
    var count = set.ids ? set.ids.length : set.mixCount;
    function radio(name, value, label, desc) {
      return h('label', { class: 'choice' }, [
        h('input', { type: 'radio', name: name, value: value, checked: p.mode === value }),
        h('span', null, [h('b', { text: label }), h('small', { text: desc })])
      ]);
    }
    function check(name, label, desc) {
      return h('label', { class: 'choice' }, [
        h('input', { type: 'checkbox', name: name, checked: !!p[name] }),
        h('span', null, [h('b', { text: label }), h('small', { text: desc })])
      ]);
    }
    var form = h('form', { class: 'panel' }, [
      h('fieldset', null, [
        h('legend', { text: 'Chế độ làm bài' }),
        h('div', { class: 'choices' }, [
          radio('mode', 'practice', 'Luyện tập', 'Biết đúng/sai và đáp án ngay sau mỗi câu.'),
          radio('mode', 'exam', 'Thi thử', 'Chỉ xem kết quả sau khi nộp bài.')
        ])
      ]),
      h('fieldset', null, [
        h('legend', { text: 'Tùy chọn' }),
        h('div', { class: 'choices' }, [
          check('shuffleQ', 'Xáo trộn câu hỏi', 'Mặc định xếp từ Nhận biết đến Vận dụng.'),
          check('shuffleO', 'Xáo trộn đáp án', 'Nhớ nội dung thay vì nhớ vị trí A/B/C/D.')
        ])
      ]),
      h('div', { class: 'actions' }, [
        h('button', { class: 'btn btn--primary', type: 'submit', text: 'Bắt đầu (' + count + ' câu)' }),
        h('a', { class: 'btn', href: '#/', text: 'Quay lại' })
      ])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      store.prefs = { mode: fd.get('mode') || 'practice', shuffleQ: fd.get('shuffleQ') === 'on', shuffleO: fd.get('shuffleO') === 'on' };
      saveStore(store);
      startQuiz(set, store.prefs);
    });
    render([
      h('a', { class: 'back', href: '#/', text: '← Các tuần' }),
      h('div', { class: 'setup-head' }, [
        set.week ? weekBadge(set.week) : h('div', { class: 'week__num', 'aria-hidden': 'true' }, [h('small', { text: 'Mix' }), h('span', { text: String(count) })]),
        h('div', null, [
          h('h1', { style: 'margin:0', text: set.title }),
          h('p', { class: 'muted', style: 'margin:2px 0 0', text: set.week ? set.week.title : 'Câu hỏi lấy ngẫu nhiên từ tất cả các tuần.' })
        ])
      ]),
      form
    ]);
    animate(function () {
      G.timeline()
        .from('.setup-head > *', { x: -16, autoAlpha: 0, stagger: 0.08 })
        .from('.panel', { y: 24, autoAlpha: 0, duration: 0.6 }, '<0.1')
        .from('.choice', { y: 12, autoAlpha: 0, stagger: 0.05, duration: 0.4 }, '<0.2');
    });
  }

  // ---------- quiz ----------
  var quiz = null;

  function startQuiz(set, prefs) {
    var ids = set.ids;
    if (!ids) ids = shuffle(DATA.questions.map(function (q) { return q.id; })).slice(0, set.mixCount);
    else if (prefs.shuffleQ) ids = shuffle(ids);
    var items = ids.map(function (id) {
      var q = byId[id];
      var order = q.options.map(function (_, i) { return i; });
      if (prefs.shuffleO && !q.fixedOrder) order = shuffle(order);
      return { q: q, order: order, chosen: null };
    });
    quiz = { set: set, prefs: prefs, items: items, idx: 0, submitted: false, prevDone: 0, dir: 1, first: true };
    location.hash = '#/quiz';
  }

  function pageQuiz() {
    if (!quiz) { location.replace('#/'); return; }
    setTitle(quiz.set.title); setNav('home');
    drawQuiz('enter');
  }

  function answeredCount() { return quiz.items.filter(function (it) { return it.chosen !== null; }).length; }

  // anim: 'enter' (new question) | 'answer' (an option was just picked)
  function drawQuiz(anim) {
    var it = quiz.items[quiz.idx];
    var q = it.q;
    var practice = quiz.prefs.mode === 'practice';
    var reveal = practice && it.chosen !== null;
    var total = quiz.items.length;
    var done = answeredCount();

    var opts = h('ol', { class: 'options', 'aria-label': 'Các phương án' });
    it.order.forEach(function (origIdx, pos) {
      var isChosen = it.chosen === origIdx;
      var cls = 'opt';
      var mark = null;
      if (reveal) {
        if (origIdx === q.answer) { cls += ' is-correct'; mark = '✓ Đáp án đúng'; }
        else if (isChosen) { cls += ' is-wrong'; mark = '✗ Bạn chọn'; }
      }
      var btn = h('button', {
        type: 'button', class: cls, 'aria-pressed': (!reveal && isChosen) ? 'true' : 'false',
        disabled: reveal ? true : null,
        onclick: function () { choose(origIdx); }
      }, [
        h('span', { class: 'opt__key', 'aria-hidden': 'true', text: LETTERS[pos] }),
        h('span', null, [h('span', { class: 'sr-only', text: LETTERS[pos] + '. ' }), q.options[origIdx]]),
        mark ? h('span', { class: 'opt__mark', text: mark }) : null
      ]);
      opts.appendChild(h('li', null, [btn]));
    });

    var feedback = null;
    if (reveal) {
      var ok = it.chosen === q.answer;
      var correctPos = it.order.indexOf(q.answer);
      feedback = h('div', { class: 'feedback ' + (ok ? 'feedback--ok' : 'feedback--bad'), role: 'status' },
        [ok ? '✓ Chính xác!' : '✗ Chưa đúng. Đáp án đúng là ' + LETTERS[correctPos] + '.']);
    }

    var isLast = quiz.idx === total - 1;
    var nav = h('div', { class: 'quiz-nav' }, [
      h('button', { type: 'button', class: 'btn', disabled: quiz.idx === 0 ? true : null, onclick: function () { go(quiz.idx - 1); }, text: '← Câu trước' }),
      h('span', { class: 'spacer' }),
      isLast
        ? h('button', { type: 'button', class: 'btn btn--primary', onclick: submit, text: 'Nộp bài' })
        : h('button', { type: 'button', class: 'btn btn--primary', onclick: function () { go(quiz.idx + 1); }, text: 'Câu tiếp →' })
    ]);

    var grid = h('div', { class: 'grid', role: 'navigation', 'aria-label': 'Chuyển nhanh tới câu' });
    quiz.items.forEach(function (x, i) {
      var c = '';
      if (x.chosen !== null) {
        if (practice) c = x.chosen === x.q.answer ? 'is-correct' : 'is-wrong';
        else c = 'is-answered';
      }
      grid.appendChild(h('button', {
        type: 'button', class: c, 'aria-current': i === quiz.idx ? 'true' : null,
        'aria-label': 'Câu ' + (i + 1) + (x.chosen !== null ? ', đã trả lời' : ''),
        onclick: function () { go(i); }, text: String(i + 1)
      }));
    });

    render([
      h('div', { class: 'quiz-head' }, [
        h('h1', { text: quiz.set.title }),
        h('a', { class: 'btn btn--ghost btn--sm', href: '#/', text: 'Thoát' })
      ]),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'Đã trả lời' }, [
        h('span', { style: 'transform:scaleX(' + (done / total) + ')' })
      ]),
      h('div', { class: 'quiz-layout' }, [
        h('div', null, [
          h('section', { class: 'qcard', 'aria-labelledby': 'qtext' }, [
            h('div', { class: 'qmeta' }, [
              h('span', { class: 'qnum', text: 'Câu ' + (quiz.idx + 1) + '/' + total }),
              levelTag(q.level),
              h('span', { text: '· ' + sourcesText(q) })
            ]),
            h('p', { class: 'qtext', id: 'qtext', text: q.q }),
            opts,
            feedback,
            reveal && q.note ? h('div', { class: 'note', text: q.note }) : null
          ]),
          nav,
          h('p', { class: 'kbd-hint', html: 'Phím tắt: <kbd>1</kbd>–<kbd>4</kbd> hoặc <kbd>A</kbd>–<kbd>D</kbd> để chọn, <kbd>←</kbd> <kbd>→</kbd> để chuyển câu.' })
        ]),
        h('aside', { class: 'side', 'aria-label': 'Danh sách câu' }, [
          h('h2', { text: 'Đã trả lời ' + done + '/' + total }),
          grid,
          h('button', { type: 'button', class: 'btn btn--primary', onclick: submit, text: 'Nộp bài' })
        ])
      ])
    ], anim === 'enter');

    var prevFrac = quiz.prevDone / total;
    quiz.prevDone = done;
    var first = quiz.first;
    quiz.first = false;
    var dir = quiz.dir;
    animate(function () {
      if (prevFrac !== done / total) G.from('.progress > span', { scaleX: prevFrac, duration: 0.6, ease: 'power2.out' });
      if (anim === 'enter') {
        var tl = G.timeline();
        tl.from('.qcard', { x: 36 * dir, autoAlpha: 0, duration: 0.45 })
          .from('.qtext', { y: 8, autoAlpha: 0, duration: 0.35 }, '<0.08')
          .from('.opt', { y: 12, autoAlpha: 0, stagger: 0.05, duration: 0.35 }, '<0.08');
        if (first) {
          tl.from('.side', { x: 24, autoAlpha: 0, duration: 0.5 }, 0)
            .from('.grid button', { scale: 0.6, autoAlpha: 0, stagger: { amount: 0.35, from: 'start' }, duration: 0.3, ease: 'back.out(2)' }, 0.15);
        }
        tl.fromTo('.grid button[aria-current="true"]', { scale: 0.8 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'transform' }, 0.1);
      } else if (anim === 'answer') {
        if (reveal) {
          G.fromTo('.opt.is-correct', { scale: 0.97 }, { scale: 1, duration: 0.55, ease: 'back.out(3)', clearProps: 'transform' });
          G.fromTo('.opt.is-correct .opt__key', { scale: 0.4, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.5)' });
          G.fromTo('.opt.is-wrong', { x: 0 }, { x: 7, duration: 0.07, repeat: 5, yoyo: true, ease: 'power1.inOut', clearProps: 'transform' });
          G.from('.feedback', { y: -8, autoAlpha: 0, duration: 0.35 });
          G.from('.opt__mark', { x: 10, autoAlpha: 0, duration: 0.35, delay: 0.1 });
        } else {
          G.fromTo('.opt[aria-pressed="true"] .opt__key', { scale: 0.5 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
        }
        G.fromTo('.grid button[aria-current="true"]', { scale: 0.7 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', clearProps: 'transform' });
      }
    });
  }

  function choose(origIdx) {
    var it = quiz.items[quiz.idx];
    if (quiz.prefs.mode === 'practice' && it.chosen !== null) return;
    it.chosen = origIdx;
    drawQuiz('answer');
  }
  function go(i) {
    if (i < 0 || i >= quiz.items.length || i === quiz.idx) return;
    quiz.dir = i > quiz.idx ? 1 : -1;
    quiz.idx = i;
    drawQuiz('enter');
  }
  function submit() {
    var left = quiz.items.length - answeredCount();
    if (left > 0 && !window.confirm('Còn ' + left + ' câu chưa trả lời. Nộp bài luôn?')) return;
    quiz.submitted = true;
    var correct = quiz.items.filter(function (it) { return it.chosen === it.q.answer; }).length;
    quiz.result = { correct: correct, total: quiz.items.length };
    if (quiz.set.key) {
      var prev = store.best[quiz.set.key];
      if (!prev || correct / quiz.items.length >= prev.correct / prev.total) {
        store.best[quiz.set.key] = { correct: correct, total: quiz.items.length };
        saveStore(store);
      }
    }
    location.hash = '#/result';
  }

  function onKey(e) {
    if (location.hash !== '#/quiz' || !quiz || quiz.submitted) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var it = quiz.items[quiz.idx];
    var k = e.key;
    var pos = -1;
    if (/^[1-6]$/.test(k)) pos = parseInt(k, 10) - 1;
    else if (/^[a-fA-F]$/.test(k)) pos = LETTERS.indexOf(k.toUpperCase());
    if (pos >= 0 && pos < it.order.length) { e.preventDefault(); choose(it.order[pos]); return; }
    if (k === 'ArrowRight') { e.preventDefault(); go(quiz.idx + 1); }
    if (k === 'ArrowLeft') { e.preventDefault(); go(quiz.idx - 1); }
  }

  // ---------- result ----------
  function pageResult() {
    if (!quiz || !quiz.submitted) { location.replace('#/'); return; }
    setTitle('Kết quả'); setNav('home');
    var r = quiz.result;
    var pct = Math.round(r.correct / r.total * 100);
    var skipped = quiz.items.filter(function (x) { return x.chosen === null; }).length;
    var wrongIds = quiz.items.filter(function (it) { return it.chosen !== it.q.answer; }).map(function (it) { return it.q.id; });
    var filter = 'wrong';

    var list = h('ol', { class: 'review' });
    function drawList() {
      list.innerHTML = '';
      quiz.items.forEach(function (it, i) {
        var status = it.chosen === null ? 'skipped' : (it.chosen === it.q.answer ? 'correct' : 'wrong');
        if (filter === 'wrong' && status === 'correct') return;
        var q = it.q;
        var posOf = function (orig) { return LETTERS[it.order.indexOf(orig)]; };
        list.appendChild(h('li', { class: 'review-item is-' + status }, [
          h('div', { class: 'qmeta' }, [h('span', { class: 'qnum', text: 'Câu ' + (i + 1) }), levelTag(q.level), h('span', { text: '· ' + sourcesText(q) })]),
          h('p', { class: 'qtext', style: 'margin-bottom:8px', text: q.q }),
          status !== 'correct'
            ? h('p', { class: 'review-ans ans-bad' }, [h('b', { text: '✗ Bạn chọn: ' }), it.chosen === null ? '(bỏ trống)' : posOf(it.chosen) + '. ' + q.options[it.chosen]])
            : null,
          h('p', { class: 'review-ans ans-ok' }, [h('b', { text: '✓ Đáp án đúng: ' }), posOf(q.answer) + '. ' + q.options[q.answer]]),
          q.note ? h('div', { class: 'note', text: q.note }) : null
        ]));
      });
      if (!list.children.length) list.appendChild(h('li', { class: 'empty', text: 'Không có câu sai nào. Rất tốt! ✿' }));
      revealOnScroll(Array.prototype.slice.call(list.querySelectorAll('.review-item')));
    }
    var chips = h('div', { class: 'filter-row', role: 'group', 'aria-label': 'Lọc danh sách xem lại' });
    function chip(val, label) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': filter === val ? 'true' : 'false', text: label });
      b.addEventListener('click', function () {
        filter = val;
        chips.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        drawList();
      });
      return b;
    }
    chips.appendChild(chip('wrong', 'Câu sai & bỏ trống (' + wrongIds.length + ')'));
    chips.appendChild(chip('all', 'Tất cả (' + r.total + ')'));

    var again = quiz.set;
    var ringNum = h('b', { text: String(r.correct) });
    var ring = h('div', { class: 'ring', style: '--p:' + pct, role: 'img', 'aria-label': 'Đúng ' + r.correct + ' trên ' + r.total + ' câu' }, [
      h('div', null, [h('div', null, [ringNum, h('span', { text: '/' + r.total + ' · ' + pct + '%' })])])
    ]);
    var burst = h('div', { class: 'burst', 'aria-hidden': 'true' });
    render([
      h('a', { class: 'back', href: '#/', text: '← Các tuần' }),
      h('h1', { text: 'Kết quả · ' + quiz.set.title }),
      h('div', { class: 'panel panel--accent' }, [
        h('div', { class: 'result-top' }, [
          burst,
          ring,
          h('div', { class: 'result-text' }, [
            h('p', { class: 'verdict', text: pct >= 80 ? 'Nắm bài rất tốt! ✿' : pct >= 50 ? 'Khá ổn, ôn lại các câu sai nhé.' : 'Cần ôn thêm phần này.' }),
            h('p', { class: 'muted small', style: 'margin:0 0 14px', text: 'Đúng ' + r.correct + ' · Sai ' + (r.total - r.correct - skipped) + ' · Bỏ trống ' + skipped }),
            h('div', { class: 'actions' }, [
              wrongIds.length ? h('button', { type: 'button', class: 'btn btn--primary', onclick: function () {
                startQuiz({ title: 'Làm lại câu sai', ids: wrongIds.slice(), key: null }, quiz.prefs);
              }, text: 'Làm lại ' + wrongIds.length + ' câu sai' }) : null,
              h('button', { type: 'button', class: 'btn', onclick: function () { startQuiz(again, quiz.prefs); }, text: 'Làm lại đề này' }),
              h('a', { class: 'btn btn--ghost', href: '#/', text: 'Chọn đề khác' })
            ])
          ])
        ])
      ]),
      h('h2', { style: 'margin-top:28px', text: 'Xem lại' }),
      chips,
      list
    ]);
    drawList();

    animate(function () {
      var tl = G.timeline();
      tl.from('.panel', { y: 24, autoAlpha: 0, duration: 0.55 })
        .fromTo(ring, { '--p': 0 }, { '--p': pct, duration: 1.3, ease: 'power2.out' }, '<0.15')
        .add(countUp(ringNum, r.correct, 1.3), '<')
        .from('.result-text > *', { x: 16, autoAlpha: 0, stagger: 0.08, duration: 0.45 }, '<0.2');
      if (pct >= 80) {
        var colors = ['#ff7aa8', '#c2306b', '#ffc2a8', '#f7a8c4', '#ffd1e1'];
        for (var i = 0; i < 22; i++) {
          burst.appendChild(h('i', { style: 'background:' + colors[i % colors.length] }));
        }
        tl.fromTo(burst.children, { x: 0, y: 0, scale: 0.4, autoAlpha: 1 }, {
          x: function () { return G.utils.random(-150, 150); },
          y: function () { return G.utils.random(-110, 110); },
          scale: function () { return G.utils.random(0.6, 1.4); },
          autoAlpha: 0, duration: 1.4, ease: 'power3.out', stagger: 0.01
        }, 1.1);
      }
    });
  }

  // ---------- bank ----------
  function pageBank() {
    setTitle('Ngân hàng câu hỏi'); setNav('bank');
    var search = h('input', { type: 'search', placeholder: 'Tìm theo nội dung câu hỏi hoặc đáp án…', 'aria-label': 'Tìm câu hỏi' });
    var weekSel = h('select', { 'aria-label': 'Lọc theo tuần' }, [h('option', { value: '', text: 'Tất cả các tuần' })].concat(
      DATA.weeks.map(function (w) { return h('option', { value: w.id, text: w.label }); })));
    var levelSel = h('select', { 'aria-label': 'Lọc theo mức độ' }, [
      h('option', { value: '', text: 'Mọi mức độ' }),
      h('option', { value: 'NB', text: 'Nhận biết' }), h('option', { value: 'TH', text: 'Thông hiểu' }), h('option', { value: 'VD', text: 'Vận dụng' })
    ]);
    var count = h('p', { class: 'muted small', role: 'status' });
    var list = h('ol', { class: 'bank-list' });
    var timer = null;

    function highlight(text, terms) {
      var safe = escapeHtml(text);
      if (!terms.length) return safe;
      var f = fold(text);
      var marks = [];
      terms.forEach(function (t) {
        var from = 0, i;
        while ((i = f.indexOf(t, from)) !== -1) { marks.push([i, i + t.length]); from = i + t.length; }
      });
      if (!marks.length) return safe;
      marks.sort(function (a, b) { return a[0] - b[0]; });
      var out = '', last = 0;
      marks.forEach(function (m) {
        if (m[0] < last) return;
        out += escapeHtml(text.slice(last, m[0])) + '<mark>' + escapeHtml(text.slice(m[0], m[1])) + '</mark>';
        last = m[1];
      });
      return out + escapeHtml(text.slice(last));
    }

    function draw() {
      var terms = fold(search.value.trim()).split(/\s+/).filter(Boolean);
      var w = weekSel.value, l = levelSel.value;
      var shown = 0;
      list.innerHTML = '';
      var frag = document.createDocumentFragment();
      DATA.weeks.forEach(function (wk) {
        if (w && wk.id !== w) return;
        wk.ids.forEach(function (id) {
          var q = byId[id];
          if (l && q.level !== l) return;
          if (terms.length) {
            var hay = fold(q.q + ' ' + q.options.join(' '));
            for (var t = 0; t < terms.length; t++) if (hay.indexOf(terms[t]) === -1) return;
          }
          shown++;
          var ol = h('ol');
          q.options.forEach(function (o, i) {
            ol.appendChild(h('li', { class: i === q.answer ? 'is-answer' : '' }, [
              h('b', { text: LETTERS[i] + '.' }), h('span', { html: highlight(o, terms) }),
              i === q.answer ? h('span', { class: 'sr-only', text: ' (đáp án đúng)' }) : null
            ]));
          });
          frag.appendChild(h('li', { class: 'bank-item' }, [
            h('div', { class: 'qmeta' }, [h('span', { class: 'qnum', text: wk.label }), levelTag(q.level), h('span', { text: '· ' + sourcesText(q) })]),
            h('p', { class: 'qtext', style: 'margin:0', html: highlight(q.q, terms) }),
            ol,
            q.note ? h('div', { class: 'note', text: q.note }) : null
          ]));
        });
      });
      list.appendChild(frag);
      count.textContent = shown + ' câu';
      if (!shown) list.appendChild(h('li', { class: 'empty', text: 'Không tìm thấy câu nào phù hợp.' }));
      // Animate only the first screenful; hundreds of scroll triggers would cost more than they add.
      killListTriggers();
      if (motionOK()) {
        G.fromTo(Array.prototype.slice.call(list.children, 0, 8), { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, stagger: 0.05, duration: 0.4, overwrite: true, clearProps: 'transform' });
      }
    }
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(draw, 150); });
    weekSel.addEventListener('change', draw);
    levelSel.addEventListener('change', draw);
    render([
      h('span', { class: 'eyebrow', text: '✿ ' + DATA.questions.length + ' câu kèm đáp án' }),
      h('h1', { text: 'Ngân hàng câu hỏi' }),
      h('p', { class: 'lead', text: 'Tra cứu nhanh toàn bộ câu hỏi; đáp án đúng được tô xanh.' }),
      h('div', { class: 'toolbar' }, [search, weekSel, levelSel]),
      count,
      list
    ]);
    animate(function () {
      G.from('.eyebrow, h1, .lead, .toolbar', { y: 16, autoAlpha: 0, stagger: 0.07 });
    });
    draw();
  }

  function pageNotFound() {
    setTitle('Không tìm thấy'); setNav('');
    render([h('h1', { text: 'Không tìm thấy trang' }), h('p', null, [h('a', { href: '#/', text: 'Về trang chủ' })])]);
  }

  // ---------- router ----------
  function route() {
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    switch (parts[0]) {
      case '': return pageHome();
      case 'start': return pageStart(parts[1], parts[2]);
      case 'quiz': return pageQuiz();
      case 'result': return pageResult();
      case 'bank': return pageBank();
      default: return pageNotFound();
    }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  route();
})();
