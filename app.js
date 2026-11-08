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

  // ---------- storage ----------
  // Khách: localStorage[STORE_KEY]. Đã đăng nhập: Firestore users/{uid}, kèm bản sao trên máy
  // (localStorage[STORE_KEY + ':u:' + uid]) để mở trang là thấy ngay.
  var Cloud = window.Cloud && window.Cloud.enabled ? window.Cloud : null;
  var LAST_UID_KEY = 'ontn-last-uid';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function keyFor(uid) { return uid ? STORE_KEY + ':u:' + uid : STORE_KEY; }
  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    s.best = s.best || {};
    s.prefs = s.prefs || { mode: 'practice', shuffleQ: false, shuffleO: true };
    s.wrong = s.wrong || {};     // question id -> { n: số lần sai, t: lần cuối }
    s.video = s.video || {};     // số video -> { t: vị trí (giây), done: đã xem hết }
    s.history = s.history || []; // [{ t, title, c, n, mode }]
    Object.keys(s.wrong).forEach(function (id) { if (!byId[id]) delete s.wrong[id]; });
    return s;
  }
  function readLocal(uid) {
    try { return normalize(JSON.parse(lsGet(keyFor(uid)))); } catch (e) { return normalize(null); }
  }
  function hasProgress(s) {
    return Object.keys(s.best).length || Object.keys(s.wrong).length || Object.keys(s.video).length || s.history.length;
  }
  var currentUid = Cloud ? lsGet(LAST_UID_KEY) : null;
  var store = readLocal(currentUid);
  function saveStore(s, urgent) {
    lsSet(keyFor(currentUid), JSON.stringify(s));
    if (Cloud && currentUid) Cloud.save(currentUid, s, urgent);
  }
  // Gộp tiến độ khách vào tài khoản (lấy kết quả tốt hơn, hợp danh sách câu sai…)
  function mergeInto(acc, g) {
    Object.keys(g.best).forEach(function (k) {
      var a = acc.best[k], b = g.best[k];
      if (!a || b.correct / b.total > a.correct / a.total) acc.best[k] = b;
    });
    Object.keys(g.wrong).forEach(function (id) {
      var a = acc.wrong[id], b = g.wrong[id];
      acc.wrong[id] = a ? { n: Math.max(a.n, b.n), t: Math.max(a.t, b.t) } : b;
    });
    Object.keys(g.video).forEach(function (n) {
      var a = acc.video[n] || {}, b = g.video[n];
      acc.video[n] = { t: Math.max(a.t || 0, b.t || 0), done: !!(a.done || b.done) };
    });
    acc.history = acc.history.concat(g.history).sort(function (x, y) { return y.t - x.t; }).slice(0, 300);
    return acc;
  }

  // Ghi nhận một câu trả lời: sai -> thêm vào sổ câu sai; đúng -> gỡ khỏi sổ (đã thuộc).
  function recordAnswer(q, chosen) {
    if (chosen === null || chosen === undefined) return;
    if (chosen !== q.answer) {
      var prev = store.wrong[q.id];
      store.wrong[q.id] = { n: (prev ? prev.n : 0) + 1, t: Date.now() };
    } else if (store.wrong[q.id]) {
      delete store.wrong[q.id];
    }
  }
  function wrongIds(weekFilter) {
    return DATA.questions.filter(function (q) {
      return store.wrong[q.id] && (!weekFilter || weekFilter.indexOf(q.week) !== -1);
    }).map(function (q) { return q.id; });
  }
  function updateNavCount() {
    var el = document.querySelector('[data-wrong-count]');
    if (!el) return;
    var n = wrongIds().length;
    el.textContent = n ? String(n) : '';
    el.hidden = !n;
  }

  // ---------- videos ----------
  var VIDEOS = [
    { file: 'Video1_Dac_diem_mon_hoc.mp4', title: 'Đặc điểm môn học', week: '1', dur: 807 },
    { file: 'Video2_Muc_tieu_chuong_trinh.mp4', title: 'Mục tiêu chương trình', week: '1', dur: 610 },
    { file: 'Video3_Yeu_cau_can_dat.mp4', title: 'Yêu cầu cần đạt', week: '3', dur: 621 },
    { file: 'Video4_Noi_dung_giao_duc.mp4', title: 'Nội dung giáo dục', week: '3', dur: 1074 },
    { file: 'Video5_Phuong_phap_va_Danh_gia.mp4', title: 'Phương pháp và đánh giá', week: '4', dur: 786 },
    { file: 'Video6_Phuong_phap_giao_duc_slide.mp4', title: 'Phương pháp giáo dục (bài giảng slide)', week: '4', dur: 495 }
  ];
  // Video nặng (~160 MB) chỉ đặt trên GitHub Pages; bản trên Firebase Hosting tải video từ đó
  // để không vượt hạn mức tải 360 MB/ngày của gói miễn phí.
  var VIDEO_BASE = /(^|\.)github\.io$|^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'videos/' : 'https://nhien0809.github.io/on-trac-nghiem-tin-hoc/videos/';
  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function videoState(n) {
    var v = store.video[n];
    if (!v) return null;
    if (v.done) return { cls: 'is-done', text: '✓ Đã xem' };
    if (v.t > 5) return { cls: 'is-part', text: 'Đã xem tới ' + fmtTime(v.t) };
    return null;
  }

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
    updateNavCount();
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

  // Giải thích tham khảo (data/explanations.js). collapsed = dạng thu gọn (ngân hàng câu hỏi).
  var EXPLAIN = window.QUIZ_EXPLAIN || {};
  function explainEl(q, collapsed) {
    var text = EXPLAIN[q.id];
    if (!text) return null;
    var label = h('span', { class: 'explain__label', text: '💡 Giải thích (tham khảo)' });
    if (collapsed) {
      return h('details', { class: 'explain explain--fold' }, [
        h('summary', null, [label]),
        h('p', { text: text })
      ]);
    }
    return h('div', { class: 'explain' }, [label, h('p', { text: text })]);
  }
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
          h('a', { class: 'btn', href: '#/start/mix', text: 'Đề tổng hợp' }),
          h('a', { class: 'btn btn--ghost', href: '#/videos', text: '▶ Video bài giảng' })
        ])
      ]),
      h('div', { class: 'hero-stats' }, [
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(total), text: String(total) }), h('span', { text: 'câu hỏi không trùng' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(DATA.meta.rawCount), text: String(DATA.meta.rawCount) }), h('span', { text: 'câu trong tài liệu gốc' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(DATA.meta.groups), text: String(DATA.meta.groups) }), h('span', { text: 'nhóm đóng góp' })]),
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(TOTAL_TESTS), text: String(TOTAL_TESTS) }), h('span', { text: 'đề theo tuần' })]),
        h('div', { class: 'stat stat--wide' }, [
          h('div', { class: 'stat__row' }, [
            h('span', { text: 'Tiến độ' + (Cloud && Cloud.user() ? ' của ' + (Cloud.user().name || 'bạn') : ' của bạn') + ': ' + done + '/' + TOTAL_TESTS + ' đề đã làm' }),
            h('a', { href: '#/history', text: 'Lịch sử →' })
          ]),
          h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Số đề đã làm', 'aria-valuemin': '0', 'aria-valuemax': String(TOTAL_TESTS), 'aria-valuenow': String(done) }, [
            h('span', { style: 'transform:scaleX(' + frac + ')' })
          ])
        ])
      ])
    ]);

    var list = h('ul', { class: 'weeks' });
    DATA.weeks.forEach(function (w) {
      var c = levelCounts(w.ids);
      var vids = VIDEOS.filter(function (v) { return v.week === w.id; });
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
        vids.length ? h('div', { class: 'week__videos' }, vids.map(function (v) {
          var n = VIDEOS.indexOf(v) + 1;
          var st = videoState(n);
          return h('a', { class: 'vid-link' + (st ? ' ' + st.cls : ''), href: '#/video/' + n }, [
            h('span', { class: 'vid-link__play', 'aria-hidden': 'true', text: st && st.cls === 'is-done' ? '✓' : '▶' }),
            h('span', { class: 'vid-link__title', text: 'Video ' + n + ' · ' + v.title }),
            h('small', { text: fmtTime(v.dur) })
          ]);
        })) : null,
        tests,
        h('div', { class: 'week__foot' }, [
          h('span', { class: 'muted small', text: 'Đã làm ' + doneTests(w) + '/' + w.tests.length + ' đề' }),
          h('a', { class: 'btn btn--ghost btn--sm', href: '#/start/' + w.id + '/all', text: 'Làm cả tuần (' + w.count + ' câu) →' })
        ])
      ]));
    });

    var nWrong = wrongIds().length;
    var extras = h('div', { class: 'extras' }, [
      h('section', { class: 'panel panel--accent mix', 'aria-labelledby': 'mix-title' }, [
        h('div', null, [
          h('h2', { id: 'mix-title', text: 'Đề tổng hợp ngẫu nhiên' }),
          h('p', { class: 'muted', style: 'margin:0', text: 'Tự chọn số câu và các tuần muốn ôn; câu hỏi được lấy ngẫu nhiên.' })
        ]),
        h('div', { class: 'actions' }, [
          h('a', { class: 'btn btn--primary', href: '#/start/mix', text: 'Tạo đề tổng hợp' })
        ])
      ]),
      h('section', { class: 'panel mix', 'aria-labelledby': 'wrong-title' }, [
        h('div', null, [
          h('h2', { id: 'wrong-title' }, ['Câu sai của bạn ', h('span', { class: 'count-pill' + (nWrong ? '' : ' is-zero'), text: String(nWrong) })]),
          h('p', { class: 'muted', style: 'margin:0', text: nWrong
            ? 'Xem lại đáp án và làm lại những câu đã trả lời sai. Trả lời đúng thì câu tự rời khỏi danh sách.'
            : 'Chưa có câu sai nào. Câu bạn trả lời sai sẽ tự được lưu vào đây để ôn lại.' })
        ]),
        h('div', { class: 'actions' }, [
          h('a', { class: 'btn' + (nWrong ? ' btn--primary' : ''), href: '#/wrong', text: 'Xem lại câu sai' }),
          nWrong ? h('a', { class: 'btn', href: '#/start/wrong', text: 'Làm lại' }) : null
        ])
      ])
    ]);

    var vgrid = h('ul', { class: 'vgrid' }, VIDEOS.map(function (v, i) { return videoCard(v, i + 1); }));

    render([
      hero,
      h('div', { class: 'section-head' }, [h('h2', { text: 'Chọn tuần để ôn' })]),
      list,
      extras,
      h('div', { class: 'section-head', style: 'margin-top:32px' }, [
        h('h2', { text: 'Video bài giảng' }),
        h('a', { class: 'btn btn--ghost btn--sm', href: '#/videos', text: 'Xem tất cả →' })
      ]),
      vgrid
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
    revealOnScroll(Array.prototype.slice.call(app.querySelectorAll('.week, .mix, .vcard')));
  }

  function videoCard(v, n) {
    var st = videoState(n);
    var w = weekById[v.week];
    return h('li', { class: 'vcard' + (st ? ' ' + st.cls : '') }, [
      h('a', { href: '#/video/' + n }, [
        h('div', { class: 'vcard__thumb' }, [
          h('img', { src: VIDEO_BASE + 'thumbs/v' + n + '.png', alt: '', loading: 'lazy', width: '640', height: '360' }),
          h('span', { class: 'vcard__play', 'aria-hidden': 'true', text: '▶' }),
          h('span', { class: 'vcard__dur', text: fmtTime(v.dur) })
        ]),
        h('div', { class: 'vcard__body' }, [
          h('small', { text: 'Video ' + n + (w ? ' · ' + w.label : '') }),
          h('h3', { text: v.title }),
          st ? h('span', { class: 'vcard__state', text: st.text }) : null
        ])
      ])
    ]);
  }

  // Bộ câu "chọn số câu": lấy ngẫu nhiên n câu từ một kho (pool), có thể lọc theo tuần.
  var retryPool = null; // câu sai của lần nộp bài gần nhất
  function resolveSet(weekId, testId) {
    if (weekId === 'mix') {
      return { kind: 'mix', title: 'Đề tổng hợp', badge: 'Mix', desc: 'Câu hỏi lấy ngẫu nhiên từ các tuần bạn chọn.',
        pool: function (weeks) { return DATA.questions.filter(function (q) { return weeks.indexOf(q.week) !== -1; }).map(function (q) { return q.id; }); },
        weekPick: true, defaultCount: parseInt(testId, 10) || 30 };
    }
    if (weekId === 'wrong') {
      return { kind: 'wrong', title: 'Làm lại câu sai', badge: 'Sai', desc: 'Lấy từ danh sách câu bạn đã trả lời sai. Trả lời đúng thì câu tự rời khỏi danh sách.',
        pool: function (weeks) { return wrongIds(weeks); }, weekPick: true, defaultCount: parseInt(testId, 10) || 20 };
    }
    if (weekId === 'retry') {
      if (!retryPool || !retryPool.ids.length) return null;
      return { kind: 'retry', title: 'Làm lại câu sai', badge: 'Sai', desc: 'Các câu sai và bỏ trống của bài “' + retryPool.from + '”.',
        pool: function () { return retryPool.ids.slice(); }, weekPick: false, defaultCount: retryPool.ids.length };
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
    setTitle(set.title); setNav(set.kind === 'wrong' || set.kind === 'retry' ? 'wrong' : 'home');
    var p = store.prefs;
    var isPool = !!set.pool;
    var count = isPool ? 0 : set.ids.length;
    var startBtn = h('button', { class: 'btn btn--primary', type: 'submit' });

    // --- số câu + chọn tuần (chỉ cho đề tổng hợp / làm lại câu sai) ---
    var poolBox = null, numInput = null, poolInfo = null, presetRow = null, weekBoxes = [];
    function selectedWeeks() {
      if (!set.weekPick) return null;
      return weekBoxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    }
    function currentPool() { return set.pool(selectedWeeks()); }
    function syncCount(fromUser) {
      var max = currentPool().length;
      numInput.max = String(Math.max(1, max));
      var v = parseInt(numInput.value, 10);
      if (isNaN(v) && !fromUser) v = Math.min(set.defaultCount, max);
      if (isNaN(v)) {
        count = 0; // ô đang trống khi người dùng gõ
      } else {
        v = Math.max(max ? 1 : 0, Math.min(v, max));
        if (String(v) !== numInput.value) numInput.value = String(v);
        count = v;
      }
      poolInfo.textContent = max ? 'Có ' + max + ' câu phù hợp — chọn từ 1 đến ' + max + ' câu.' : 'Không có câu nào phù hợp. Hãy chọn thêm tuần.';
      presetRow.querySelectorAll('.chip').forEach(function (c) {
        var n = c.getAttribute('data-n') === 'all' ? max : parseInt(c.getAttribute('data-n'), 10);
        c.hidden = c.getAttribute('data-n') !== 'all' && n >= max;
        c.setAttribute('aria-pressed', n === count ? 'true' : 'false');
        if (c.getAttribute('data-n') === 'all') c.textContent = 'Tất cả (' + max + ')';
      });
      startBtn.textContent = 'Bắt đầu (' + count + ' câu)';
      startBtn.disabled = !count;
    }
    if (isPool) {
      numInput = h('input', { type: 'number', class: 'num-input', id: 'qcount', min: '1', inputmode: 'numeric', value: String(set.defaultCount) });
      numInput.addEventListener('input', function () { syncCount(true); });
      numInput.addEventListener('change', function () { syncCount(false); });
      presetRow = h('div', { class: 'filter-row', role: 'group', 'aria-label': 'Chọn nhanh số câu' });
      [10, 20, 30, 50, 'all'].forEach(function (n) {
        presetRow.appendChild(h('button', { type: 'button', class: 'chip', 'data-n': String(n), text: n === 'all' ? 'Tất cả' : n + ' câu',
          onclick: function () { numInput.value = String(n === 'all' ? currentPool().length : n); syncCount(false); } }));
      });
      poolInfo = h('p', { class: 'muted small', style: 'margin:8px 0 0', role: 'status' });
      var weekField = null;
      if (set.weekPick) {
        var wl = h('div', { class: 'week-picks' });
        DATA.weeks.forEach(function (w) {
          var avail = set.pool([w.id]).length;
          var cb = h('input', { type: 'checkbox', value: w.id, checked: avail ? true : null, disabled: avail ? null : true });
          cb.addEventListener('change', function () { syncCount(false); });
          weekBoxes.push(cb);
          wl.appendChild(h('label', { class: 'week-pick' + (avail ? '' : ' is-empty') }, [cb, h('span', null, [h('b', { text: w.label }), h('small', { text: avail + ' câu' })])]));
        });
        weekField = h('fieldset', null, [h('legend', { text: 'Lấy câu từ các tuần' }), wl]);
      }
      poolBox = h('div', null, [
        h('fieldset', null, [
          h('legend', null, [h('label', { for: 'qcount', text: 'Số câu hỏi' })]),
          h('div', { class: 'count-row' }, [numInput, presetRow]),
          poolInfo
        ]),
        weekField
      ]);
    }
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
    var form = h('form', { class: 'panel', novalidate: true }, [
      poolBox,
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
          isPool ? null : check('shuffleQ', 'Xáo trộn câu hỏi', 'Mặc định xếp từ Nhận biết đến Vận dụng.'),
          check('shuffleO', 'Xáo trộn đáp án', 'Nhớ nội dung thay vì nhớ vị trí A/B/C/D.')
        ])
      ]),
      h('div', { class: 'actions' }, [
        startBtn,
        h('a', { class: 'btn', href: set.kind === 'wrong' ? '#/wrong' : '#/', text: 'Quay lại' })
      ])
    ]);
    if (isPool) syncCount(false);
    else startBtn.textContent = 'Bắt đầu (' + count + ' câu)';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      store.prefs = {
        mode: fd.get('mode') || 'practice',
        shuffleQ: isPool ? store.prefs.shuffleQ : fd.get('shuffleQ') === 'on',
        shuffleO: fd.get('shuffleO') === 'on'
      };
      saveStore(store);
      if (isPool) {
        syncCount(false);
        if (!count) return;
        var ids = shuffle(currentPool()).slice(0, count);
        startQuiz({ kind: set.kind, title: set.title + ' · ' + count + ' câu', ids: ids, key: null }, store.prefs);
      } else {
        startQuiz(set, store.prefs);
      }
    });
    render([
      h('a', { class: 'back', href: set.kind === 'wrong' ? '#/wrong' : '#/', text: set.kind === 'wrong' ? '← Câu sai của bạn' : '← Các tuần' }),
      h('div', { class: 'setup-head' }, [
        set.week ? weekBadge(set.week) : h('div', { class: 'week__num', 'aria-hidden': 'true' }, [h('span', { text: set.badge || 'Mix' })]),
        h('div', null, [
          h('h1', { style: 'margin:0', text: set.title }),
          h('p', { class: 'muted', style: 'margin:2px 0 0', text: set.week ? set.week.title : set.desc })
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
            reveal ? explainEl(q) : null,
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
          G.from('.qcard .explain', { y: -6, autoAlpha: 0, duration: 0.4, delay: 0.12 });
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
    if (quiz.prefs.mode === 'practice') { recordAnswer(it.q, origIdx); saveStore(store); updateNavCount(); }
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
    if (quiz.prefs.mode !== 'practice') quiz.items.forEach(function (it) { recordAnswer(it.q, it.chosen); });
    if (quiz.set.key) {
      var prev = store.best[quiz.set.key];
      if (!prev || correct / quiz.items.length >= prev.correct / prev.total) {
        store.best[quiz.set.key] = { correct: correct, total: quiz.items.length };
      }
    }
    store.history.unshift({ t: Date.now(), title: quiz.set.title, c: correct, n: quiz.items.length, mode: quiz.prefs.mode });
    if (store.history.length > 300) store.history.length = 300;
    saveStore(store, true);
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
    var missIds = quiz.items.filter(function (it) { return it.chosen !== it.q.answer; }).map(function (it) { return it.q.id; });
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
          explainEl(q),
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
    chips.appendChild(chip('wrong', 'Câu sai & bỏ trống (' + missIds.length + ')'));
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
              missIds.length ? h('button', { type: 'button', class: 'btn btn--primary', onclick: function () {
                retryPool = { ids: missIds.slice(), from: quiz.set.title };
                location.hash = '#/start/retry';
              }, text: 'Làm lại ' + missIds.length + ' câu sai' }) : null,
              h('button', { type: 'button', class: 'btn', onclick: function () {
                if (again.kind === 'mix' || again.kind === 'wrong') { location.hash = '#/start/' + again.kind; return; }
                startQuiz(again, quiz.prefs);
              }, text: again.kind === 'mix' || again.kind === 'wrong' ? 'Tạo đề mới' : 'Làm lại đề này' }),
              h('a', { class: 'btn btn--ghost', href: '#/wrong', text: 'Sổ câu sai' })
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
            explainEl(q, true),
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

  // ---------- sổ câu sai ----------
  function pageWrong() {
    setTitle('Câu sai của bạn'); setNav('wrong');
    var filter = '';
    var list = h('ol', { class: 'bank-list' });
    var head = h('div', { class: 'wrong-head panel panel--accent' });
    var chips = h('div', { class: 'filter-row', role: 'group', 'aria-label': 'Lọc theo tuần' });

    function drawHead() {
      var all = wrongIds();
      head.innerHTML = '';
      head.appendChild(h('div', null, [
        h('p', { class: 'big-num' }, [h('b', { text: String(all.length) }), ' câu đang cần ôn lại']),
        h('p', { class: 'muted small', style: 'margin:0', text: all.length
          ? 'Mỗi câu trả lời sai sẽ được lưu ở đây (trên trình duyệt này). Làm lại mà trả lời đúng thì câu đó tự được gỡ khỏi danh sách.'
          : 'Chưa có câu sai nào. Hãy làm một đề — câu nào trả lời sai sẽ tự xuất hiện ở đây.' })
      ]));
      head.appendChild(h('div', { class: 'actions' }, all.length ? [
        h('a', { class: 'btn btn--primary', href: '#/start/wrong', text: 'Làm lại câu sai…' }),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: function () {
          if (!window.confirm('Xoá toàn bộ ' + all.length + ' câu khỏi danh sách câu sai?')) return;
          store.wrong = {}; saveStore(store); updateNavCount(); drawAll();
        }, text: 'Xoá danh sách' })
      ] : [h('a', { class: 'btn btn--primary', href: '#/', text: 'Chọn đề để làm' })]));
    }
    function drawChips() {
      chips.innerHTML = '';
      var all = wrongIds();
      if (!all.length) return;
      var opts = [{ id: '', label: 'Tất cả (' + all.length + ')' }];
      DATA.weeks.forEach(function (w) {
        var n = wrongIds([w.id]).length;
        if (n) opts.push({ id: w.id, label: w.label + ' (' + n + ')' });
      });
      if (filter && !opts.some(function (o) { return o.id === filter; })) filter = '';
      opts.forEach(function (o) {
        chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': filter === o.id ? 'true' : 'false', text: o.label,
          onclick: function () { filter = o.id; drawChips(); drawList(); } }));
      });
    }
    function drawList() {
      list.innerHTML = '';
      var ids = wrongIds(filter ? [filter] : null);
      ids.sort(function (a, b) { return (store.wrong[b].n - store.wrong[a].n) || (store.wrong[b].t - store.wrong[a].t); });
      ids.forEach(function (id) {
        var q = byId[id];
        var rec = store.wrong[id];
        var ol = h('ol');
        q.options.forEach(function (o, i) {
          ol.appendChild(h('li', { class: i === q.answer ? 'is-answer' : '' }, [
            h('b', { text: LETTERS[i] + '.' }), h('span', { text: o }),
            i === q.answer ? h('span', { class: 'sr-only', text: ' (đáp án đúng)' }) : null
          ]));
        });
        var item = h('li', { class: 'bank-item review-item is-wrong' }, [
          h('div', { class: 'qmeta' }, [
            h('span', { class: 'qnum', text: weekById[q.week].label }), levelTag(q.level),
            h('span', { class: 'miss-count', text: 'Sai ' + rec.n + ' lần' }),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: function () {
              delete store.wrong[id]; saveStore(store); updateNavCount();
              drawHead(); drawChips();
              var gone = false;
              var finish = function () {
                if (gone) return; gone = true;
                item.remove();
                if (!list.children.length || (filter && !wrongIds([filter]).length)) { filter = ''; drawChips(); drawList(); }
              };
              if (motionOK()) {
                G.killTweensOf(item);
                G.to(item, { autoAlpha: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: -12, duration: 0.35, ease: 'power2.in', overwrite: true, onComplete: finish });
                setTimeout(finish, 500);
              } else finish();
            }, text: '✓ Đã thuộc' })
          ]),
          h('p', { class: 'qtext', style: 'margin:0', text: q.q }),
          ol,
          explainEl(q),
          q.note ? h('div', { class: 'note', text: q.note }) : null
        ]);
        list.appendChild(item);
      });
      if (!ids.length) list.appendChild(h('li', { class: 'empty', text: 'Không còn câu sai nào. Rất tốt! ✿' }));
      else revealOnScroll(Array.prototype.slice.call(list.children, 0, 40));
    }
    function drawAll() { drawHead(); drawChips(); drawList(); }

    render([
      h('span', { class: 'eyebrow', text: '✿ Ôn lại chỗ còn yếu' }),
      h('h1', { text: 'Câu sai của bạn' }),
      head,
      chips,
      list
    ]);
    drawAll();
    animate(function () {
      G.from('.eyebrow, h1, .wrong-head', { y: 16, autoAlpha: 0, stagger: 0.07 });
      G.from('.big-num b', { scale: 0.6, duration: 0.6, ease: 'back.out(2.5)', delay: 0.2 });
    });
  }

  // ---------- video ----------
  function pageVideos() {
    setTitle('Video bài giảng'); setNav('videos');
    var total = VIDEOS.reduce(function (s, v) { return s + v.dur; }, 0);
    var done = VIDEOS.filter(function (_, i) { return store.video[i + 1] && store.video[i + 1].done; }).length;
    render([
      h('span', { class: 'eyebrow', text: '▶ ' + VIDEOS.length + ' video · khoảng ' + Math.round(total / 60) + ' phút' }),
      h('h1', { text: 'Video bài giảng' }),
      h('p', { class: 'lead', text: 'Xem video theo tuần rồi làm trắc nghiệm ngay bên dưới. Trang tự nhớ chỗ bạn đang xem dở. Đã xem xong ' + done + '/' + VIDEOS.length + ' video.' }),
      h('ul', { class: 'vgrid' }, VIDEOS.map(function (v, i) { return videoCard(v, i + 1); }))
    ]);
    animate(function () {
      G.from('.eyebrow, h1, .lead', { y: 16, autoAlpha: 0, stagger: 0.07 });
    });
    revealOnScroll(Array.prototype.slice.call(app.querySelectorAll('.vcard')));
  }

  function pageVideo(nStr) {
    var n = parseInt(nStr, 10);
    var v = VIDEOS[n - 1];
    if (!v) return pageNotFound();
    setTitle(v.title); setNav('videos');
    var w = weekById[v.week];
    var saved = store.video[n] || {};
    var video = h('video', {
      class: 'player__video', controls: true, preload: 'metadata', playsinline: true,
      poster: VIDEO_BASE + 'thumbs/v' + n + '.png', src: VIDEO_BASE + v.file,
      'aria-label': 'Video ' + n + ': ' + v.title
    });
    var resume = null;
    if (saved.t > 5 && !saved.done) {
      resume = h('div', { class: 'resume', role: 'status' }, [
        h('span', { text: 'Tiếp tục từ ' + fmtTime(saved.t) + '.' }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: function () {
          video.currentTime = 0; resume.remove();
        }, text: 'Xem từ đầu' })
      ]);
      video.addEventListener('loadedmetadata', function () {
        if (video.currentTime < 1 && saved.t < video.duration - 5) video.currentTime = saved.t;
      }, { once: true });
    }
    var lastSave = 0;
    var started = false; // chỉ lưu vị trí sau khi người xem thật sự bấm phát
    video.addEventListener('playing', function () { started = true; });
    function persist(force) {
      if (!started) return;
      var now = Date.now();
      if (!force && now - lastSave < 3000) return;
      lastSave = now;
      var rec = store.video[n] || {};
      rec.t = video.currentTime;
      if (video.duration && video.currentTime >= video.duration * 0.95) rec.done = true;
      store.video[n] = rec;
      saveStore(store);
    }
    video.addEventListener('timeupdate', function () { persist(false); });
    video.addEventListener('pause', function () { persist(true); });
    video.addEventListener('ended', function () {
      store.video[n] = { t: 0, done: true }; saveStore(store);
      if (endCard) { endCard.hidden = false; if (motionOK()) G.from(endCard, { y: 12, autoAlpha: 0 }); }
    });

    var speeds = h('div', { class: 'filter-row', role: 'group', 'aria-label': 'Tốc độ phát', style: 'margin:0' });
    [1, 1.25, 1.5, 2].forEach(function (s) {
      speeds.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': s === 1 ? 'true' : 'false', text: s + '×', onclick: function (e) {
        video.playbackRate = s;
        speeds.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'); });
      } }));
    });

    var endCard = h('div', { class: 'panel panel--accent end-card', hidden: true }, [
      h('b', { text: 'Xem xong rồi! Làm trắc nghiệm để kiểm tra lại nhé.' }),
      h('div', { class: 'actions' }, [
        h('a', { class: 'btn btn--primary', href: '#/start/' + w.id + '/1', text: 'Làm Đề 1 · ' + w.label }),
        VIDEOS[n] ? h('a', { class: 'btn', href: '#/video/' + (n + 1), text: 'Video tiếp theo →' }) : null
      ])
    ]);

    var playlist = h('ol', { class: 'playlist' }, VIDEOS.map(function (x, i) {
      var st = videoState(i + 1);
      return h('li', null, [h('a', { href: '#/video/' + (i + 1), 'aria-current': i + 1 === n ? 'page' : null, class: st ? st.cls : null }, [
        h('img', { src: VIDEO_BASE + 'thumbs/v' + (i + 1) + '.png', alt: '', loading: 'lazy', width: '96', height: '54' }),
        h('span', null, [h('b', { text: (i + 1) + '. ' + x.title }), h('small', { text: fmtTime(x.dur) + (st ? ' · ' + st.text : '') })])
      ])]);
    }));

    render([
      h('a', { class: 'back', href: '#/videos', text: '← Tất cả video' }),
      h('div', { class: 'video-layout' }, [
        h('div', null, [
          h('div', { class: 'player' }, [video]),
          h('div', { class: 'player__bar' }, [
            h('div', null, [
              h('small', { class: 'muted', text: 'Video ' + n + '/' + VIDEOS.length + ' · ' + w.label + ' · ' + fmtTime(v.dur) }),
              h('h1', { class: 'player__title', text: v.title })
            ]),
            speeds
          ]),
          resume,
          endCard,
          h('section', { class: 'panel video-quiz', 'aria-labelledby': 'vq-title' }, [
            h('div', null, [
              h('h2', { id: 'vq-title', text: 'Ôn trắc nghiệm ' + w.label }),
              h('p', { class: 'muted small', style: 'margin:0', text: w.title + ' · ' + w.count + ' câu' })
            ]),
            h('div', { class: 'week__tests' }, w.tests.map(function (ids, i) {
              var key = testKey(w.id, i + 1);
              return h('a', { class: 'test-btn' + (store.best[key] ? ' is-done' : ''), href: '#/start/' + w.id + '/' + (i + 1) }, [
                h('span', { class: 'test-btn__top' }, ['Đề ' + (i + 1), bestBadge(key)]),
                h('small', { text: ids.length + ' câu' })
              ]);
            }))
          ])
        ]),
        h('aside', { class: 'side', 'aria-label': 'Danh sách video' }, [h('h2', { text: 'Danh sách video' }), playlist])
      ])
    ]);
    animate(function () {
      G.timeline()
        .from('.player', { y: 20, autoAlpha: 0, duration: 0.55 })
        .from('.player__bar > *, .resume', { y: 10, autoAlpha: 0, stagger: 0.06, duration: 0.4 }, '<0.15')
        .from('.side', { x: 20, autoAlpha: 0, duration: 0.5 }, 0)
        .from('.playlist li', { x: 12, autoAlpha: 0, stagger: 0.05, duration: 0.35 }, 0.15)
        .from('.video-quiz', { y: 16, autoAlpha: 0, duration: 0.5 }, 0.3);
    });
  }

  // ---------- đăng nhập ----------
  var afterLogin = '#/';
  var cloudFailed = false;
  function pageLogin() {
    setTitle('Đăng nhập'); setNav('');
    if (!Cloud) {
      render([h('h1', { text: 'Đăng nhập' }), h('p', { class: 'muted', text: 'Chức năng đăng nhập chưa được bật cho trang này.' })]);
      return;
    }
    if (cloudFailed) {
      render([h('div', { class: 'auth-card panel' }, [
        h('h1', { text: 'Chưa đăng nhập được' }),
        h('p', { class: 'muted', text: 'Không tải được chức năng đăng nhập (mạng chặn hoặc mất kết nối). Bạn vẫn làm bài bình thường — tiến độ được lưu trên trình duyệt này. Thử tải lại trang sau nhé.' }),
        h('div', { class: 'actions' }, [h('button', { type: 'button', class: 'btn btn--primary', onclick: function () { location.reload(); }, text: 'Tải lại trang' }), h('a', { class: 'btn', href: '#/', text: 'Về trang chủ' })])
      ])]);
      return;
    }
    if (!Cloud.isReady()) {
      render([h('div', { class: 'auth-card panel' }, [h('p', { class: 'muted', style: 'margin:0', text: 'Đang tải chức năng đăng nhập…' })])]);
      return;
    }
    var u = Cloud.user();
    if (u) {
      render([
        h('div', { class: 'auth-card panel panel--accent' }, [
          h('div', { class: 'auth-who' }, [avatarEl(u, 'avatar--lg'), h('div', null, [h('b', { text: u.name || 'Tài khoản của bạn' }), h('small', { class: 'muted', text: u.email })])]),
          h('p', { class: 'muted', text: 'Tiến độ, câu sai, lịch sử làm bài và vị trí xem video đang được lưu vào tài khoản này. Đăng nhập trên máy khác là thấy lại.' }),
          h('div', { class: 'actions' }, [
            h('a', { class: 'btn btn--primary', href: '#/', text: 'Về trang ôn tập' }),
            h('a', { class: 'btn', href: '#/history', text: 'Lịch sử làm bài' }),
            h('button', { type: 'button', class: 'btn btn--ghost', onclick: doSignOut, text: 'Đăng xuất' })
          ])
        ])
      ]);
      return;
    }

    var mode = 'in';
    var err = h('p', { class: 'auth-error', role: 'alert' });
    var info = h('p', { class: 'auth-info', role: 'status' });
    var nameIn = h('input', { type: 'text', id: 'au-name', autocomplete: 'name', maxlength: '60' });
    var emailIn = h('input', { type: 'email', id: 'au-email', autocomplete: 'email', inputmode: 'email', required: true });
    var pwIn = h('input', { type: 'password', id: 'au-pw', autocomplete: 'current-password', minlength: '6', required: true });
    var nameRow = h('div', { class: 'field', hidden: true }, [h('label', { for: 'au-name', text: 'Tên hiển thị' }), nameIn]);
    var submitBtn = h('button', { type: 'submit', class: 'btn btn--primary btn--block' });
    var forgot = h('button', { type: 'button', class: 'linkish', text: 'Quên mật khẩu?' });
    var tabIn = h('button', { type: 'button', role: 'tab', class: 'chip', text: 'Đăng nhập' });
    var tabUp = h('button', { type: 'button', role: 'tab', class: 'chip', text: 'Tạo tài khoản' });

    function setMode(m) {
      mode = m;
      tabIn.setAttribute('aria-selected', m === 'in' ? 'true' : 'false');
      tabUp.setAttribute('aria-selected', m === 'up' ? 'true' : 'false');
      nameRow.hidden = m !== 'up';
      pwIn.setAttribute('autocomplete', m === 'up' ? 'new-password' : 'current-password');
      submitBtn.textContent = m === 'up' ? 'Tạo tài khoản' : 'Đăng nhập';
      forgot.hidden = m === 'up';
      err.textContent = ''; info.textContent = '';
    }
    tabIn.addEventListener('click', function () { setMode('in'); });
    tabUp.addEventListener('click', function () { setMode('up'); });

    function busy(on, label) {
      submitBtn.disabled = on; gBtn.disabled = on;
      if (on) submitBtn.textContent = label || 'Đang xử lý…'; else setMode(mode);
    }
    function done() { location.hash = afterLogin || '#/'; afterLogin = '#/'; }
    function fail(e) { busy(false); err.textContent = Cloud.message(e); }

    var form = h('form', { class: 'auth-form', novalidate: true }, [
      nameRow,
      h('div', { class: 'field' }, [h('label', { for: 'au-email', text: 'Email' }), emailIn]),
      h('div', { class: 'field' }, [h('label', { for: 'au-pw', text: 'Mật khẩu' }), pwIn, h('small', { class: 'muted', text: 'Ít nhất 6 ký tự.' })]),
      err, info,
      submitBtn,
      forgot
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; info.textContent = '';
      var email = emailIn.value.trim(), pw = pwIn.value;
      if (mode === 'up' && !nameIn.value.trim()) { err.textContent = 'Hãy nhập tên hiển thị.'; nameIn.focus(); return; }
      if (!email) { err.textContent = 'Hãy nhập email.'; emailIn.focus(); return; }
      if (pw.length < 6) { err.textContent = 'Mật khẩu cần ít nhất 6 ký tự.'; pwIn.focus(); return; }
      busy(true);
      (mode === 'up' ? Cloud.signUpEmail(nameIn.value.trim(), email, pw) : Cloud.signInEmail(email, pw)).then(done, fail);
    });
    forgot.addEventListener('click', function () {
      err.textContent = ''; info.textContent = '';
      var email = emailIn.value.trim();
      if (!email) { err.textContent = 'Nhập email ở trên rồi bấm “Quên mật khẩu?” để nhận thư đặt lại mật khẩu.'; emailIn.focus(); return; }
      Cloud.resetPassword(email).then(function () {
        info.textContent = 'Đã gửi thư đặt lại mật khẩu tới ' + email + ' (xem cả mục Spam).';
      }, function (e) { err.textContent = Cloud.message(e); });
    });

    var gBtn = h('button', { type: 'button', class: 'btn btn--google btn--block', onclick: function () {
      err.textContent = '';
      busy(true, 'Đang mở Google…');
      Cloud.signInGoogle().then(function (r) { if (r !== undefined) done(); }, fail);
    } }, [h('span', { class: 'g-logo', 'aria-hidden': 'true', html: GOOGLE_SVG }), 'Tiếp tục với Google']);

    setMode('in');
    render([
      h('div', { class: 'auth-card panel' }, [
        h('span', { class: 'eyebrow', text: '✿ Lưu tiến độ của riêng bạn' }),
        h('h1', { text: 'Đăng nhập' }),
        h('p', { class: 'muted', style: 'margin:0 0 18px', text: 'Đăng nhập để lưu điểm từng đề, câu sai, lịch sử làm bài và chỗ xem video — mở trên máy khác vẫn còn nguyên.' }),
        gBtn,
        h('div', { class: 'auth-or' }, [h('span', { text: 'hoặc dùng email' })]),
        h('div', { class: 'auth-tabs filter-row', role: 'tablist' }, [tabIn, tabUp]),
        form
      ])
    ]);
    animate(function () {
      G.from('.auth-card', { y: 20, autoAlpha: 0, duration: 0.5 });
      G.from('.auth-card > *', { y: 10, autoAlpha: 0, stagger: 0.05, duration: 0.35, delay: 0.1 });
    });
  }
  var GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function avatarEl(u, extra) {
    var initial = ((u.name || u.email || '?').trim().charAt(0) || '?').toUpperCase();
    if (u.photo) return h('img', { class: 'avatar ' + (extra || ''), src: u.photo, alt: '', referrerpolicy: 'no-referrer' });
    return h('span', { class: 'avatar ' + (extra || ''), 'aria-hidden': 'true', text: initial });
  }
  function doSignOut() {
    Cloud.signOut().then(function () { toast('Đã đăng xuất.'); location.hash = '#/'; });
  }

  // ---------- lịch sử ----------
  function pageHistory() {
    setTitle('Lịch sử làm bài'); setNav('');
    var hs = store.history;
    var sumC = hs.reduce(function (s, x) { return s + x.c; }, 0);
    var sumN = hs.reduce(function (s, x) { return s + x.n; }, 0);
    var testsDone = DATA.weeks.reduce(function (s, w) { return s + doneTests(w); }, 0);
    var vidsDone = VIDEOS.filter(function (_, i) { return store.video[i + 1] && store.video[i + 1].done; }).length;
    var u = Cloud && Cloud.user();
    var fmt = function (t) {
      var d = new Date(t);
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ' · ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    };
    var list = h('ol', { class: 'history' });
    hs.forEach(function (x) {
      var pct = Math.round(x.c / x.n * 100);
      list.appendChild(h('li', { class: 'history-item' }, [
        h('span', { class: 'pct ' + (pct >= 80 ? 'is-good' : pct >= 50 ? 'is-mid' : 'is-low'), text: pct + '%' }),
        h('div', { class: 'history-item__main' }, [
          h('b', { text: x.title }),
          h('small', { class: 'muted', text: fmt(x.t) + ' · ' + (x.mode === 'exam' ? 'Thi thử' : 'Luyện tập') })
        ]),
        h('span', { class: 'history-item__score', text: x.c + '/' + x.n })
      ]));
    });
    if (!hs.length) list.appendChild(h('li', { class: 'empty', text: 'Chưa có lần làm bài nào. Nộp bài xong là kết quả sẽ hiện ở đây.' }));

    render([
      h('span', { class: 'eyebrow', text: u ? '✿ ' + (u.name || u.email) : '✿ Trên trình duyệt này' }),
      h('h1', { text: 'Lịch sử làm bài' }),
      Cloud && !u ? h('div', { class: 'resume' }, [
        h('span', { text: 'Bạn chưa đăng nhập — lịch sử chỉ lưu trên trình duyệt này.' }),
        h('a', { class: 'btn btn--primary btn--sm', href: '#/login', onclick: function () { afterLogin = '#/history'; }, text: 'Đăng nhập để lưu' })
      ]) : null,
      h('div', { class: 'hstats' }, [
        h('div', { class: 'stat' }, [h('b', { 'data-count': String(hs.length), text: String(hs.length) }), h('span', { text: 'lần nộp bài' })]),
        h('div', { class: 'stat' }, [h('b', { text: sumN ? Math.round(sumC / sumN * 100) + '%' : '–' }), h('span', { text: 'tỉ lệ đúng (' + sumC + '/' + sumN + ' câu)' })]),
        h('div', { class: 'stat' }, [h('b', { text: testsDone + '/' + TOTAL_TESTS }), h('span', { text: 'đề theo tuần đã làm' })]),
        h('div', { class: 'stat' }, [h('b', { text: vidsDone + '/' + VIDEOS.length }), h('span', { text: 'video đã xem hết' })])
      ]),
      h('div', { class: 'section-head', style: 'margin-top:24px' }, [
        h('h2', { text: 'Các lần làm bài' }),
        hs.length ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: function () {
          if (!window.confirm('Xoá toàn bộ ' + hs.length + ' dòng lịch sử làm bài? (Điểm cao nhất từng đề và câu sai vẫn giữ nguyên.)')) return;
          store.history = []; saveStore(store, true); pageHistory();
        }, text: 'Xoá lịch sử' }) : null
      ]),
      list
    ]);
    animate(function () {
      G.from('.eyebrow, h1, .resume, .hstats .stat', { y: 14, autoAlpha: 0, stagger: 0.06 });
    });
    revealOnScroll(Array.prototype.slice.call(list.querySelectorAll('.history-item'), 0, 40));
  }

  // ---------- thông báo nhỏ ----------
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  // ---------- tài khoản trên thanh trên cùng ----------
  var accountBox = document.getElementById('account');
  function drawAccount() {
    if (!accountBox) return;
    accountBox.innerHTML = '';
    if (!Cloud || !Cloud.isReady()) return;
    var u = Cloud.user();
    if (!u) {
      accountBox.appendChild(h('a', { class: 'btn btn--primary btn--sm', href: '#/login', onclick: function () {
        if (!/^#\/login/.test(location.hash)) afterLogin = location.hash && !/^#\/(quiz|result)/.test(location.hash) ? location.hash : '#/';
      }, text: 'Đăng nhập' }));
      return;
    }
    var menu = h('div', { class: 'account__menu', id: 'account-menu', hidden: true }, [
      h('div', { class: 'account__who' }, [h('b', { text: u.name || 'Tài khoản' }), h('small', { text: u.email })]),
      h('a', { href: '#/history', text: '🕘 Lịch sử làm bài' }),
      h('a', { href: '#/wrong', text: '✗ Câu sai của bạn' }),
      h('button', { type: 'button', onclick: doSignOut, text: '↩ Đăng xuất' })
    ]);
    var btn = h('button', { type: 'button', class: 'account__btn', 'aria-expanded': 'false', 'aria-controls': 'account-menu', 'aria-label': 'Tài khoản: ' + (u.name || u.email) }, [
      avatarEl(u),
      h('span', { class: 'account__name', text: (u.name || u.email).split(/[\s@]/)[0] })
    ]);
    function setOpen(open) {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && motionOK()) G.fromTo(menu, { y: -6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2 });
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a,button')) setOpen(false); });
    closeAccountMenu = function (focusBtn) { if (!menu.hidden) { setOpen(false); if (focusBtn) btn.focus(); } };
    accountBox.appendChild(btn);
    accountBox.appendChild(menu);
  }
  var closeAccountMenu = function () {};
  document.addEventListener('click', function (e) { if (accountBox && !accountBox.contains(e.target)) closeAccountMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAccountMenu(true); });

  // Đổi người dùng -> đổi bộ dữ liệu, rồi vẽ lại trang (trừ khi đang làm bài).
  function refreshView() {
    if (/^#\/(quiz)/.test(location.hash)) return;
    route();
  }
  function onUser(u) {
    drawAccount();
    var uid = u ? u.uid : null;
    if (!uid) {
      var wasIn = !!currentUid;
      currentUid = null; lsSet(LAST_UID_KEY, null);
      store = readLocal(null);
      if (wasIn || /^#\/login/.test(location.hash)) refreshView();
      return;
    }
    if (uid !== currentUid) {
      currentUid = uid; lsSet(LAST_UID_KEY, uid);
      store = readLocal(uid);
      refreshView();
    } else if (/^#\/login/.test(location.hash)) {
      refreshView();
    }
    var before = JSON.stringify(store);
    Cloud.load(uid).then(function (remote) {
      if (currentUid !== uid) return;
      var acc = remote ? normalize(remote) : store; // chưa có trên máy chủ: dùng bản trên máy (nếu có)
      var dirty = !remote;
      var guest = readLocal(null);
      var askedKey = 'ontn-merge-asked:' + uid;
      if (hasProgress(guest) && !lsGet(askedKey)) {
        lsSet(askedKey, '1');
        var nTests = Object.keys(guest.best).length, nWrong = Object.keys(guest.wrong).length;
        if (window.confirm('Trên trình duyệt này đang có tiến độ làm khi chưa đăng nhập (' + nTests + ' đề, ' + nWrong + ' câu sai, ' + guest.history.length + ' lần nộp bài).\n\nGộp vào tài khoản của bạn?')) {
          acc = mergeInto(acc, guest);
          lsSet(keyFor(null), null);
          dirty = true;
          toast('Đã gộp tiến độ vào tài khoản.');
        }
      }
      store = acc;
      lsSet(keyFor(uid), JSON.stringify(store));
      if (dirty) Cloud.save(uid, store, true);
      if (JSON.stringify(store) !== before) refreshView();
      updateNavCount();
    }).catch(function (e) {
      console.warn('[cloud] tải dữ liệu thất bại:', e && (e.code || e.message));
      toast('Chưa tải được dữ liệu tài khoản — đang dùng bản lưu trên máy.');
    });
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
      case 'wrong': return pageWrong();
      case 'videos': return pageVideos();
      case 'video': return pageVideo(parts[1]);
      case 'login': return pageLogin();
      case 'history': return pageHistory();
      default: return pageNotFound();
    }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  route();
  if (Cloud) {
    Cloud.onUser(onUser);
    // Firebase không tải được: ẩn nút tài khoản; dữ liệu vẫn lưu trên máy như trước.
    Cloud.ready.then(function (ok) {
      if (ok) return;
      cloudFailed = true;
      if (accountBox) accountBox.hidden = true;
      if (/^#\/login/.test(location.hash)) route();
    });
  }
})();
