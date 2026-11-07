(function () {
  'use strict';

  var DATA = window.QUIZ_DATA;
  var app = document.getElementById('app');
  var main = document.getElementById('main');
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var LEVEL_NAME = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng' };
  var STORE_KEY = 'ontn-tinhoc-v1';

  var byId = {};
  DATA.questions.forEach(function (q) { byId[q.id] = q; });
  var weekById = {};
  DATA.weeks.forEach(function (w) { weekById[w.id] = w; });

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
    app.innerHTML = '';
    nodes.forEach(function (n) { if (n) app.appendChild(n); });
    if (focus !== false) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }
  function levelTag(level) {
    return level ? h('span', { class: 'tag tag--' + level, text: LEVEL_NAME[level] || level }) : null;
  }
  function sourcesText(q) { return 'Nguồn: Nhóm ' + q.sources.join(', '); }
  function testKey(weekId, testId) { return weekId + ':' + testId; }
  function bestBadge(key, total) {
    var b = store.best[key];
    if (!b) return null;
    return h('span', { class: 'score' + (b.correct === b.total ? ' is-full' : ''), text: b.correct + '/' + b.total });
  }

  // ---------- pages ----------
  function pageHome() {
    setTitle(''); setNav('home');
    var total = DATA.questions.length;
    var nodes = [
      h('h1', { text: 'Ôn trắc nghiệm theo tuần' }),
      h('p', { class: 'lead', text: 'Phân tích chương trình và xây dựng kế hoạch dạy học môn Tin học (GDPT 2018). Mỗi tuần được chia thành các đề ngắn; làm hết các đề là đã ôn đủ mọi câu của tuần đó.' }),
      h('ul', { class: 'stats' }, [
        h('li', null, [h('b', { text: String(total) }), h('span', { text: 'câu hỏi không trùng' })]),
        h('li', null, [h('b', { text: String(DATA.meta.rawCount) }), h('span', { text: 'câu trong tài liệu gốc' })]),
        h('li', null, [h('b', { text: String(DATA.meta.groups) }), h('span', { text: 'nhóm đóng góp' })])
      ])
    ];
    var list = h('ul', { class: 'weeks' });
    DATA.weeks.forEach(function (w) {
      var tests = h('div', { class: 'week__tests' });
      w.tests.forEach(function (ids, i) {
        var key = testKey(w.id, i + 1);
        tests.appendChild(h('a', { class: 'btn test-btn', href: '#/start/' + w.id + '/' + (i + 1) }, [
          h('span', null, ['Đề ' + (i + 1) + ' ', bestBadge(key)]),
          h('small', { text: ids.length + ' câu' })
        ]));
      });
      tests.appendChild(h('a', { class: 'btn btn--ghost', href: '#/start/' + w.id + '/all', text: 'Làm cả tuần (' + w.count + ' câu)' }));
      list.appendChild(h('li', { class: 'week' }, [
        h('div', { class: 'week__head' }, [
          h('div', null, [
            h('div', { class: 'week__label', text: w.label }),
            h('h2', { class: 'week__title', text: w.title }),
            h('div', { class: 'week__meta', text: w.count + ' câu · ' + w.tests.length + ' đề · ' + levelSummary(w) })
          ])
        ]),
        tests
      ]));
    });
    nodes.push(list);
    nodes.push(h('div', { class: 'panel', style: 'margin-top:16px' }, [
      h('h2', { text: 'Đề tổng hợp ngẫu nhiên' }),
      h('p', { class: 'muted', style: 'margin:0 0 12px', text: 'Lấy ngẫu nhiên từ tất cả các tuần để ôn tổng.' }),
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn--primary', href: '#/start/mix/30', text: '30 câu ngẫu nhiên' }),
        h('a', { class: 'btn', href: '#/start/mix/50', text: '50 câu ngẫu nhiên' })
      ])
    ]));
    render(nodes);
  }

  function levelSummary(w) {
    var c = { NB: 0, TH: 0, VD: 0 };
    w.ids.forEach(function (id) { var l = byId[id].level; if (c[l] !== undefined) c[l]++; });
    return c.NB + ' NB · ' + c.TH + ' TH · ' + c.VD + ' VD';
  }

  function resolveSet(weekId, testId) {
    if (weekId === 'mix') {
      var n = Math.min(parseInt(testId, 10) || 30, DATA.questions.length);
      return { title: 'Đề tổng hợp · ' + n + ' câu ngẫu nhiên', ids: null, mixCount: n, key: null };
    }
    if (weekId === 'retry') {
      return retrySet ? { title: 'Làm lại câu sai', ids: retrySet.slice(), key: null } : null;
    }
    var w = weekById[weekId];
    if (!w) return null;
    if (testId === 'all') return { title: w.label + ' · Cả tuần', ids: w.ids.slice(), key: testKey(w.id, 'all'), week: w };
    var t = w.tests[parseInt(testId, 10) - 1];
    if (!t) return null;
    return { title: w.label + ' · Đề ' + testId, ids: t.slice(), key: testKey(w.id, testId), week: w };
  }

  var retrySet = null;

  function pageStart(weekId, testId) {
    var set = resolveSet(weekId, testId);
    if (!set) return pageNotFound();
    setTitle(set.title); setNav('home');
    var p = store.prefs;
    var count = set.ids ? set.ids.length : set.mixCount;
    function radio(name, value, label, desc) {
      return h('label', { class: 'choice' }, [
        h('input', { type: 'radio', name: name, value: value, checked: p.mode === value }),
        h('span', null, [label, h('small', { text: desc })])
      ]);
    }
    function check(name, label, desc) {
      return h('label', { class: 'choice' }, [
        h('input', { type: 'checkbox', name: name, checked: !!p[name] }),
        h('span', null, [label, h('small', { text: desc })])
      ]);
    }
    var form = h('form', { class: 'panel' }, [
      h('p', { class: 'muted', style: 'margin-top:0', text: set.week ? set.week.title : 'Câu hỏi lấy từ tất cả các tuần.' }),
      h('fieldset', null, [
        h('legend', { text: 'Chế độ' }),
        radio('mode', 'practice', 'Luyện tập', 'Biết đúng/sai và đáp án ngay sau mỗi câu.'),
        radio('mode', 'exam', 'Thi thử', 'Chỉ xem kết quả sau khi nộp bài.')
      ]),
      h('fieldset', null, [
        h('legend', { text: 'Tùy chọn' }),
        check('shuffleQ', 'Xáo trộn thứ tự câu hỏi', 'Mặc định câu được xếp từ Nhận biết đến Vận dụng.'),
        check('shuffleO', 'Xáo trộn thứ tự đáp án', 'Tránh nhớ vị trí A/B/C/D thay vì nhớ nội dung.')
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
      h('h1', { text: set.title }),
      form
    ]);
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
    quiz = { set: set, prefs: prefs, items: items, idx: 0, submitted: false };
    location.hash = '#/quiz';
  }

  function pageQuiz() {
    if (!quiz) { location.replace('#/'); return; }
    setTitle(quiz.set.title); setNav('home');
    drawQuiz(true);
  }

  function answeredCount() { return quiz.items.filter(function (it) { return it.chosen !== null; }).length; }

  function drawQuiz(focus) {
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
        if (origIdx === q.answer) { cls += ' is-correct'; mark = 'Đáp án đúng'; }
        else if (isChosen) { cls += ' is-wrong'; mark = 'Bạn chọn'; }
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
        [ok ? 'Chính xác!' : 'Chưa đúng. Đáp án đúng là ' + LETTERS[correctPos] + '.']);
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
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: submit, text: 'Nộp bài (' + done + '/' + total + ')' })
      ]),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'Đã trả lời' }, [
        h('span', { style: 'width:' + (done / total * 100) + '%' })
      ]),
      h('section', { class: 'qcard', 'aria-labelledby': 'qtext' }, [
        h('div', { class: 'qmeta' }, [
          h('span', { text: 'Câu ' + (quiz.idx + 1) + '/' + total }),
          levelTag(q.level),
          h('span', { text: '· ' + sourcesText(q) })
        ]),
        h('p', { class: 'qtext', id: 'qtext', text: q.q }),
        opts,
        feedback,
        reveal && q.note ? h('div', { class: 'note', text: q.note }) : null
      ]),
      nav,
      grid,
      h('p', { class: 'kbd-hint', html: 'Phím tắt: <kbd>1</kbd>–<kbd>4</kbd> hoặc <kbd>A</kbd>–<kbd>D</kbd> để chọn, <kbd>←</kbd> <kbd>→</kbd> để chuyển câu.' })
    ], focus);
  }

  function choose(origIdx) {
    var it = quiz.items[quiz.idx];
    if (quiz.prefs.mode === 'practice' && it.chosen !== null) return;
    it.chosen = origIdx;
    drawQuiz(false);
  }
  function go(i) {
    if (i < 0 || i >= quiz.items.length) return;
    quiz.idx = i;
    drawQuiz(true);
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
          h('div', { class: 'qmeta' }, [h('span', { text: 'Câu ' + (i + 1) }), levelTag(q.level), h('span', { text: '· ' + sourcesText(q) })]),
          h('p', { class: 'qtext', style: 'margin-bottom:8px', text: q.q }),
          status !== 'correct'
            ? h('p', { class: 'review-ans ans-bad' }, [h('b', { text: 'Bạn chọn: ' }), it.chosen === null ? '(bỏ trống)' : posOf(it.chosen) + '. ' + q.options[it.chosen]])
            : null,
          h('p', { class: 'review-ans ans-ok' }, [h('b', { text: 'Đáp án đúng: ' }), posOf(q.answer) + '. ' + q.options[q.answer]]),
          q.note ? h('div', { class: 'note', text: q.note }) : null
        ]));
      });
      if (!list.children.length) list.appendChild(h('li', { class: 'empty', text: 'Không có câu sai nào. Rất tốt!' }));
    }
    var chips = h('div', { class: 'filter-row', role: 'group', 'aria-label': 'Lọc danh sách xem lại' });
    function chip(val, label) {
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': filter === val ? 'true' : 'false', onclick: function () {
        filter = val;
        chips.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === this ? 'true' : 'false'); }, this);
        drawList();
      }, text: label });
    }
    chips.appendChild(chip('wrong', 'Câu sai & bỏ trống (' + wrongIds.length + ')'));
    chips.appendChild(chip('all', 'Tất cả (' + r.total + ')'));
    drawList();

    var again = quiz.set;
    render([
      h('a', { class: 'back', href: '#/', text: '← Các tuần' }),
      h('h1', { text: 'Kết quả · ' + quiz.set.title }),
      h('div', { class: 'panel' }, [
        h('div', { class: 'result-top' }, [
          h('div', { class: 'ring', style: '--p:' + pct, role: 'img', 'aria-label': 'Đúng ' + r.correct + ' trên ' + r.total + ' câu' }, [
            h('div', null, [h('div', null, [h('b', { text: r.correct + '/' + r.total }), h('span', { text: pct + '%' })])])
          ]),
          h('div', null, [
            h('p', { style: 'margin:0 0 4px;font-weight:600', text: pct >= 80 ? 'Nắm bài tốt.' : pct >= 50 ? 'Khá ổn, ôn lại các câu sai nhé.' : 'Cần ôn thêm phần này.' }),
            h('p', { class: 'muted small', style: 'margin:0 0 12px', text: 'Sai ' + (r.total - r.correct - quiz.items.filter(function (x) { return x.chosen === null; }).length) + ' · Bỏ trống ' + quiz.items.filter(function (x) { return x.chosen === null; }).length }),
            h('div', { class: 'actions' }, [
              wrongIds.length ? h('button', { type: 'button', class: 'btn btn--primary', onclick: function () {
                retrySet = wrongIds; startQuiz({ title: 'Làm lại câu sai', ids: wrongIds.slice(), key: null }, quiz.prefs);
              }, text: 'Làm lại ' + wrongIds.length + ' câu sai' }) : null,
              h('button', { type: 'button', class: 'btn', onclick: function () { startQuiz(again, quiz.prefs); }, text: 'Làm lại đề này' }),
              h('a', { class: 'btn btn--ghost', href: '#/', text: 'Chọn đề khác' })
            ])
          ])
        ])
      ]),
      h('h2', { style: 'margin-top:24px', text: 'Xem lại' }),
      chips,
      list
    ]);
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
            h('div', { class: 'qmeta' }, [h('span', { text: wk.label }), levelTag(q.level), h('span', { text: '· ' + sourcesText(q) })]),
            h('p', { class: 'qtext', style: 'margin:0', html: highlight(q.q, terms) }),
            ol,
            q.note ? h('div', { class: 'note', text: q.note }) : null
          ]));
        });
      });
      list.appendChild(frag);
      count.textContent = shown + ' câu';
      if (!shown) list.appendChild(h('li', { class: 'empty', text: 'Không tìm thấy câu nào phù hợp.' }));
    }
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(draw, 150); });
    weekSel.addEventListener('change', draw);
    levelSel.addEventListener('change', draw);
    render([
      h('h1', { text: 'Ngân hàng câu hỏi' }),
      h('p', { class: 'lead', text: 'Toàn bộ câu hỏi kèm đáp án (tô xanh), dùng để tra cứu nhanh.' }),
      h('div', { class: 'toolbar' }, [search, weekSel, levelSel]),
      count,
      list
    ]);
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
