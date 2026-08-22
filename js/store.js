/* 학습 상태 저장 — localStorage 전용 (외부 전송 없음) */
(function (w) {
  'use strict';
  var KEY = 'hwayak_v1';
  var BAK = 'hwayak_v1_bak';       // 자동 스냅샷 — 본 기록과 '다른 칸'에 보관해 함께 지워지지 않게 한다
  var BAK_MAX = 6;                 // 보관 개수
  var BAK_GAP = 30 * 60 * 1000;    // 자동 스냅샷 최소 간격(30분)

  var def = {
    wrong: {},     // qid -> {qid, subject, stem, choices, answer, explanation, picked, count, last, src}
    solved: {},    // qid -> {ok:bool, picked:int, at:ts, subject, srcLabel}
    sessions: [],  // 모의고사 이력 [{at, type, score, total, bySubject, pass}]
    bookmark: {},  // qid -> true
    theoryRead: {},// 이론 섹션 진도
    progress: {},  // setKey -> {i, picked, qids, sess, shown, at, mode}  진행 중 풀이 자동저장
    attempts: {},  // setKey -> [{at, ok, n, pct}]  세트별 풀이 이력
    settings: { examDate: '2026-08-23', theme: 'light', reveal: 'instant', lastExportAt: 0 }
  };

  var st;
  try {
    st = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    st = JSON.parse(JSON.stringify(def));
  }
  // 누락 키 보정
  Object.keys(def).forEach(function (k) { if (st[k] === undefined) st[k] = def[k]; });
  st.settings = Object.assign({}, def.settings, st.settings || {});

  var lastSaveError = null;
  var muted = 0, dirty = false;   // 여러 문항을 한꺼번에 기록할 때 저장을 한 번으로 모은다

  /** 화면 쪽에서 임시로 붙인 '_'로 시작하는 필드는 저장하지 않는다.
   *  (그런 필드가 순환 구조를 만들면 JSON 변환이 통째로 실패해 기록이 유실된다) */
  function omitTemp(k, v) { return (k.charAt(0) === '_') ? undefined : v; }

  function save() {
    if (muted) { dirty = true; return; }
    lastSaveError = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(st, omitTemp));
    } catch (e) {
      // 용량이 꽉 찬 경우: 자동 스냅샷을 줄여 자리를 만들고 한 번 더 시도한다.
      // (본 기록을 지키는 것이 스냅샷을 지키는 것보다 우선)
      try {
        var b = readBackups();
        while (b.length > 1) {
          b.pop();
          localStorage.setItem(BAK, JSON.stringify(b));
          try { localStorage.setItem(KEY, JSON.stringify(st, omitTemp)); return afterSave(); }
          catch (e2) { /* 계속 줄인다 */ }
        }
        localStorage.removeItem(BAK);
        localStorage.setItem(KEY, JSON.stringify(st, omitTemp));
      } catch (e3) {
        lastSaveError = e3;
        console.warn('저장 실패(용량 초과 가능):', e3);
      }
    }
    return afterSave();
  }

  function afterSave() {
    autoSnapshot();
    // 클라우드 모드일 때만 서버에도 올린다(로컬 실행에서는 아무 일도 하지 않음).
    if (w.CLOUD && w.CLOUD.enabled) w.CLOUD.schedulePush();
  }

  /* ══════════════ 자동 스냅샷(기록 보호) ══════════════
     본 기록(hwayak_v1)이 실수로 비워지거나 망가져도 되돌릴 수 있도록
     별도 키에 최근 상태를 몇 벌 보관한다. 용량을 아끼려고 오답노트의
     본문·보기·해설은 빼고 저장하고, 복원할 때 문제은행에서 다시 채운다. */

  function readBackups() {
    try {
      var a = JSON.parse(localStorage.getItem(BAK) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function slimWrong(wrong) {
    var o = {};
    Object.keys(wrong || {}).forEach(function (k) {
      var x = wrong[k];
      o[k] = {
        qid: x.qid, subject: x.subject, answer: x.answer, picked: x.picked,
        src: x.src, srcLabel: x.srcLabel, count: x.count, last: x.last,
        history: x.history, lastOk: x.lastOk, lastAt: x.lastAt, slim: 1
      };
    });
    return o;
  }

  /** 스냅샷의 오답노트에 문제 본문을 다시 채운다(app.js가 Store.resolveQ를 등록해 둔다) */
  function fatWrong(wrong) {
    var o = {};
    Object.keys(wrong || {}).forEach(function (k) {
      var x = Object.assign({}, wrong[k]);
      if (x.slim && typeof Store.resolveQ === 'function') {
        var q = Store.resolveQ(k);
        if (q) {
          x.stem = q.stem; x.choices = q.choices;
          x.explanation = q.explanation || ''; x.hint = q.hint || '';
          if (x.answer == null) x.answer = q.answer;
          if (!x.subject) x.subject = q.subject;
          if (!x.srcLabel) x.srcLabel = q.srcLabel;
        }
      }
      delete x.slim;
      o[k] = x;
    });
    return o;
  }

  function snapshot(reason, force) {
    var list = readBackups();
    var now = Date.now();
    if (!force && list.length) {
      var prev = list[0];
      var grew = Math.abs(Object.keys(st.solved).length - (prev.solvedN || 0)) >= 20 ||
                 (st.sessions || []).length !== (prev.sessionN || 0);
      // 30분마다, 그리고 많이 풀었거나 응시가 끝났을 때 곧바로 한 벌 더 남긴다
      if (now - (prev.at || 0) < BAK_GAP && !grew) return false;
    }
    var snap = {
      at: now, reason: reason || '자동',
      solvedN: Object.keys(st.solved).length,
      wrongN: Object.keys(st.wrong).length,
      sessionN: (st.sessions || []).length,
      data: {
        solved: st.solved, wrong: slimWrong(st.wrong), sessions: st.sessions,
        bookmark: st.bookmark, theoryRead: st.theoryRead,
        progress: st.progress, attempts: st.attempts, settings: st.settings
      }
    };
    list.unshift(snap);
    while (list.length > BAK_MAX) list.pop();
    // 용량이 모자라면 오래된 것부터 버리며 재시도
    while (list.length) {
      try { localStorage.setItem(BAK, JSON.stringify(list)); return true; }
      catch (e) { list.pop(); }
    }
    return false;
  }

  function autoSnapshot() {
    // 저장할 때마다 검사하되 실제 기록은 30분에 한 번만
    try { snapshot('자동'); } catch (e) {}
  }

  /* ══════════════ 병합 ══════════════
     가져오기·스냅샷 복원은 '덮어쓰기'가 아니라 '합치기'가 기본이다.
     어느 쪽 기록도 사라지지 않게 한다(클라우드 병합과 같은 규칙). */
  /**
   * 진행 중인 풀이는 '세트 통째로'가 아니라 '문항 하나하나' 단위로 합친다.
   * 두 기기에서 번갈아(또는 동시에) 풀어도 양쪽에서 고른 답이 모두 남는다.
   *  - 한쪽만 답한 문항 → 그 답을 쓴다
   *  - 양쪽이 서로 다르게 답한 문항 → 나중에 저장된 쪽의 답
   *  - 해설을 본 표시(shown)는 한쪽이라도 봤으면 본 것으로
   *  - 세트 구성(qids·mode)이 다르면 문항을 맞출 수 없으므로 최신 것을 통째로
   */
  function mergeOneProgress(x, y) {
    var newer = ((y.at || 0) >= (x.at || 0)) ? y : x;
    var sameSet = x.mode === y.mode &&
      x.qids && y.qids && x.qids.length === y.qids.length &&
      x.qids.join('') === y.qids.join('');
    if (!sameSet) return newer;

    var n = x.qids.length, picked = new Array(n), shown = new Array(n), i;
    for (i = 0; i < n; i++) {
      var px = (x.picked || [])[i], py = (y.picked || [])[i];
      picked[i] = (px == null) ? (py == null ? null : py)
                : (py == null ? px : (newer === y ? py : px));
      shown[i] = !!((x.shown || [])[i] || (y.shown || [])[i]);
    }
    return Object.assign({}, newer, {
      picked: picked, shown: shown,
      at: Math.max(x.at || 0, y.at || 0)
    });
  }

  function mergeProgress(a, b) {
    var out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(function (k) {
      var x = out[k], y = b[k];
      out[k] = x ? mergeOneProgress(x, y) : y;
    });
    return out;
  }

  function mergeState(a, b) {
    if (!b) return a;
    if (!a) return b;
    var out = {};

    function byLater(x, y, field) {
      var m = Object.assign({}, x || {});
      Object.keys(y || {}).forEach(function (k) {
        var p = m[k], q = y[k];
        if (!p) { m[k] = q; return; }
        m[k] = ((q[field] || 0) > (p[field] || 0)) ? q : p;
      });
      return m;
    }

    out.solved = byLater(a.solved, b.solved, 'at');
    out.progress = mergeProgress(a.progress, b.progress);

    out.wrong = Object.assign({}, a.wrong || {});
    Object.keys(b.wrong || {}).forEach(function (k) {
      var x = out.wrong[k], y = b.wrong[k];
      if (!x) { out.wrong[k] = y; return; }
      var keep = ((y.last || 0) > (x.last || 0)) ? y : x;
      var other = keep === y ? x : y;
      // 본문이 비어 있는 쪽(스냅샷)이 이기면 본문은 반대쪽에서 가져온다
      out.wrong[k] = Object.assign({}, other, keep, {
        stem: keep.stem || other.stem,
        choices: keep.choices || other.choices,
        explanation: keep.explanation || other.explanation,
        count: Math.max(x.count || 0, y.count || 0),
        history: (x.history || []).length >= (y.history || []).length ? x.history : y.history
      });
    });

    out.bookmark = Object.assign({}, a.bookmark || {}, b.bookmark || {});
    out.theoryRead = Object.assign({}, a.theoryRead || {}, b.theoryRead || {});

    function dedupeByAt(arr) {
      var seen = {}, r = [];
      (arr || []).forEach(function (x) {
        var k = String(x.at);
        if (seen[k]) return;
        seen[k] = 1; r.push(x);
      });
      return r.sort(function (p, q) { return (q.at || 0) - (p.at || 0); });
    }
    out.sessions = dedupeByAt([].concat(a.sessions || [], b.sessions || [])).slice(0, 500);

    out.attempts = {};
    var keys = {};
    Object.keys(a.attempts || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(b.attempts || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      out.attempts[k] = dedupeByAt([].concat(
        (a.attempts || {})[k] || [], (b.attempts || {})[k] || []
      )).slice(0, 30);
    });

    out.settings = Object.assign({}, def.settings, b.settings || {}, a.settings || {});
    return out;
  }

  var Store = {
    s: st,
    save: save,

    /** fn 안에서 일어난 여러 번의 기록을 마지막에 한 번만 저장한다 */
    bulk: function (fn) {
      muted++;
      try { fn(); }
      finally {
        muted--;
        if (!muted && dirty) { dirty = false; save(); }
      }
    },

    /** 문항 고유 ID: 출처|번호 */
    qid: function (srcId, no) { return srcId + '#' + no; },

    /**
     * 채점 결과 기록. ok=false 면 오답노트에 누적.
     * 오답노트는 다시 맞혀도 자동으로 사라지지 않는다 — clearWrong()으로 문항별 삭제해야 없어짐.
     *
     * sess: 같은 '한 번의 풀이'를 묶는 토큰.
     *   같은 세션 안에서 답을 고쳐 다시 고르면 새 오답으로 세지 않고 마지막 기록만 갱신하고,
     *   틀렸다가 제출 전에 정답으로 고치면 그 세션이 남긴 오답 표시를 취소한다.
     *   (다른 날 다시 풀어서 맞힌 경우는 예전 오답 기록을 그대로 남긴다)
     */
    record: function (q, picked, ok, sess) {
      var id = q.qid;
      var now = Date.now();
      st.solved[id] = {
        ok: ok, picked: picked, at: now,
        subject: q.subject || null, srcLabel: q.srcLabel || '', sess: sess || null
      };
      var prev = st.wrong[id];
      if (!ok) {
        // history: 언제·무엇을 골라 틀렸는지 매번 남긴다(반복 오답 추적용)
        var hist = (prev && prev.history) ? prev.history.slice() : [];
        var tail = hist.length ? hist[hist.length - 1] : null;
        var sameSess = !!(sess && tail && tail.sess === sess);
        var entry = { at: now, picked: picked, src: q.srcLabel || '', sess: sess || null };
        if (sameSess) hist[hist.length - 1] = entry;
        else hist.push(entry);
        if (hist.length > 20) hist = hist.slice(-20);
        st.wrong[id] = {
          qid: id, subject: q.subject, stem: q.stem, choices: q.choices,
          answer: q.answer, explanation: q.explanation || '', hint: q.hint || '',
          // 오답복습으로 다시 푼 경우 출처가 넘어오지 않을 수 있어, 비어 있으면 원래 값을 지킨다
          picked: picked,
          src: q.src || (prev && prev.src) || '',
          srcLabel: q.srcLabel || (prev && prev.srcLabel) || '',
          count: (prev ? (prev.count || 0) : 0) + (sameSess ? 0 : 1), last: now,
          history: hist,
          lastOk: false
        };
      } else if (prev) {
        var h0 = prev.history || [];
        var t0 = h0.length ? h0[h0.length - 1] : null;
        if (sess && t0 && t0.sess === sess) {
          // 같은 풀이 안에서 고쳐 맞힌 것 — 이번에 붙은 오답 표시는 취소한다
          var h1 = h0.slice(0, -1);
          var c1 = Math.max(0, (prev.count || 1) - 1);
          if (!h1.length && c1 <= 0) delete st.wrong[id];
          else st.wrong[id] = Object.assign({}, prev, {
            history: h1, count: c1, lastOk: true, lastAt: now
          });
        } else {
          // 다시 맞혔음을 표시만 하고, 목록에서는 지우지 않는다(수동 삭제 전까지 유지)
          prev.lastOk = true;
          prev.lastAt = now;
        }
      }
      save();
    },

    /* ── 진행상황 자동저장 ── */
    saveProgress: function (key, data) {
      if (!key) return;
      st.progress[key] = Object.assign({ at: Date.now() }, st.progress[key], data);
      save();
    },
    loadProgress: function (key) { return key ? st.progress[key] : null; },
    clearProgress: function (key) { if (key) { delete st.progress[key]; save(); } },

    /* ── 세트별 풀이 이력(날짜·횟수·정답률) ── */
    addAttempt: function (key, rec) {
      if (!key) return;
      if (!st.attempts[key]) st.attempts[key] = [];
      st.attempts[key].unshift(Object.assign({ at: Date.now() }, rec));
      if (st.attempts[key].length > 30) st.attempts[key].length = 30;
      save();
    },
    attempts: function (key) { return (key && st.attempts[key]) || []; },

    /** 과목명을 짧게 (화약류일반→화약, 발파설계및작업→발파, 암반굴착및시공→암반, 법규→법규) */
    shortSubject: function (s) {
      return ({ '화약류일반': '화약', '발파설계및작업': '발파',
                '암반굴착및시공': '암반', '법규': '법규' })[s] || s;
    },

    /** 과목별 점수를 '화약 85 · 발파 70 …' 형태로 (없으면 빈 문자열) */
    subjectScoreText: function (bySubject) {
      if (!bySubject) return '';
      var order = ['화약류일반', '발파설계및작업', '암반굴착및시공', '법규'];
      var keys = Object.keys(bySubject).sort(function (a, b) {
        var ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      return keys.map(function (k) {
        var b = bySubject[k];
        if (!b || !b.n) return null;
        return Store.shortSubject(k) + ' ' + Math.round(b.ok / b.n * 100);
      }).filter(Boolean).join(' · ');
    },

    /** '3회 · 최근 7/25 · 화약 85 · 발파 70 … (평균 80점)' 형태 */
    attemptSummary: function (key) {
      var a = Store.attempts(key);
      if (!a.length) return null;
      var last = a[0];
      var d = new Date(last.at);
      var s = a.length + '회 · 최근 ' + (d.getMonth() + 1) + '/' + d.getDate();
      var subj = Store.subjectScoreText(last.bySubject);
      if (subj) s += ' · ' + subj;
      if (last.n != null) s += ' (평균 ' + last.pct + '점)';
      return s;
    },
    bestPct: function (key) {
      var a = Store.attempts(key).filter(function (x) { return x.n; });
      if (!a.length) return null;
      return Math.max.apply(null, a.map(function (x) { return x.pct; }));
    },

    setTheme: function (t) {
      st.settings.theme = t; save();
      document.documentElement.setAttribute('data-theme', t);
    },
    setReveal: function (r) { st.settings.reveal = r; save(); },

    clearWrong: function (id) { delete st.wrong[id]; save(); },
    clearAllWrong: function () { snapshot('오답노트 비우기 직전', true); st.wrong = {}; save(); },

    /** 다른 기기와 합쳐진 상태로 통째로 갈아끼운다(클라우드 동기화용).
     *  화면 쪽 임시 필드(_로 시작)는 들어와도 저장되지 않는다. */
    replaceAll: function (next) {
      if (!next || typeof next !== 'object') return false;
      Object.keys(def).forEach(function (k) { st[k] = (next[k] !== undefined) ? next[k] : def[k]; });
      st.settings = Object.assign({}, def.settings, next.settings || {});
      save();
      return true;
    },
    clearSessions: function () { snapshot('응시이력 비우기 직전', true); st.sessions = []; save(); },

    toggleBookmark: function (id) {
      if (st.bookmark[id]) delete st.bookmark[id]; else st.bookmark[id] = true;
      save();
    },

    addSession: function (rec) {
      st.sessions.unshift(rec);
      // 이제 기출·예상문제까지 모두 기록되므로 보관 한도를 넉넉히 잡는다
      if (st.sessions.length > 500) st.sessions.length = 500;
      save();
    },

    /** 과목별 정답률 통계 */
    statsBySubject: function () {
      var m = {};
      Object.keys(st.solved).forEach(function (id) {
        var r = st.solved[id];
        var subj = r.subject || (st.wrong[id] && st.wrong[id].subject) ||
          (typeof Store.resolveQ === 'function' && (Store.resolveQ(id) || {}).subject) || '기타';
        if (!m[subj]) m[subj] = { ok: 0, n: 0 };
        m[subj].n++; if (r.ok) m[subj].ok++;
      });
      return m;
    },

    /* ── 기록 보호 ── */
    snapshot: snapshot,
    backups: function () {
      return readBackups().map(function (b) {
        return { at: b.at, reason: b.reason, solvedN: b.solvedN, wrongN: b.wrongN, sessionN: b.sessionN };
      });
    },
    /** 스냅샷을 현재 기록에 합친다(기본) 또는 그대로 되돌린다 */
    restoreBackup: function (at, mode) {
      var b = readBackups().filter(function (x) { return x.at === at; })[0];
      if (!b) return false;
      snapshot('복원 직전', true);
      var snap = Object.assign({}, b.data, { wrong: fatWrong(b.data.wrong) });
      st = (mode === 'replace')
        ? Object.assign({}, def, snap)
        : Object.assign({}, def, mergeState(st, snap));
      Store.s = st;
      save();
      return true;
    },
    lastSaveError: function () { return lastSaveError; },
    markExported: function () { st.settings.lastExportAt = Date.now(); save(); },

    reset: function () {
      snapshot('전체 초기화 직전', true);
      st = JSON.parse(JSON.stringify(def)); Store.s = st; save();
    },

    /** localStorage를 다시 읽어들인다 (클라우드에서 기록을 병합한 직후 사용) */
    reload: function () {
      try {
        st = Object.assign({}, def, JSON.parse(localStorage.getItem(KEY) || '{}'));
      } catch (e) {
        st = JSON.parse(JSON.stringify(def));
      }
      Object.keys(def).forEach(function (k) { if (st[k] === undefined) st[k] = def[k]; });
      st.settings = Object.assign({}, def.settings, st.settings || {});
      Store.s = st;
    },

    exportJSON: function () { return JSON.stringify(st, null, 2); },
    /** mode: 'merge'(기본, 어느 쪽도 지우지 않음) | 'replace'(파일 내용으로 교체) */
    importJSON: function (txt, mode) {
      var o = JSON.parse(txt);
      snapshot('가져오기 직전', true);
      st = (mode === 'replace')
        ? Object.assign({}, def, o)
        : Object.assign({}, def, mergeState(st, o));
      Store.s = st; save();
    },
    mergeState: mergeState
  };

  // 창을 닫거나 다른 탭으로 갈 때 그 시점 상태를 한 벌 남긴다(중간에 끊겨도 되돌릴 수 있게)
  w.addEventListener('pagehide', function () { try { snapshot('종료 시점'); } catch (e) {} });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { try { snapshot('자동'); } catch (e) {} }
  });

  w.Store = Store;
})(window);
