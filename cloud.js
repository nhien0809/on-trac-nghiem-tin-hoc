// Đăng nhập (Firebase Auth) + lưu tiến độ mỗi người (Firestore: users/{uid}).
// Trang vẫn chạy bình thường nếu Firebase không tải được: khi đó dữ liệu chỉ lưu trên trình duyệt.
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var CONFIG = window.FIREBASE_CONFIG || null;
  // Thử trên máy với Firebase Emulator: http://localhost:5173/?emu=1
  var EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu=1\b/.test(location.search);

  var listeners = [];
  var state = { ready: false, user: null };
  var auth = null, db = null;
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('Không tải được ' + src)); };
      document.head.appendChild(s);
    });
  }
  function emit() { listeners.forEach(function (fn) { try { fn(state.user); } catch (e) { console.error(e); } }); }

  function init() {
    if (!CONFIG) { readyResolve(false); return; }
    loadScript(SDK + 'firebase-app-compat.js')
      .then(function () { return Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]); })
      .then(function () {
        var fb = window.firebase;
        fb.initializeApp(CONFIG);
        auth = fb.auth();
        db = fb.firestore();
        if (EMU) {
          auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
          db.useEmulator('127.0.0.1', 8080);
        }
        auth.languageCode = 'vi';
        auth.onAuthStateChanged(function (u) {
          state.user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null;
          if (!state.ready) { state.ready = true; readyResolve(true); }
          emit();
        });
      })
      .catch(function (e) {
        console.warn('[cloud] Firebase không khả dụng:', e.message);
        readyResolve(false);
      });
  }

  // ---- lưu dữ liệu: gộp các lần ghi liên tiếp, tối đa 1 lần / 15 giây (trừ khi flush) ----
  var pending = null, timer = null, lastWrite = 0, MIN_GAP = 15000;
  function writeNow() {
    if (!pending || !db) return Promise.resolve();
    var p = pending; pending = null;
    clearTimeout(timer); timer = null;
    lastWrite = Date.now();
    return db.collection('users').doc(p.uid).set({
      data: JSON.stringify(p.data),
      name: (state.user && state.user.name) || '',
      email: (state.user && state.user.email) || '',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (e) { console.warn('[cloud] lưu thất bại:', e.code || e.message); });
  }
  function save(uid, data, urgent) {
    if (!db || !uid) return;
    pending = { uid: uid, data: data };
    if (urgent) { writeNow(); return; }
    if (timer) return;
    var wait = Math.max(1500, MIN_GAP - (Date.now() - lastWrite));
    timer = setTimeout(writeNow, wait);
  }
  function flush() { return writeNow(); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  function load(uid) {
    return db.collection('users').doc(uid).get().then(function (snap) {
      if (!snap.exists) return null;
      try { return JSON.parse(snap.data().data); } catch (e) { return null; }
    });
  }

  // ---- đăng nhập ----
  function signInGoogle() {
    var provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return auth.signInWithPopup(provider).catch(function (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        return auth.signInWithRedirect(provider);
      }
      throw e;
    });
  }
  function signInEmail(email, pw) { return auth.signInWithEmailAndPassword(email, pw); }
  function signUpEmail(name, email, pw) {
    return auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
      return cred.user.updateProfile({ displayName: name }).then(function () {
        state.user = { uid: cred.user.uid, name: name, email: cred.user.email || email, photo: '' };
        emit();
        return cred;
      });
    });
  }
  function resetPassword(email) { return auth.sendPasswordResetEmail(email); }
  function signOut() { return flush().then(function () { return auth.signOut(); }); }

  var MESSAGES = {
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/missing-email': 'Hãy nhập email.',
    'auth/missing-password': 'Hãy nhập mật khẩu.',
    'auth/user-not-found': 'Email hoặc mật khẩu không đúng.',
    'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
    'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy chuyển sang “Đăng nhập”.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/too-many-requests': 'Thử sai quá nhiều lần. Đợi vài phút rồi thử lại.',
    'auth/network-request-failed': 'Không kết nối được mạng. Kiểm tra Internet rồi thử lại.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
    'auth/cancelled-popup-request': 'Bạn đã đóng cửa sổ đăng nhập Google.',
    'auth/unauthorized-domain': 'Tên miền này chưa được phép đăng nhập (cần thêm vào Authorized domains của Firebase).',
    'auth/operation-not-allowed': 'Cách đăng nhập này chưa được bật trong Firebase.',
    'auth/account-exists-with-different-credential': 'Email này đã đăng ký bằng cách khác. Hãy đăng nhập bằng email/mật khẩu.'
  };
  function message(e) { return (e && MESSAGES[e.code]) || 'Có lỗi xảy ra' + (e && e.code ? ' (' + e.code + ')' : '') + '. Thử lại nhé.'; }

  window.Cloud = {
    enabled: !!CONFIG,
    ready: ready,
    user: function () { return state.user; },
    isReady: function () { return state.ready; },
    // Nếu Firebase đã báo trạng thái trước khi app.js đăng ký (SDK tải nhanh hơn app.js) thì gọi ngay.
    onUser: function (fn) {
      listeners.push(fn);
      if (state.ready) setTimeout(function () { fn(state.user); }, 0);
    },
    load: load, save: save, flush: flush,
    signInGoogle: signInGoogle, signInEmail: signInEmail, signUpEmail: signUpEmail,
    resetPassword: resetPassword, signOut: signOut, message: message
  };
  init();
})();
