/* ══════════════════════════════════════════════════════════════
   클라우드 모드 — Supabase 로그인 · 데이터 로드 · 학습기록 동기화

   외부 라이브러리를 쓰지 않는다. Supabase는 그냥 REST API이므로
   fetch로 직접 호출한다(앱의 '의존성 0' 원칙 유지).

   동작 방식
     - 로컬(file:// · localhost)  : 아무것도 하지 않는다. 기존 그대로 동작.
     - 그 밖의 주소(인터넷)        : 로그인 화면 → JWT로 비공개 버킷에서 데이터 받기
                                    → 학습기록을 Postgres와 양방향 병합

   보안 설계
     - 공개 버킷에는 껍데기(html/css/js)만 둔다. 시험 콘텐츠는 들어가지 않는다.
     - 기출·해설·이미지 JSON은 비공개 버킷에 두고 로그인한 사용자만 내려받는다.
     - anon key는 공개되어도 되는 값이다(RLS가 실제 접근을 막는다).
   ══════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var CFG = w.SUPABASE_CONFIG || {};
  var LS_SESSION = 'hwayak_session';
  var LS_STATE = 'hwayak_v1';           // store.js가 쓰는 키와 동일
  var DATA_BUCKET = CFG.dataBucket || 'hwayak-data';
  var TABLE = 'study_state';

  /** 로컬에서 열었는가? (그렇다면 클라우드 모드를 아예 켜지 않는다) */
  function isLocal() {
    var h = location.hostname;
    return location.protocol === 'file:' ||
           h === 'localhost' || h === '127.0.0.1' || h === '' ||
           /^192\.168\./.test(h) || /^10\./.test(h) ||
           /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }

  function configured() {
    return !!(CFG.url && CFG.anonKey);
  }

  /* ── 세션 보관 ── */
  var session = null;
  try { session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); } catch (e) {}

  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  }

  function expired() {
    return !session || !session.expires_at || session.expires_at * 1000 < Date.now() + 30000;
  }

  /* ── Supabase REST 호출 ── */
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      'apikey': CFG.anonKey,
      'Content-Type': 'application/json'
    }, opts.headers || {});
    if (session && session.access_token && !opts.noAuth) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    }
    return fetch(CFG.url.replace(/\/+$/, '') + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body
    });
  }

  function login(email, password) {
    return api('/auth/v1/token?grant_type=password', {
      method: 'POST', noAuth: true,
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.error || '로그인에 실패했습니다');
        saveSession(j);
        return j;
      });
    });
  }

  function refresh() {
    if (!session || !session.refresh_token) return Promise.reject(new Error('세션 없음'));
    return api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', noAuth: true,
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error('세션이 만료되었습니다. 다시 로그인하세요.');
      return r.json().then(function (j) { saveSession(j); return j; });
    });
  }

  function ensureSession() {
    if (!session) return Promise.reject(new Error('로그인이 필요합니다'));
    return expired() ? refresh() : Promise.resolve(session);
  }

  function logout() {
    saveSession(null);
    location.reload();
  }

  /* ── 비공개 버킷에서 데이터 JSON 받기 ── */
  function loadOne(name) {
    return api('/storage/v1/object/' + DATA_BUCKET + '/' + name + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error(name + ' 데이터를 받지 못했습니다 (' + r.status + ')');
        return r.json();
      });
  }

  var DATASETS = [
    ['exams', 'EXAMS'], ['answers', 'ANSWERS'], ['images', 'IMAGES'],
    ['keywords', 'KEYWORDS'], ['theory', 'THEORY'], ['predicted', 'PREDICTED']
  ];

  function loadData(onProgress) {
    var done = 0;
    return Promise.all(DATASETS.map(function (d) {
      return loadOne(d[0]).then(function (obj) {
        w[d[1]] = obj;
        done++;
        if (onProgress) onProgress(done, DATASETS.length);
      });
    }));
  }

  /* ══════════════ 학습기록 동기화 ══════════════ */

  /**
   * 로컬 기록과 서버 기록을 합친다. 어느 쪽도 잃지 않는 것이 목표.
   *  - wrong/bookmark : 합집합 (오답은 count가 큰 쪽, 최근시각이 늦은 쪽 우선)
   *  - solved/progress: 같은 키면 시각이 늦은 쪽
   *  - sessions       : 이어붙인 뒤 시각으로 중복 제거
   *  - attempts       : 세트별로 이어붙인 뒤 시각으로 중복 제거
   *  - settings       : 서버가 더 최근이면 서버, 아니면 로컬
   */
  function mergeState(local, remote, remoteUpdatedAt) {
    if (!remote) return local;
    if (!local) return remote;
    var out = { };

    function byLater(a, b, field) {
      var m = Object.assign({}, a || {});
      Object.keys(b || {}).forEach(function (k) {
        var x = m[k], y = b[k];
        if (!x) { m[k] = y; return; }
        m[k] = ((y[field] || 0) > (x[field] || 0)) ? y : x;
      });
      return m;
    }

    out.solved = byLater(local.solved, remote.solved, 'at');
    out.progress = byLater(local.progress, remote.progress, 'at');

    // 오답노트: count는 큰 값, 나머지는 최근 것
    out.wrong = Object.assign({}, local.wrong || {});
    Object.keys(remote.wrong || {}).forEach(function (k) {
      var a = out.wrong[k], b = remote.wrong[k];
      if (!a) { out.wrong[k] = b; return; }
      var pick = ((b.last || 0) > (a.last || 0)) ? b : a;
      out.wrong[k] = Object.assign({}, pick, {
        count: Math.max(a.count || 0, b.count || 0),
        lastOk: (b.lastOk || a.lastOk) || undefined
      });
    });

    out.bookmark = Object.assign({}, local.bookmark || {}, remote.bookmark || {});
    out.theoryRead = Object.assign({}, local.theoryRead || {}, remote.theoryRead || {});

    function dedupeByAt(arr) {
      var seen = {}, r = [];
      (arr || []).forEach(function (x) {
        var k = String(x.at);
        if (seen[k]) return;
        seen[k] = 1; r.push(x);
      });
      return r.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    }
    // 응시 이력은 로컬 보관 한도(500)와 맞춘다 — 동기화 때문에 옛 기록이 잘려나가지 않게.
    out.sessions = dedupeByAt([].concat(local.sessions || [], remote.sessions || [])).slice(0, 500);

    out.attempts = {};
    var keys = {};
    Object.keys(local.attempts || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(remote.attempts || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      out.attempts[k] = dedupeByAt([].concat(
        (local.attempts || {})[k] || [], (remote.attempts || {})[k] || []
      )).slice(0, 30);
    });

    // 설정: 서버 저장 시각이 로컬 마지막 활동보다 늦으면 서버 것을 쓴다
    var localTouch = Math.max.apply(null, [0].concat(
      Object.keys(out.solved).map(function (k) { return out.solved[k].at || 0; })
    ));
    out.settings = ((remoteUpdatedAt || 0) > localTouch)
      ? Object.assign({}, local.settings, remote.settings)
      : Object.assign({}, remote.settings, local.settings);

    return out;
  }

  function pull() {
    return ensureSession().then(function () {
      return api('/rest/v1/' + TABLE + '?select=data,updated_at&limit=1');
    }).then(function (r) {
      if (!r.ok) throw new Error('기록을 불러오지 못했습니다 (' + r.status + ')');
      return r.json();
    }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return { data: rows[0].data, updatedAt: Date.parse(rows[0].updated_at) || 0 };
    });
  }

  var pushTimer = null, pushing = false, pushAgain = false;

  function pushNow() {
    if (!session || isLocal() || !configured()) return Promise.resolve();
    if (pushing) { pushAgain = true; return Promise.resolve(); }
    pushing = true;
    var body = JSON.stringify({
      user_id: session.user && session.user.id,
      data: w.Store ? w.Store.s : null,
      updated_at: new Date().toISOString()
    });
    return ensureSession().then(function () {
      return api('/rest/v1/' + TABLE + '?on_conflict=user_id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: body
      });
    }).then(function (r) {
      setStatus(r.ok ? 'saved' : 'error');
      if (!r.ok) console.warn('동기화 실패', r.status);
    }).catch(function (e) {
      setStatus('error');
      console.warn('동기화 실패', e);
    }).then(function () {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
    });
  }

  /** 저장이 잦으므로 2초 모아서 한 번만 올린다 */
  function schedulePush() {
    if (!session || isLocal() || !configured()) return;
    setStatus('dirty');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 2000);
  }

  /* ── 상단 동기화 표시 ── */
  function setStatus(kind) {
    var el = document.getElementById('syncStatus');
    if (!el) return;
    var map = {
      dirty: ['저장 중…', 'sync-dirty'],
      saved: ['동기화됨', 'sync-ok'],
      error: ['동기화 실패', 'sync-err'],
      loading: ['불러오는 중…', 'sync-dirty']
    };
    var m = map[kind] || ['', ''];
    el.textContent = m[0];
    el.className = 'syncbadge ' + m[1];
    el.title = kind === 'error'
      ? '서버에 저장하지 못했습니다. 인터넷 연결을 확인하세요. 기록은 이 기기에 남아 있습니다.'
      : '학습기록이 계정에 저장되어 다른 기기와 공유됩니다.';
  }

  /* ══════════════ 로그인 화면 ══════════════ */
  /* 로그인·로딩 화면은 body를 통째로 갈아끼운다.
     원래 앱 껍데기(상단바·#view·#toast)를 잃어버리면 앱을 띄울 수 없으므로
     처음 한 번 보관해 두었다가 부팅 직전에 되돌린다. */
  var SHELL = null;
  function keepShell() {
    if (SHELL === null) SHELL = document.body.innerHTML;
  }
  function restoreShell() {
    if (SHELL !== null) { document.body.innerHTML = SHELL; SHELL = null; }
  }

  function loginScreen(msg) {
    keepShell();
    document.body.innerHTML =
      '<div class="authwrap"><div class="authbox">' +
      '<div class="authlogo">💥</div>' +
      '<h1>화약류관리기사</h1>' +
      '<p class="authsub">학습앱에 로그인하세요</p>' +
      (msg ? '<div class="autherr">' + msg + '</div>' : '') +
      '<form id="authForm">' +
      '<input type="email" id="authEmail" placeholder="이메일" autocomplete="username" required>' +
      '<input type="password" id="authPw" placeholder="비밀번호" autocomplete="current-password" required>' +
      '<button type="submit" class="btn primary" id="authBtn">로그인</button>' +
      '</form>' +
      '<p class="authnote">이 앱은 개인 학습용입니다. 계정은 관리자가 직접 만들어 사용합니다.</p>' +
      '</div></div>';

    document.getElementById('authForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = document.getElementById('authBtn');
      btn.disabled = true; btn.textContent = '확인 중…';
      login(document.getElementById('authEmail').value.trim(),
            document.getElementById('authPw').value)
        .then(function () { location.reload(); })
        .catch(function (err) { loginScreen(err.message); });
    };
  }

  function loadingScreen() {
    keepShell();
    document.body.innerHTML =
      '<div class="authwrap"><div class="authbox">' +
      '<div class="authlogo">💥</div>' +
      '<h1>화약류관리기사</h1>' +
      '<p class="authsub" id="loadMsg">문제 데이터를 불러오는 중…</p>' +
      '<div class="loadbar"><i id="loadBar" style="width:0%"></i></div>' +
      '</div></div>';
  }

  /* ══════════════ 부팅 ══════════════ */
  function boot() {
    // 로컬이면 클라우드 기능을 켜지 않는다 — 기존 동작 그대로
    if (isLocal() || !configured()) {
      w.CLOUD = { enabled: false, schedulePush: function () {}, logout: function () {} };
      return Promise.resolve(false);
    }

    w.CLOUD = {
      enabled: true,
      schedulePush: schedulePush,
      pushNow: pushNow,
      logout: logout,
      email: function () { return session && session.user && session.user.email; }
    };

    if (!session) { loginScreen(); return Promise.reject({ handled: true }); }

    loadingScreen();
    return ensureSession()
      .then(function () {
        return loadData(function (done, total) {
          var b = document.getElementById('loadBar');
          if (b) b.style.width = Math.round(done / total * 100) + '%';
        });
      })
      .then(function () {
        var msg = document.getElementById('loadMsg');
        if (msg) msg.textContent = '학습기록을 동기화하는 중…';
        return pull().catch(function (e) {
          console.warn('기록 불러오기 실패(로컬 기록으로 계속):', e);
          return null;
        });
      })
      .then(function (remote) {
        // 서버 기록과 이 기기의 기록을 합쳐서 localStorage에 써 둔다.
        // store.js가 그 값을 읽어 시작하므로, 앱 나머지 코드는 손댈 필요가 없다.
        var local = null;
        try { local = JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) {}
        var merged = mergeState(local, remote && remote.data, remote && remote.updatedAt);
        if (merged) localStorage.setItem(LS_STATE, JSON.stringify(merged));
        restoreShell();   // 로딩 화면을 걷어내고 원래 앱 껍데기로 되돌린다
        return true;
      })
      .catch(function (e) {
        if (e && e.handled) throw e;
        loginScreen(e.message || '데이터를 불러오지 못했습니다');
        throw { handled: true };
      });
  }

  w.CloudBoot = boot;
})(window);
