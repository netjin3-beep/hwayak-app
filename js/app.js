/* 화약류관리기사 학습앱 — 라우터 및 화면 */
(function (w) {
  'use strict';

  var SUBJECTS = ['화약류일반', '발파설계및작업', '암반굴착및시공', '법규'];
  var SUBJ_LABEL = {
    '화약류일반': '1과목 화약류일반',
    '발파설계및작업': '2과목 발파설계 및 작업',
    '암반굴착및시공': '3과목 암반굴착 및 시공',
    '법규': '4과목 화약류 안전관리 관계 법규'
  };
  // 로컬 실행에서는 index.html이 data/*.js 를 먼저 읽어 두므로 여기서 값이 채워지고,
  // 인터넷(클라우드) 모드에서는 로그인 후에야 도착하므로 부팅 직전에 refreshData()로 다시 읽는다.
  var EXAMS = w.EXAMS || [];
  var ANSWERS = w.ANSWERS || {};
  var THEORY = w.THEORY || [];
  var PREDICTED = w.PREDICTED || [];
  var KEYWORDS = w.KEYWORDS || {};
  var IMAGES = w.IMAGES || {};

  function refreshData() {
    EXAMS = w.EXAMS || [];
    ANSWERS = w.ANSWERS || {};
    THEORY = w.THEORY || [];
    PREDICTED = w.PREDICTED || [];
    KEYWORDS = w.KEYWORDS || {};
    IMAGES = w.IMAGES || {};
    _qmap = null; _facts = null;   // 캐시 무효화
  }

  function el(id) { return document.getElementById(id); }
  function view() { return el('view'); }

  /** 문제 풀기 전 설정 바 — 기출·예상문제 탭 어디서나 같은 UI */
  function settingsBar() {
    var st = Store.s.settings;
    return '<div class="card setbar"><div class="row" style="gap:18px;flex-wrap:wrap">' +
      '<strong style="white-space:nowrap">⚙️ 풀이 설정</strong>' +
      '<label class="setitem"><span>해설 표시</span>' +
      '<select data-set="reveal">' +
      '<option value="instant"' + (st.reveal === 'instant' ? ' selected' : '') + '>답 고르면 바로</option>' +
      '<option value="click"' + (st.reveal === 'click' ? ' selected' : '') + '>「해설 보기」 클릭</option>' +
      '</select></label>' +
      '<label class="setitem"><span>화면</span>' +
      '<select data-set="theme">' +
      '<option value="light"' + (st.theme !== 'dark' ? ' selected' : '') + '>흰색</option>' +
      '<option value="dark"' + (st.theme === 'dark' ? ' selected' : '') + '>블랙</option>' +
      '</select></label>' +
      '<span class="small muted" style="margin-left:auto">설정은 저장되며 홈에서도 바꿀 수 있습니다</span>' +
      '</div></div>';
  }

  /** settingsBar()를 그린 뒤 반드시 호출 */
  function bindSettingsBar() {
    view().querySelectorAll('[data-set]').forEach(function (n) {
      n.onchange = function () {
        var k = n.dataset.set;
        if (k === 'reveal') { Store.setReveal(n.value); toast('해설 표시 방식을 바꿨습니다'); }
        else if (k === 'theme') { Store.setTheme(n.value); applyTheme(); toast('화면 테마를 바꿨습니다'); }
      };
    });
  }

  /** 풀이 세트 식별자 — 진행상황·이력 저장 단위 */
  function setKey(base, sub) { return base + '|' + (sub || 'all'); }

  function toast(msg) {
    var t = el('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ── 기출 문항 → 풀이 엔진 형식 ── */
  function normExam(q, exam) {
    var key = ANSWERS[exam.id] && ANSWERS[exam.id][String(q.no)];
    var img = (IMAGES[exam.id] || {})[String(q.no)] || null;
    return {
      img: img,
      qid: exam.id + '#' + q.no,
      no: q.no,
      stem: q.stem,
      hint: q.hint,
      rate: q.rate,
      choices: q.choices,
      subject: q.subject,
      incomplete: !!q.incomplete,
      answer: key ? key.answer : null,
      explanation: key ? key.explanation : '',
      caution: !!(key && (key.tags || []).indexOf('주의') >= 0),
      srcLabel: exam.year + '년 ' + exam.round.replace(/^\d+년_?/, ''),
      srcUrl: exam.source
    };
  }

  function normPred(p) {
    return {
      qid: 'pred#' + p.id,
      stem: p.stem, choices: p.choices, answer: p.answer,
      explanation: p.explanation, subject: p.subject,
      srcLabel: '예상문제', hint: null, incomplete: false
    };
  }

  /** 정답이 확정된 전체 문항 풀 */
  function gradablePool() {
    var pool = [];
    EXAMS.forEach(function (e) {
      if (!ANSWERS[e.id]) return;
      e.questions.forEach(function (q) {
        if (q.incomplete) return;
        var n = normExam(q, e);
        if (n.answer != null) pool.push(n);
      });
    });
    PREDICTED.forEach(function (p) { pool.push(normPred(p)); });
    return pool;
  }

  function poolBySubject() {
    var m = {}; SUBJECTS.forEach(function (s) { m[s] = []; });
    gradablePool().forEach(function (q) { if (m[q.subject]) m[q.subject].push(q); });
    return m;
  }

  /** qid → 정규화된 문항 (정답 미확정 문항 포함, 즐겨찾기 조회용) */
  var _qmap = null;
  function allQuestionsMap() {
    if (_qmap) return _qmap;
    var m = {};
    EXAMS.forEach(function (e) {
      e.questions.forEach(function (q) { var n = normExam(q, e); m[n.qid] = n; });
    });
    PREDICTED.forEach(function (p) { var n = normPred(p); m[n.qid] = n; });
    _qmap = m;
    return m;
  }

  /* ══════════════ 풀이 세트(setKey) 해석 ══════════════
     진행 중인 풀이를 화면 밖에서도 채점·집계할 수 있게, 저장된 setKey로부터
     원래 문항 묶음을 되살린다.  setKey 형식: '<기출id|pred>|<과목|all>[|exam]' */
  function parseSetKey(key) {
    var p = String(key || '').split('|');
    return { base: p[0], sub: p[1] || 'all', mode: p[2] === 'exam' ? 'exam' : 'study' };
  }

  function setLabel(key) {
    var k = parseSetKey(key);
    var name, sub;
    if (k.base === 'pred') {
      name = '예상문제';
      sub = k.sub === 'all' ? '전체' : SUBJ_LABEL[k.sub] || k.sub;
    } else {
      var e = EXAMS.filter(function (x) { return x.id === k.base; })[0];
      if (!e) return null;
      name = e.year + '년 ' + e.round.replace(/^\d+년_?/, '').replace(/_/g, ' ');
      sub = k.sub === 'all' ? '전체 100문항' : SUBJ_LABEL[k.sub] || k.sub;
    }
    return { title: name, subtitle: sub + (k.mode === 'exam' ? ' · 시험 모드' : ' · 학습 모드'),
             base: k.base, sub: k.sub, mode: k.mode,
             hash: k.base === 'pred' ? '#/predict' : '#/exams/' + encodeURIComponent(k.base) };
  }

  /** setKey에 해당하는 문항 배열(순서 포함). 무작위 출제 세트는 저장된 qids로 복원한다. */
  function resolveSet(key, qids) {
    var k = parseSetKey(key);
    var map = allQuestionsMap();
    if (qids && qids.length) {
      var arr = qids.map(function (id) { return map[id] || null; });
      if (arr.every(function (x) { return x; })) return arr;
    }
    if (k.base === 'pred') {
      var ps = PREDICTED.filter(function (p) { return k.sub === 'all' || p.subject === k.sub; });
      // 'pred|all'은 무작위 순서라 qids 없이는 순서를 신뢰할 수 없다
      if (k.sub === 'all') return null;
      return ps.map(normPred);
    }
    var e = EXAMS.filter(function (x) { return x.id === k.base; })[0];
    if (!e) return null;
    return e.questions
      .filter(function (q) { return k.sub === 'all' || q.subject === k.sub; })
      .map(function (q) { return normExam(q, e); });
  }

  /**
   * 진행 중(제출 전) 풀이를 지금 상태 그대로 채점한다.
   * 홈·통계에서 "풀고 있는 것"을 실시간으로 보여주기 위한 것.
   */
  function liveSets() {
    var pg = Store.s.progress || {};
    var out = [];
    Object.keys(pg).forEach(function (key) {
      var pr = pg[key];
      if (!pr || !pr.picked) return;
      var qs = resolveSet(key, pr.qids);
      if (!qs || qs.length !== pr.picked.length) return;
      var lab = setLabel(key);
      if (!lab) return;
      if (!pr.picked.some(function (x) { return x !== null; })) return; // 아직 한 문항도 안 푼 세트는 제외
      var ok = 0, n = 0, answered = 0, bySubject = {};
      qs.forEach(function (q, i) {
        var p = pr.picked[i];
        if (p == null) return;
        answered++;
        if (q.answer == null) return;
        var s = q.subject || '기타';
        bySubject[s] = bySubject[s] || { ok: 0, n: 0 };
        bySubject[s].n++; n++;
        if (p === q.answer) { bySubject[s].ok++; ok++; }
      });
      out.push({
        key: key, title: lab.title, subtitle: lab.subtitle, hash: lab.hash,
        base: lab.base, sub: lab.sub, mode: lab.mode,
        total: qs.length, answered: answered, ok: ok, n: n,
        pct: n ? Math.round(ok / n * 100) : 0,
        bySubject: bySubject, at: pr.at || 0, qs: qs, picked: pr.picked
      });
    });
    return out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  /**
   * 제출하지 않고 나온 풀이도 통계·오답노트에 남기기.
   * 앱을 켤 때 한 번 돌면서, 진행 중인 세트에서 이미 고른 답 중
   * 아직 기록되지 않은 문항을 채점 기록에 채워 넣는다.
   * (예전 버전에서는 '제출하고 채점'을 눌러야만 기록이 남았다)
   */
  function backfillProgress() {
    var added = 0;
    Store.bulk(function () { added = backfillProgressInner(); });
    return added;
  }

  function backfillProgressInner() {
    var pg = Store.s.progress || {};
    var added = 0;
    Object.keys(pg).forEach(function (key) {
      var pr = pg[key];
      if (!pr || !pr.picked) return;
      var qs = resolveSet(key, pr.qids);
      if (!qs || qs.length !== pr.picked.length) return;
      var sess = pr.sess || (key + '#backfill');
      qs.forEach(function (q, i) {
        var p = pr.picked[i];
        if (p == null || q.answer == null) return;
        if (Store.s.solved[q.qid]) return;      // 이미 기록된 문항은 건드리지 않는다
        Store.record(q, p, p === q.answer, sess);
        added++;
      });
      if (!pr.sess) Store.saveProgress(key, { sess: sess });
    });
    return added;
  }

  /** 문항 단위 누적 통계 — 제출 여부와 무관하게 '푼 문항'이 곧바로 반영된다 */
  function solvedStats() {
    var st = Store.s;
    var bys = {}, total = 0, okN = 0;
    Object.keys(st.solved).forEach(function (id) {
      var r = st.solved[id];
      var subj = r.subject || (st.wrong[id] && st.wrong[id].subject) || findSubject(id) || '기타';
      bys[subj] = bys[subj] || { ok: 0, n: 0 };
      bys[subj].n++; total++;
      if (r.ok) { bys[subj].ok++; okN++; }
    });
    return { bySubject: bys, n: total, ok: okN, pct: total ? Math.round(okN / total * 100) : 0 };
  }

  /** 회차·세트별 성취도 — solved 기록만으로 집계하므로 제출하지 않아도 잡힌다 */
  function perExamStats() {
    var st = Store.s, rows = [];
    function add(bys, subj, ok) {
      var s = subj || '기타';
      bys[s] = bys[s] || { ok: 0, n: 0 };
      bys[s].n++; if (ok) bys[s].ok++;
    }
    EXAMS.forEach(function (e) {
      var n = 0, ok = 0, last = 0, bys = {};
      e.questions.forEach(function (q) {
        var r = st.solved[e.id + '#' + q.no];
        if (!r) return;
        n++; if (r.ok) ok++;
        add(bys, q.subject, r.ok);
        if ((r.at || 0) > last) last = r.at;
      });
      if (!n) return;
      rows.push({
        id: e.id, hash: '#/exams/' + encodeURIComponent(e.id),
        title: e.year + '년 ' + e.round.replace(/^\d+년_?/, '').replace(/_/g, ' '),
        total: e.questions.length, n: n, ok: ok,
        pct: Math.round(ok / n * 100), last: last, bySubject: bys
      });
    });
    var pn = 0, pok = 0, plast = 0, pbys = {};
    PREDICTED.forEach(function (p) {
      var r = st.solved['pred#' + p.id];
      if (!r) return;
      pn++; if (r.ok) pok++;
      add(pbys, p.subject, r.ok);
      if ((r.at || 0) > plast) plast = r.at;
    });
    if (pn) {
      rows.push({
        id: 'pred', hash: '#/predict', title: '예상문제',
        total: PREDICTED.length, n: pn, ok: pok,
        pct: Math.round(pok / pn * 100), last: plast, bySubject: pbys
      });
    }
    return rows.sort(function (a, b) { return (b.last || 0) - (a.last || 0); });
  }

  /** 과목별 점수를 작은 칩 줄로 — 회차 행·응시 기록에 함께 붙인다 */
  function subjectChips(bySubject) {
    if (!bySubject) return '';
    var out = SUBJECTS.map(function (s) {
      var b = bySubject[s];
      if (!b || !b.n) return null;
      var p = Math.round(b.ok / b.n * 100);
      var cls = p < 40 ? 'bad' : p >= 60 ? 'ok' : 'warn';
      return '<span class="subjchip ' + cls + '">' + Store.shortSubject(s) +
        ' <b>' + p + '</b><i>' + b.ok + '/' + b.n + '</i></span>';
    }).filter(Boolean).join('');
    return out ? '<div class="subjchips">' + out + '</div>' : '';
  }

  /**
   * 자료 실태를 데이터에서 직접 집계한다.
   * 해설을 채우거나 손검증을 추가하면 별도 수정 없이 자동으로 반영된다.
   *   handChecked : 손검증 태그(검증/보충/원본+보완)가 붙은 문항
   *   withAnswer  : 정답이 있는 기출 문항(이미지문항 제외)
   *   withExpl    : 그중 해설 본문이 있는 문항
   *   caution     : comcbt 정답 오류신고가 접수된 문항
   */
  var _facts = null;
  function dataFacts() {
    if (_facts) return _facts;
    var f = { total: 0, imageOnly: 0, withAnswer: 0, withExpl: 0, handChecked: 0, caution: 0 };
    EXAMS.forEach(function (e) {
      var ak = ANSWERS[e.id] || {};
      e.questions.forEach(function (q) {
        f.total++;
        if (q.incomplete) { f.imageOnly++; return; }
        var k = ak[String(q.no)];
        if (!k || k.answer == null) return;
        f.withAnswer++;
        var tags = k.tags || [];
        if ((k.explanation || '').trim()) f.withExpl++;
        if (tags.indexOf('검증') >= 0 || tags.indexOf('보충') >= 0 ||
            tags.indexOf('원본+보완') >= 0) f.handChecked++;
        if (tags.indexOf('주의') >= 0) f.caution++;
      });
    });
    _facts = f;
    return f;
  }

  /** 문제풀이 화면에서 별표(★) 표시한 문항 목록 */
  function bookmarkedList() {
    var map = allQuestionsMap();
    var out = [];
    Object.keys(Store.s.bookmark).forEach(function (id) { if (map[id]) out.push(map[id]); });
    out.sort(function (a, b) { return (a.srcLabel || '').localeCompare(b.srcLabel || ''); });
    return out;
  }

  /* ══════════════ 홈 ══════════════ */
  function viewHome() {
    var st = Store.s;
    var wrongN = Object.keys(st.wrong).length;
    var solved = Object.keys(st.solved).length;
    var okN = Object.keys(st.solved).filter(function (k) { return st.solved[k].ok; }).length;
    var acc = solved ? Math.round(okN / solved * 100) : 0;
    var pool = gradablePool();
    var totalQ = EXAMS.reduce(function (a, e) { return a + e.questions.length; }, 0);

    var h = '<h2 class="page">학습 현황</h2>' +
      '<p class="lead">2026년 개편 4과목 체계 · 필기 80문항 / 2시간 · 과목당 40점 이상 &amp; 평균 60점 이상 합격</p>';

    h += '<div class="grid g4">' +
      tile('시험까지', dday(), st.settings.examDate + ' 시행', 'dday') +
      tile('푼 문항', solved + '<span style="font-size:15px">문항</span>', '누적 학습량') +
      tile('정답률', acc + '<span style="font-size:15px">%</span>', okN + '/' + solved + ' 정답') +
      tile('오답노트', wrongN + '<span style="font-size:15px">개</span>', wrongN ? '복습이 필요합니다' : '깨끗합니다') +
      '</div>';

    // 풀던 세트 이어 풀기 — 제출 전 기록도 이미 통계·오답노트에 들어가 있다
    var live = liveSets();
    if (live.length) {
      h += '<div class="card"><div class="row" style="justify-content:space-between">' +
        '<strong>풀던 문제 이어 풀기</strong>' +
        '<a class="small muted" href="#/stats">통계에서 보기 →</a></div>' +
        '<div class="list" style="margin-top:11px">';
      live.slice(0, 4).forEach(function (L) {
        h += '<a class="item" href="' + L.hash + '">' +
          '<span class="tag acc">' + (L.mode === 'exam' ? '시험' : '학습') + '</span>' +
          '<div><div class="t">' + MD.esc(L.title) + '</div>' +
          '<div class="d">' + MD.esc(L.subtitle) + ' · ' + L.answered + '/' + L.total + '문항 응답' +
          (L.n ? ' · 현재 ' + L.pct + '점' : '') + '</div></div>' +
          '<span class="right muted">→</span></a>';
      });
      h += '</div><div class="small muted" style="margin-top:9px">' +
        '제출하지 않아도 고른 답은 이미 통계·오답노트에 반영되어 있습니다.</div></div>';
    }

    // 과목별 성취도
    var bys = solvedStats().bySubject;

    h += '<div class="card"><strong>과목별 성취도</strong><div class="grid g2" style="margin-top:12px">';
    SUBJECTS.forEach(function (s) {
      var b = bys[s] || { ok: 0, n: 0 };
      var p = b.n ? Math.round(b.ok / b.n * 100) : 0;
      h += '<div><div class="row" style="justify-content:space-between">' +
        '<span class="small" style="font-weight:650">' + SUBJ_LABEL[s] + '</span>' +
        '<span class="small muted">' + (b.n ? p + '% (' + b.ok + '/' + b.n + ')' : '미학습') + '</span></div>' +
        '<div class="bar ' + (!b.n ? '' : p < 40 ? 'bad' : p >= 60 ? 'ok' : '') + '"><i style="width:' + p + '%"></i></div></div>';
    });
    h += '</div></div>';

    h += '<div class="grid g2">' +
      '<div class="card"><strong>바로 시작</strong><div class="list" style="margin-top:11px">' +
      goItem('#/mock', '🎯', '실전 모의고사', '80문항 · 2시간 · 실제 시험과 동일 구성') +
      goItem('#/exams/2021년_4회', '📖', '2021년 4회 정밀해설', '100문항 전체 해설 검증 완료') +
      (wrongN ? goItem('#/wrong', '🔁', '오답 복습', wrongN + '개 문항이 대기 중입니다') :
        goItem('#/predict', '✨', '과목별 예상문제', PREDICTED.length + '문항 · 해설 포함')) +
      '</div></div>';

    var f = dataFacts();
    var explPct = f.withAnswer ? Math.round(f.withExpl / f.withAnswer * 100) : 0;

    h += '<div class="card"><strong>자료 현황</strong>' +
      '<div class="list" style="margin-top:11px">' +
      infoRow('기출문제', EXAMS.length + '개 회차 / ' + totalQ + '문항', '2003~2021년') +
      infoRow('채점 가능', pool.length + '문항', '기출 ' + f.withAnswer + ' + 예상문제 ' + PREDICTED.length) +
      infoRow('해설 있음', f.withExpl + '문항 (' + explPct + '%)', '기출 정답보유 문항 기준') +
      infoRow('이론정리', THEORY.length + '개 단원', '4과목 + 공식암기카드') +
      infoRow('예상문제', PREDICTED.length + '문항', '전 문항 해설 포함') +
      '</div>' +
      '<div class="small muted" style="margin-top:10px;line-height:1.6">' +
      '정답 출처: 손검증 ' + f.handChecked + '문항(2021년 4회 중심) · 나머지는 comcbt.com 이용자 데이터입니다. ' +
      (f.caution ? '이 중 <strong>' + f.caution + '문항</strong>은 정답 오류신고가 있어 <span class="tag warn">주의</span> 표시됩니다. ' : '') +
      '이미지 문항 ' + f.imageOnly + '개는 채점에서 제외됩니다.' +
      '</div></div></div>';

    // 최근 모의고사
    if (st.sessions.length) {
      h += '<div class="card"><strong>최근 응시 기록</strong><div class="list" style="margin-top:11px">';
      st.sessions.slice(0, 6).forEach(function (s) {
        var nw = s.wrongQids ? s.wrongQids.length : null;
        h += '<a class="item" href="#/session/' + s.at + '">' +
          '<span class="tag ' + (s.pass ? 'ok' : 'bad') + '">' + (s.pass ? '합격' : '불합격') + '</span>' +
          '<div><div class="t">' + MD.esc(s.title) + '</div>' +
          '<div class="d">' + new Date(s.at).toLocaleString('ko-KR') +
          (s.elapsed ? ' · ' + Quiz.fmtTime(s.elapsed) : '') +
          (nw != null ? ' · 오답 ' + nw + '개' : '') + '</div></div>' +
          '<div class="right"><strong style="font-size:18px">' + s.pct + '점</strong>' +
          '<span class="small muted">' + s.score + '/' + s.total + '</span></div></a>';
      });
      h += '</div></div>';
    }

    h += '<div class="card"><strong>학습 설정</strong><div class="setgrid">' +
      '<label><span>화면 테마</span>' +
      '<select id="setTheme"><option value="light">기본(흰색)</option><option value="dark">블랙(다크)</option></select></label>' +
      '<label><span>해설 표시</span>' +
      '<select id="setReveal"><option value="instant">답 고르면 바로 표시</option>' +
      '<option value="click">「해설 보기」 눌러야 표시</option></select></label>' +
      '<label><span>시험일</span>' +
      '<input type="date" id="setDate" value="' + st.settings.examDate + '"></label>' +
      '</div></div>';

    // 저장 상태 진단
    var proto = location.protocol;
    var originLabel = proto === 'file:' ? 'index.html 직접 열기 (file://)' :
      (location.origin + ' (로컬 서버)');
    var bytes = 0;
    try { bytes = (localStorage.getItem('hwayak_v1') || '').length; } catch (e) {}
    var persistOK = true;
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { persistOK = false; }

    var baks = Store.backups();
    var lastExp = st.settings.lastExportAt || 0;
    var expDays = lastExp ? Math.floor((Date.now() - lastExp) / 86400000) : null;

    h += '<div class="card"><strong>학습기록 저장</strong>' +
      '<div class="list" style="margin-top:11px">' +
      infoRow('기록 유지', persistOK ? '브라우저를 껐다 켜도 유지됩니다' : '⚠️ 저장 불가(시크릿 모드?)',
        '컴퓨터 안에만 저장되고 외부로 전송되지 않습니다') +
      infoRow('저장 위치', MD.esc(originLabel), '실행 방식이 바뀌면 기록이 분리됩니다') +
      infoRow('현재 용량', (bytes / 1024).toFixed(1) + ' KB',
        '푼 문항 ' + solved + '개 · 오답 ' + wrongN + '개 · 응시 ' + st.sessions.length + '회') +
      infoRow('자동 백업', baks.length ? baks.length + '벌 보관 중' : '곧 만들어집니다',
        '본 기록과 별도 칸에 보관 · 최근 ' + baks.length + '개 · 아래에서 되돌릴 수 있습니다') +
      infoRow('파일 백업', lastExp ? expDays + '일 전' : '아직 없음',
        expDays === null || expDays >= 7
          ? '⚠️ 컴퓨터가 고장 나거나 브라우저 데이터를 지우면 자동 백업도 함께 사라집니다 — 내보내기를 권합니다'
          : '내보낸 JSON 파일은 이 컴퓨터 밖에서도 안전합니다') +
      '</div>' +
      '<div class="notice" style="margin-top:12px">' +
      '<strong>기록이 사라지지 않게 하려면</strong><br>' +
      '① <strong>항상 같은 방법으로 실행하세요.</strong> ' +
      (proto === 'file:'
        ? '지금은 <code>index.html</code>을 직접 연 상태입니다. <code>실행.command</code>로 열면 <em>다른 저장 공간</em>이 되어 지금 기록이 보이지 않습니다.'
        : '지금은 <code>실행.command</code>(로컬 서버)로 연 상태입니다. <code>index.html</code>을 직접 열면 <em>다른 저장 공간</em>이 되어 이 기록이 보이지 않습니다.') +
      '<br>② 시크릿(사생활 보호) 창에서는 창을 닫는 순간 기록이 지워집니다.<br>' +
      '③ 브라우저 «인터넷 사용 기록 삭제»에서 쿠키·사이트 데이터를 지우면 학습기록도 함께 지워집니다.<br>' +
      '④ 브라우저를 바꾸거나 백업이 필요하면 아래 <strong>내보내기</strong>로 JSON을 저장해 두세요.' +
      '</div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn sm" id="btnExport">내보내기(백업)</button>' +
      '<button class="btn sm" id="btnImport">가져오기(합치기)</button>' +
      '<button class="btn sm" id="btnReset">전체 초기화</button></div></div>';

    /* ── 자동 백업(스냅샷) 되돌리기 ── */
    h += '<div class="card"><strong>자동 백업</strong>' +
      '<div class="small muted" style="margin-top:3px">' +
      '기록이 바뀔 때 30분에 한 벌씩, 그리고 <strong>비우기·초기화·가져오기 직전</strong>에 자동으로 남깁니다. ' +
      '되돌리기는 기본이 <strong>합치기</strong>라 지금 기록이 사라지지 않습니다.</div>';
    if (!baks.length) {
      h += '<div class="small muted" style="margin-top:10px">아직 백업이 없습니다. 문제를 풀면 곧 만들어집니다.</div>';
    } else {
      h += '<div class="list" style="margin-top:11px">';
      baks.forEach(function (b) {
        var d = new Date(b.at);
        h += '<div class="item" style="cursor:default">' +
          '<span class="tag">' + MD.esc(b.reason || '자동') + '</span>' +
          '<div><div class="t">' + d.toLocaleDateString('ko-KR') + ' ' + d.toTimeString().slice(0, 5) + '</div>' +
          '<div class="d">푼 문항 ' + (b.solvedN || 0) + ' · 오답 ' + (b.wrongN || 0) +
          ' · 응시 ' + (b.sessionN || 0) + '회</div></div>' +
          '<button class="btn sm right" data-bak="' + b.at + '">되돌리기</button></div>';
      });
      h += '</div>';
    }
    h += '</div>';

    view().innerHTML = h;

    el('setTheme').value = st.settings.theme || 'light';
    el('setTheme').onchange = function () { Store.setTheme(this.value); toast('테마를 바꿨습니다'); };
    el('setReveal').value = st.settings.reveal || 'instant';
    el('setReveal').onchange = function () { Store.setReveal(this.value); toast('해설 표시 방식을 바꿨습니다'); };
    el('setDate').onchange = function () {
      st.settings.examDate = this.value; Store.save();
      el('dday').textContent = st.settings.examDate + ' 시행 · ' + dday();
      route();
    };

    el('btnExport').onclick = function () {
      var b = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = '화약류관리기사_학습기록_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      Store.markExported();
      toast('학습기록을 내려받았습니다');
    };
    el('btnImport').onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          // 기본은 '합치기' — 지금 기록을 지우지 않는다.
          var replace = !confirm(
            '가져온 파일을 지금 기록과 합칠까요?\n\n' +
            '[확인] 합치기 — 오답노트·즐겨찾기는 양쪽 모두 남기고, 같은 문항은 나중에 푼 것으로 (권장)\n' +
            '[취소] 덮어쓰기 — 지금 기록을 파일 내용으로 완전히 교체 (되돌리기용 백업은 자동 저장됨)');
          try {
            Store.importJSON(r.result, replace ? 'replace' : 'merge');
            toast(replace ? '파일 내용으로 교체했습니다' : '기존 기록과 합쳤습니다');
            route();
          } catch (e) { alert('파일을 읽을 수 없습니다: ' + e.message); }
        };
        r.readAsText(f);
      };
      inp.click();
    };
    el('btnReset').onclick = function () {
      // 되돌릴 수 없는 동작이므로 직접 입력해서 확인받는다(백업은 자동으로 남는다)
      var typed = prompt(
        '모든 학습기록(푼 문항 ' + solved + '개 · 오답노트 ' + wrongN + '개 · 응시 ' +
        st.sessions.length + '회)을 지웁니다.\n' +
        '되돌리려면 홈 화면의 「자동 백업」에서 복원해야 합니다.\n\n' +
        '정말 지우려면 아래에 초기화 라고 입력하세요.');
      if (typed === null) return;
      if (typed.trim() !== '초기화') { toast('입력이 달라 취소했습니다'); return; }
      Store.reset(); toast('초기화했습니다 (자동 백업에서 되돌릴 수 있습니다)'); route();
    };

    view().querySelectorAll('[data-bak]').forEach(function (n) {
      n.onclick = function () {
        var at = +n.dataset.bak;
        var d = new Date(at);
        var replace = !confirm(
          d.toLocaleString('ko-KR') + ' 백업으로 되돌립니다.\n\n' +
          '[확인] 합치기 — 백업과 지금 기록을 모두 살립니다 (권장)\n' +
          '[취소] 그대로 교체 — 지금 기록을 백업 시점 상태로 되돌립니다');
        if (Store.restoreBackup(at, replace ? 'replace' : 'merge')) {
          toast(replace ? '백업 시점으로 되돌렸습니다' : '백업을 지금 기록과 합쳤습니다');
          route();
        } else toast('백업을 찾지 못했습니다');
      };
    });
  }

  function findSubject(qid) {
    var p = qid.split('#');
    if (p[0] === 'pred') {
      var f = PREDICTED.filter(function (x) { return String(x.id) === p[1]; })[0];
      return f && f.subject;
    }
    var e = EXAMS.filter(function (x) { return x.id === p[0]; })[0];
    if (!e) return null;
    var q = e.questions.filter(function (x) { return String(x.no) === p[1]; })[0];
    return q && q.subject;
  }

  function tile(k, v, n, cls) {
    return '<div class="stat' + (cls ? ' ' + cls : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + n + '</div></div>';
  }
  function goItem(hash, ico, t, d) {
    return '<a class="item" href="' + hash + '"><span style="font-size:20px">' + ico + '</span>' +
      '<div><div class="t">' + t + '</div><div class="d">' + d + '</div></div>' +
      '<span class="right muted">→</span></a>';
  }
  function infoRow(t, v, d) {
    return '<div class="item" style="cursor:default"><div><div class="t">' + t + '</div>' +
      '<div class="d">' + d + '</div></div><div class="right"><strong>' + v + '</strong></div></div>';
  }

  function dday() {
    var d = new Date(Store.s.settings.examDate + 'T00:00:00');
    var n = new Date(); n.setHours(0, 0, 0, 0);
    var diff = Math.round((d - n) / 86400000);
    return diff > 0 ? 'D-' + diff : diff === 0 ? 'D-DAY' : 'D+' + (-diff);
  }

  /* ══════════════ 이론정리 ══════════════ */
  function viewTheory(subjId) {
    if (!THEORY.length) {
      view().innerHTML = '<div class="empty"><div class="ico">📚</div>이론 데이터가 없습니다.<br>' +
        '<span class="small">build_data.py 를 실행해 data/theory.js 를 생성하세요.</span></div>';
      return;
    }
    var cur = THEORY.filter(function (t) { return t.id === subjId; })[0] || THEORY[0];

    var h = '<h2 class="page">이론 · 핵심정리</h2>' +
      '<p class="lead">2026년 개편 출제기준 4과목 체계</p>' +
      '<div class="split"><div class="side"><div class="card" style="padding:10px">';
    THEORY.forEach(function (t) {
      h += '<div class="sec' + (t.id === cur.id ? ' active' : '') + '" data-go="#/theory/' + t.id + '">' +
        MD.esc(t.title) + '</div>';
      if (t.id === cur.id) {
        (t.toc || []).forEach(function (x) {
          h += '<div class="toc" data-scroll="' + x.id + '">' + MD.esc(x.text) + '</div>';
        });
      }
    });
    h += '</div>';

    h += '</div>';

    h += '<div><div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px">' +
      '<input type="search" id="thSearch" placeholder="이 단원에서 검색…" style="flex:1">' +
      '<button class="btn sm" id="btnPrint">인쇄</button></div></div>' +
      '<div class="card md" id="thBody">' + MD.render(cur.md) + '</div></div></div>';

    view().innerHTML = h;

    view().querySelectorAll('[data-go]').forEach(function (n) {
      n.onclick = function () { location.hash = n.dataset.go; };
    });
    view().querySelectorAll('[data-scroll]').forEach(function (n) {
      n.onclick = function () {
        var t = document.getElementById(n.dataset.scroll);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    el('btnPrint').onclick = function () { window.print(); };
    el('thSearch').oninput = function () {
      var q = this.value.trim();
      var body = el('thBody');
      if (!q) { body.innerHTML = MD.render(cur.md); return; }
      var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      body.innerHTML = MD.render(cur.md).replace(/>([^<]+)</g, function (m, txt) {
        return '>' + txt.replace(re, '<mark style="background:var(--mark);color:var(--fg);border-radius:3px;padding:0 2px">$1</mark>') + '<';
      });
    };
  }

  /** 회차별 정답·해설·주의 집계 */
  function roundStats(e) {
    var ak = ANSWERS[e.id] || {};
    var s = { ans: 0, expl: 0, caution: 0, img: 0 };
    e.questions.forEach(function (q) {
      if (q.incomplete) { s.img++; return; }
      var k = ak[String(q.no)];
      if (!k || k.answer == null) return;
      s.ans++;
      if ((k.explanation || '').trim()) s.expl++;
      if ((k.tags || []).indexOf('주의') >= 0) s.caution++;
    });
    return s;
  }

  /* ══════════════ 기출문제 ══════════════ */
  function viewExams() {
    var f = dataFacts();
    var explPct = f.withAnswer ? Math.round(f.withExpl / f.withAnswer * 100) : 0;

    var h = '<h2 class="page">기출문제</h2>' +
      '<p class="lead">2003~2021년 ' + EXAMS.length + '개 회차 · 각 100문항 · ' +
      '<strong>전 회차 정답 보유</strong>(' + f.withAnswer + '문항), 해설은 ' + f.withExpl + '문항(' + explPct + '%)에 있습니다.</p>';

    h += settingsBar();

    h += '<div class="notice">2022년부터 CBT 전환으로 기출이 비공개라 2021년 4회가 마지막 공개 회차입니다.<br>' +
      '정답은 <strong>2021년 4회 100문항이 손검증</strong>되었고, 나머지는 comcbt.com 이용자 데이터를 연동했습니다. ' +
      '정답 오류신고가 있던 문항에는 <span class="tag warn">주의</span> 표시가 붙습니다. ' +
      '해설은 최신 회차부터 채워 나가는 중이라 옛 회차일수록 비어 있는 문항이 많습니다.</div>';

    h += '<div class="list">';
    EXAMS.slice().reverse().forEach(function (e) {
      var hasKey = !!ANSWERS[e.id];
      var rs = roundStats(e);
      var nBad = rs.img;
      var sumAll = Store.attemptSummary(setKey(e.id, 'all'));
      var pr = Store.loadProgress(setKey(e.id, 'all'));
      var doneN = pr && pr.picked ? pr.picked.filter(function (x) { return x !== null; }).length : 0;
      h += '<a class="item" href="#/exams/' + encodeURIComponent(e.id) + '">' +
        '<div><div class="t">' + e.year + '년 ' + e.round.replace(/^\d+년_?/, '').replace(/_/g, ' ') +
        (e.date ? ' <span class="small muted">(' + e.date + ')</span>' : '') + '</div>' +
        '<div class="d">100문항' +
        (nBad ? ' · 이미지문항 ' + nBad + '개' : '') +
        (rs.caution ? ' · <span style="color:var(--warn)">주의 ' + rs.caution + '개</span>' : '') +
        (sumAll ? ' · <span class="hist">✔ ' + sumAll + '</span>' : '') +
        (!sumAll && doneN ? ' · <span class="hist">진행 중 ' + doneN + '/100</span>' : '') +
        '</div></div>' +
        '<div class="right">' +
        (hasKey ? '<span class="tag ok">정답 ' + rs.ans + '</span>' : '<span class="tag warn">정답 없음</span>') +
        '<span class="tag ' + (rs.expl === 0 ? '' : rs.expl >= rs.ans * 0.8 ? 'ok' : 'warn') + '">해설 ' + rs.expl + '</span>' +
        '<span class="muted">→</span></div></a>';
    });
    h += '</div>';
    view().innerHTML = h;
    bindSettingsBar();
  }

  function viewExamRound(id) {
    var exam = EXAMS.filter(function (e) { return e.id === id; })[0];
    if (!exam) { location.hash = '#/exams'; return; }
    var hasKey = !!ANSWERS[exam.id];

    var rs = roundStats(exam);
    var handChecked = exam.id === '2021년_4회';

    var h = '<h2 class="page">' + exam.year + '년 ' + exam.round.replace(/^\d+년_?/, '').replace(/_/g, ' ') + '</h2>' +
      '<p class="lead">' + (exam.date || '') + ' 시행 · 100문항 · ' +
      (hasKey
        ? '정답 <strong>' + rs.ans + '</strong>문항 · 해설 <strong>' + rs.expl + '</strong>문항' +
          (handChecked ? ' · <span style="color:var(--ok)">전 문항 손검증 완료</span>'
                       : ' <span class="muted">(comcbt 연동)</span>')
        : '정답 없음') + '</p>';

    if (rs.caution) {
      h += '<div class="notice">⚠️ 이 회차에는 정답 오류신고가 접수된 문항이 <strong>' + rs.caution +
        '개</strong> 있습니다. 해당 문항에는 <span class="tag warn">주의</span> 표시가 붙으니 정답을 그대로 믿지 말고 해설을 확인하세요.</div>';
    }

    h += settingsBar();

    if (!hasKey) {
      h += '<div class="notice">이 회차는 공식 정답표가 없어 <strong>채점되지 않습니다.</strong> ' +
        '문제 열람과 힌트 확인용으로 사용하고, 정확한 채점은 ' +
        (exam.source ? '<a href="' + exam.source + '" target="_blank" rel="noopener">원본 CBT</a>' : 'CBT 사이트') +
        '에서 진행하세요.</div>';
    }

    h += '<div class="grid g2">';
    var sumAll = Store.attemptSummary(setKey(exam.id, 'all'));
    var prAll = Store.loadProgress(setKey(exam.id, 'all'));
    var doneAll = prAll && prAll.picked ? prAll.picked.filter(function (x) { return x !== null; }).length : 0;
    h += '<div class="card"><strong>전체 풀기</strong><div class="small muted" style="margin-top:3px">100문항 · 과목 순서대로</div>' +
      (sumAll ? '<div class="hist" style="margin-top:6px">✔ ' + sumAll + '</div>' : '') +
      (doneAll ? '<div class="hist" style="margin-top:6px">▶ 진행 중 ' + doneAll + '/100 — ' +
        (prAll.i + 1) + '번에서 이어집니다</div>' : '') +
      '<div class="row" style="margin-top:11px">' +
      '<button class="btn primary" data-run="all|study">' + (doneAll ? '이어 풀기' : '학습 모드') + '</button>' +
      (hasKey ? '<button class="btn" data-run="all|exam">시험 모드(2시간)</button>' : '') +
      '</div></div>';

    var bys = {};
    exam.questions.forEach(function (q) { (bys[q.subject] = bys[q.subject] || []).push(q); });
    h += '<div class="card"><strong>과목별 풀기</strong><div class="list" style="margin-top:11px">';
    SUBJECTS.forEach(function (s) {
      var arr = bys[s] || [];
      if (!arr.length) return;
      var sk = setKey(exam.id, s), sm = Store.attemptSummary(sk);
      var pk = Store.loadProgress(sk);
      var dn = pk && pk.picked ? pk.picked.filter(function (x) { return x !== null; }).length : 0;
      h += '<div class="item" data-run="' + s + '|study">' +
        '<div><div class="t">' + SUBJ_LABEL[s] + '</div>' +
        '<div class="d">' + arr.length + '문항' +
        (sm ? ' · <span class="hist">✔ ' + sm + '</span>' : '') +
        (!sm && dn ? ' · <span class="hist">진행 중 ' + dn + '/' + arr.length + '</span>' : '') +
        '</div></div><span class="right muted">→</span></div>';
    });
    h += '</div></div></div>';

    // 이 회차에서 틀린 문항
    h += wrongOfRoundCard(roundLabelOf(exam.id));

    // 문항 미리보기
    h += '<div class="card"><strong>문항 목록</strong><div class="list" style="margin-top:11px">';
    exam.questions.forEach(function (q) {
      var key = hasKey && ANSWERS[exam.id][String(q.no)];
      h += '<div class="item" data-jump="' + q.no + '">' +
        '<span class="tag">' + q.no + '</span>' +
        '<div style="min-width:0"><div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        MD.esc(q.stem) + '</div>' +
        '<div class="d">' + MD.esc(q.subject) + (q.rate != null ? ' · 정답률 ' + q.rate + '%' : '') + '</div></div>' +
        '<div class="right">' +
        (q.incomplete ? '<span class="tag warn">이미지</span>' : '') +
        (q.hint ? '<span class="tag info">힌트</span>' : '') +
        (key ? '<span class="tag ok">' + Quiz.CIRCLE[key.answer - 1] + '</span>' : '') +
        '</div></div>';
    });
    h += '</div></div>';

    view().innerHTML = h;
    bindSettingsBar();
    bindWrongRun('#/exams/' + encodeURIComponent(exam.id));

    view().querySelectorAll('[data-run]').forEach(function (n) {
      n.onclick = function () {
        var p = n.dataset.run.split('|');
        runExam(exam, p[0], p[1], 0);
      };
    });
    view().querySelectorAll('[data-jump]').forEach(function (n) {
      n.onclick = function () {
        var no = +n.dataset.jump;
        var idx = exam.questions.findIndex(function (q) { return q.no === no; });
        runExam(exam, 'all', 'study', idx);
      };
    });
  }

  function runExam(exam, subj, mode, startIdx) {
    var qs = exam.questions
      .filter(function (q) { return subj === 'all' || q.subject === subj; })
      .map(function (q) { return normExam(q, exam); });
    Quiz.start({
      questions: qs,
      mode: mode,
      setKey: setKey(exam.id, subj) + (mode === 'exam' ? '|exam' : ''),
      startIdx: startIdx || 0,
      title: exam.year + '년 ' + exam.round.replace(/^\d+년_?/, '').replace(/_/g, ' '),
      subtitle: (subj === 'all' ? '전체 100문항' : SUBJ_LABEL[subj]) +
        (mode === 'exam' ? ' · 시험 모드' : ' · 학습 모드'),
      timeLimit: mode === 'exam' ? 7200 : null,
      sessionType: '기출',
      backHash: '#/exams/' + encodeURIComponent(exam.id)
    });
  }

  /* ══════════════ 예상문제 ══════════════ */
  function viewPredict() {
    if (!PREDICTED.length) {
      view().innerHTML = '<div class="empty"><div class="ico">✨</div>예상문제 데이터가 없습니다.</div>';
      return;
    }
    var bys = {};
    PREDICTED.forEach(function (p) { (bys[p.subject] = bys[p.subject] || []).push(p); });

    var h = '<h2 class="page">과목별 예상문제</h2>' +
      '<p class="lead">2003~2021년 기출 ' + EXAMS.length + '개 회차의 출제 패턴·빈출 키워드 분석을 바탕으로 작성 · 전 문항 해설 포함</p>';

    h += settingsBar();

    h += '<div class="grid g2">';
    SUBJECTS.forEach(function (s) {
      var arr = bys[s] || [];
      if (!arr.length) return;
      var sk = 'pred|' + s, sm = Store.attemptSummary(sk), best = Store.bestPct(sk);
      var pk = Store.loadProgress(sk);
      var dn = pk && pk.picked ? pk.picked.filter(function (x) { return x !== null; }).length : 0;
      h += '<div class="card"><div class="row" style="justify-content:space-between">' +
        '<strong>' + SUBJ_LABEL[s] + '</strong><span class="tag acc">' + arr.length + '문항</span></div>' +
        '<div class="hist" style="margin:7px 0 12px">' +
        (sm ? '✔ ' + sm + (best != null ? ' · 최고 ' + best + '%' : '')
            : dn ? '▶ 진행 중 ' + dn + '/' + arr.length
            : '<span class="muted">아직 풀지 않았습니다</span>') + '</div>' +
        '<div class="row"><button class="btn primary sm" data-p="' + s + '|study">' +
        (dn ? '이어 풀기' : '학습 모드') + '</button>' +
        '<button class="btn sm" data-p="' + s + '|exam">시험 모드</button></div></div>';
    });
    h += '</div>';

    var smAll = Store.attemptSummary('pred|all');
    h += '<div class="card"><div class="row" style="justify-content:space-between">' +
      '<div><strong>전체 예상문제 풀기</strong><div class="small muted">' + PREDICTED.length + '문항 · 무작위 순서</div>' +
      (smAll ? '<div class="hist" style="margin-top:5px">✔ ' + smAll + '</div>' : '') + '</div>' +
      '<button class="btn primary" data-p="all|study">시작</button></div></div>';

    // 예상문제에서 틀린 문항
    h += wrongOfRoundCard('예상문제');

    view().innerHTML = h;
    bindSettingsBar();
    bindWrongRun('#/predict');
    view().querySelectorAll('[data-p]').forEach(function (n) {
      n.onclick = function () {
        var p = n.dataset.p.split('|');
        var arr = (p[0] === 'all' ? shuffle(PREDICTED) : (bys[p[0]] || [])).map(normPred);
        Quiz.start({
          questions: arr, mode: p[1],
          setKey: 'pred|' + p[0] + (p[1] === 'exam' ? '|exam' : ''),
          title: '예상문제', subtitle: p[0] === 'all' ? '전체 ' + arr.length + '문항' : SUBJ_LABEL[p[0]],
          timeLimit: p[1] === 'exam' ? arr.length * 90 : null,
          sessionType: '예상문제', backHash: '#/predict'
        });
      };
    });
  }

  /* ══════════════ 모의고사 ══════════════ */
  function viewMock() {
    var pool = poolBySubject();
    var avail = SUBJECTS.map(function (s) { return pool[s].length; });
    var minAvail = Math.min.apply(null, avail);

    var h = '<h2 class="page">모의고사</h2>' +
      '<p class="lead">정답이 검증된 문항만 무작위 출제 · 실제 합격기준(과목 40% / 평균 60%)으로 판정</p>';

    h += settingsBar();
    h += '<div class="card"><strong>출제 가능 문항</strong><div class="grid g4" style="margin-top:11px">';
    SUBJECTS.forEach(function (s, i) {
      h += '<div class="stat"><div class="k">' + s + '</div><div class="v" style="font-size:21px">' + avail[i] + '</div>' +
        '<div class="n">문항 보유</div></div>';
    });
    h += '</div></div>';

    if (minAvail < 5) {
      h += '<div class="notice">일부 과목의 검증 문항이 부족합니다. 예상문제를 추가하면 출제 폭이 넓어집니다.</div>';
    }

    var opts = [
      { id: 'full', t: '실전 모의고사', d: '80문항 (과목당 20) · 120분', per: 20, time: 7200 },
      { id: 'half', t: '하프 모의고사', d: '40문항 (과목당 10) · 60분', per: 10, time: 3600 },
      { id: 'quick', t: '스피드 테스트', d: '20문항 (과목당 5) · 20분', per: 5, time: 1200 }
    ];
    h += '<div class="grid g3">';
    opts.forEach(function (o) {
      var ok = minAvail >= o.per;
      h += '<div class="card"><strong>' + o.t + '</strong>' +
        '<div class="small muted" style="margin:5px 0 12px">' + o.d + '</div>' +
        '<button class="btn primary" data-m="' + o.id + '"' + (ok ? '' : ' disabled') + '>' +
        (ok ? '응시하기' : '문항 부족') + '</button></div>';
    });
    h += '</div>';

    h += '<div class="card"><strong>과목별 집중 테스트</strong><div class="list" style="margin-top:11px">';
    SUBJECTS.forEach(function (s, i) {
      h += '<div class="item" data-sub="' + s + '"><div><div class="t">' + SUBJ_LABEL[s] + '</div>' +
        '<div class="d">보유 ' + avail[i] + '문항 중 최대 20문항 무작위</div></div>' +
        '<span class="right muted">→</span></div>';
    });
    h += '</div></div>';

    var ss = Store.s.sessions.filter(function (x) { return x.type === '모의고사'; });
    if (ss.length) {
      h += '<div class="card"><strong>응시 이력</strong>' +
        '<div class="small muted" style="margin-top:3px">응시 기록을 누르면 그 회차에서 틀린 문항을 모아 볼 수 있습니다</div>' +
        '<div class="list" style="margin-top:11px">';
      ss.slice(0, 10).forEach(function (s) {
        var nw = s.wrongQids ? s.wrongQids.length : null;
        h += '<a class="item" href="#/session/' + s.at + '"><span class="tag ' + (s.pass ? 'ok' : 'bad') + '">' +
          (s.pass ? '합격' : '불합격') + '</span><div><div class="t">' + MD.esc(s.title) + '</div>' +
          '<div class="d">' + new Date(s.at).toLocaleString('ko-KR') +
          (nw != null ? ' · 오답 ' + nw + '개' : '') + '</div></div>' +
          '<div class="right"><strong>' + s.pct + '점</strong><span class="muted">→</span></div></a>';
      });
      h += '</div></div>';
    }

    view().innerHTML = h;
    bindSettingsBar();

    view().querySelectorAll('[data-m]').forEach(function (n) {
      n.onclick = function () {
        var o = opts.filter(function (x) { return x.id === n.dataset.m; })[0];
        var qs = [];
        SUBJECTS.forEach(function (s) { qs = qs.concat(shuffle(pool[s]).slice(0, o.per)); });
        Quiz.start({
          questions: qs, mode: 'exam', title: o.t,
          subtitle: qs.length + '문항 · ' + Math.round(o.time / 60) + '분',
          timeLimit: o.time, sessionType: '모의고사', backHash: '#/mock'
        });
      };
    });
    view().querySelectorAll('[data-sub]').forEach(function (n) {
      n.onclick = function () {
        var s = n.dataset.sub;
        var qs = shuffle(pool[s]).slice(0, 20);
        if (!qs.length) { toast('출제 가능한 문항이 없습니다'); return; }
        Quiz.start({
          questions: qs, mode: 'exam', title: SUBJ_LABEL[s] + ' 집중테스트',
          subtitle: qs.length + '문항', timeLimit: qs.length * 90,
          sessionType: '모의고사', backHash: '#/mock'
        });
      };
    });
  }

  /** 문항 본문을 정규화해 회차가 달라도 같은 문제로 묶는 키 */
  function stemKey(x) {
    return String(x.stem || '')
      .replace(/\s+/g, '')
      .replace(/[^\w가-힣]/g, '')
      .toLowerCase()
      .slice(0, 80);
  }

  /**
   * 같은 문제(회차 달라도)끼리 묶어 반복 오답 정보를 만든다.
   *   total  : 합산 오답 횟수
   *   dates  : 틀린 날짜 목록(오래된 순)
   *   rounds : 틀린 적 있는 회차 목록
   */
  function markRepeats(list) {
    var groups = {};
    list.forEach(function (x) {
      var k = stemKey(x);
      (groups[k] = groups[k] || []).push(x);
    });
    Object.keys(groups).forEach(function (k) {
      var arr = groups[k];
      var total = 0, dates = [], rounds = {};
      arr.forEach(function (x) {
        total += (x.count || 1);
        if (x.srcLabel) rounds[x.srcLabel] = 1;
        (x.history && x.history.length
          ? x.history
          : [{ at: x.last, src: x.srcLabel }]
        ).forEach(function (hh) {
          var d = new Date(hh.at);
          dates.push({
            at: hh.at,
            date: (d.getMonth() + 1) + '/' + d.getDate(),
            src: hh.src || x.srcLabel || ''
          });
        });
      });
      dates.sort(function (a, b) { return a.at - b.at; });
      if (dates.length > 8) dates = dates.slice(-8);   // 최근 8회만
      var g = { total: total, dates: dates, rounds: Object.keys(rounds), members: arr };
      arr.forEach(function (x) { x._group = g; });
    });
    return list;
  }

  /**
   * 같은 문제(회차만 다른 것)는 카드 하나로만 보여준다.
   * 대표는 가장 최근에 틀린 항목으로 하고, 삭제 시에는 묶인 것을 모두 지운다.
   */
  function dedupeByStem(list) {
    var seen = {}, out = [];
    list.forEach(function (x) {
      var k = stemKey(x);
      if (seen[k]) return;
      seen[k] = 1;
      var g = x._group;
      if (g && g.members && g.members.length > 1) {
        // 가장 최근에 틀린 것을 대표로
        var rep = g.members.slice().sort(function (a, b) { return b.last - a.last; })[0];
        rep._group = g;
        out.push(rep);
      } else {
        out.push(x);
      }
    });
    return out;
  }

  /* ══════════════ 회차별 오답·즐겨찾기 ══════════════ */

  /** 회차 라벨 정렬 키 — 최신 회차가 먼저, 예상문제는 맨 뒤 */
  function roundSortKey(label) {
    var m = String(label || '').match(/(\d{4})년\s*(\d+)/);
    if (!m) return -1;
    return (+m[1]) * 10 + (+m[2]);
  }

  /** 회차 id(2021년_1회) → 오답노트가 쓰는 표시 라벨(2021년 1회) */
  function roundLabelOf(examId) {
    var e = EXAMS.filter(function (x) { return x.id === examId; })[0];
    return e ? e.year + '년 ' + e.round.replace(/^\d+년_?/, '').replace(/_/g, ' ') : examId;
  }

  /** 특정 회차(라벨)의 오답 문항 — 오답노트에 쌓인 것 중에서 고른다 */
  function wrongOfRound(label) {
    return Object.keys(Store.s.wrong)
      .map(function (k) { return Store.s.wrong[k]; })
      .filter(function (x) { return (x.srcLabel || '') === label; })
      .sort(function (a, b) { return (b.last || 0) - (a.last || 0); });
  }

  /** 특정 회차의 즐겨찾기 문항 */
  function bookmarksOfRound(label) {
    return bookmarkedList().filter(function (x) { return (x.srcLabel || '') === label; });
  }

  /** 오답노트 카드 형태의 문항을 풀이 엔진이 받는 형식으로 */
  function toQuizQ(x) {
    return {
      qid: x.qid, stem: x.stem, choices: x.choices, answer: x.answer,
      explanation: x.explanation, hint: x.hint, subject: x.subject,
      srcLabel: x.srcLabel, incomplete: !!x.incomplete
    };
  }

  /**
   * '이 회차에서 틀린 문항' 카드.  기출 회차·예상문제 화면 어디서나 같은 모양으로 쓴다.
   * label 로 오답노트를 걸러 보여주고, 그 자리에서 바로 복습을 시작할 수 있다.
   */
  function wrongOfRoundCard(label, opts) {
    opts = opts || {};
    var list = wrongOfRound(label);
    var bms = bookmarksOfRound(label);
    var h = '<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">' +
      '<div><strong>이 회차에서 틀린 문항 ' + list.length + '개</strong>' +
      '<div class="small muted" style="margin-top:3px">' +
      (list.length
        ? '오답노트에 쌓인 것 중 ' + MD.esc(label) + ' 문항만 모았습니다' +
          (bms.length ? ' · 즐겨찾기 ' + bms.length + '개' : '')
        : '아직 이 회차에서 틀린 문항이 없습니다') +
      '</div></div><div class="row">' +
      (list.length ? '<button class="btn primary sm" data-wrongrun="' + MD.esc(label) + '">오답만 모아 풀기</button>' : '') +
      (list.length || bms.length
        ? '<a class="btn sm" href="#/wrong/' + encodeURIComponent(label) + '">오답노트에서 보기 →</a>' : '') +
      '</div></div>';

    if (list.length) {
      h += '<div class="list" style="margin-top:11px">';
      list.slice(0, opts.limit || 30).forEach(function (x) {
        h += '<div class="item" style="cursor:default">' +
          '<span class="tag bad">' + (x.count || 1) + '회</span>' +
          '<div style="min-width:0"><div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          MD.inline(x.stem || '') + '</div>' +
          '<div class="d">' + MD.esc(x.subject || '') +
          (x.answer ? ' · 정답 ' + Quiz.CIRCLE[x.answer - 1] : '') +
          (x.picked ? ' · 내가 고른 답 ' + Quiz.CIRCLE[x.picked - 1] : '') +
          (x.lastOk ? ' · <span style="color:var(--ok)">최근 정답 ✓</span>' : '') +
          '</div></div>' +
          '<span class="right muted small">' + new Date(x.last).toLocaleDateString('ko-KR') + '</span></div>';
      });
      if (list.length > (opts.limit || 30)) {
        h += '<div class="small muted" style="padding:6px 2px">' +
          '외 ' + (list.length - (opts.limit || 30)) + '문항 — 오답노트에서 모두 볼 수 있습니다</div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  /** wrongOfRoundCard()를 그린 뒤 호출 — '오답만 모아 풀기' 버튼 연결 */
  function bindWrongRun(backHash) {
    view().querySelectorAll('[data-wrongrun]').forEach(function (n) {
      n.onclick = function () {
        var label = n.dataset.wrongrun;
        var arr = wrongOfRound(label).map(toQuizQ);
        if (!arr.length) { toast('복습할 문항이 없습니다'); return; }
        Quiz.start({
          questions: shuffle(arr), mode: 'study',
          title: label + ' 오답 복습', subtitle: arr.length + '문항',
          sessionType: '오답복습', backHash: backHash || '#/wrong'
        });
      };
    });
  }

  /* ══════════════ 오답노트 ══════════════ */
  /** roundArg: '#/wrong/<회차 라벨>' 로 들어오면 그 회차가 선택된 채로 열린다 */
  function viewWrong(roundArg) {
    // 얕은 복사본으로 다룬다 — markRepeats가 붙이는 _group 이 저장소 객체에 남으면
    // _group.members 가 자기 자신을 다시 가리켜 순환 구조가 되고, 그러면 저장(JSON) 자체가 깨진다.
    var wrongList = Object.keys(Store.s.wrong).map(function (k) {
      return Object.assign({}, Store.s.wrong[k]);
    });
    markRepeats(wrongList);
    wrongList = dedupeByStem(wrongList);   // 회차만 다른 같은 문제는 한 장으로
    // 반복 오답(여러 번 틀린 것)을 맨 위로
    wrongList.sort(function (a, b) {
      var ta = (a._group && a._group.total) || a.count;
      var tb = (b._group && b._group.total) || b.count;
      return tb - ta || b.last - a.last;
    });

    var bmList = bookmarkedList();

    var head = '<h2 class="page">오답노트</h2>' +
      '<p class="lead">틀린 문항이 자동 누적됩니다. 다시 풀어서 맞혀도 목록에 남아있고, ' +
      '문항 카드의 <strong>삭제</strong> 버튼을 눌러야 없어집니다. 문제풀이 중 누른 별표(★) 문항은 ' +
      '<strong>즐겨찾기</strong> 탭에서 모아봅니다.</p>';

    var tab = 'wrong'; // 'wrong' | 'bm'

    // 과목 다중선택 상태 — 위쪽 개수 타일을 눌러서 토글 (여러 과목 동시 선택 가능)
    var selected = {};
    // 회차 선택 — ''(전체) 또는 회차 라벨. #/wrong/<회차> 로 들어오면 그 회차가 선택된 상태로 열린다.
    var selRound = roundArg ? decodeURIComponent(roundArg) : '';

    /** 카드 하나가 걸쳐 있는 회차들(같은 문제가 여러 회차에 나온 경우 모두) */
    function roundsOf(x) {
      var g = x._group;
      var arr = (g && g.members && g.members.length) ? g.members : [x];
      var seen = {}, out = [];
      arr.forEach(function (m) {
        var lab = m.srcLabel || '기타';
        if (!seen[lab]) { seen[lab] = 1; out.push(lab); }
      });
      return out;
    }
    /** 회차를 고르면 그 회차 문항이 카드의 대표가 되도록 바꿔준다 */
    function repFor(x) {
      if (!selRound) return x;
      var g = x._group;
      if (!g || !g.members) return x;
      var m = g.members.filter(function (y) { return (y.srcLabel || '기타') === selRound; })
        .sort(function (a, b) { return (b.last || 0) - (a.last || 0); })[0];
      return m ? Object.assign({}, m, { _group: g }) : x;
    }
    function inRound(x) { return !selRound || roundsOf(x).indexOf(selRound) >= 0; }

    function curList() { return (tab === 'wrong' ? wrongList : bmList).filter(inRound).map(repFor); }
    function bysFor(l) {
      var m = {}; l.forEach(function (x) { (m[x.subject] = m[x.subject] || []).push(x); }); return m;
    }
    function selSubjects() { return SUBJECTS.filter(function (s) { return selected[s]; }); }
    function shownList() {
      var l = curList();
      var sel = selSubjects();
      return sel.length ? l.filter(function (x) { return selected[x.subject]; }) : l;
    }

    /* ── 오답 복습은 20문항씩 끊어서, 먼저 틀린 문항부터 ── */
    var SET_N = 20;

    /** 이 문항을 '처음' 틀린 시각 — 없으면 마지막 오답 시각 */
    function firstWrongAt(x) {
      var g = x._group;
      if (g && g.members && g.members.length) {
        return g.members.reduce(function (m, y) {
          var h = y.history || [];
          var t = (h.length && h[0].at) ? h[0].at : (y.last || 0);
          return (t && (!m || t < m)) ? t : m;
        }, 0) || (x.last || 0);
      }
      var h0 = x.history || [];
      return (h0.length && h0[0].at) ? h0[0].at : (x.last || 0);
    }

    /** 복습 대상을 '먼저 틀린 순'으로 정렬 */
    function reviewOrder() {
      return shownList().slice().sort(function (a, b) {
        return firstWrongAt(a) - firstWrongAt(b) || (a.last || 0) - (b.last || 0);
      });
    }

    function setsOf(list) {
      var out = [];
      for (var i = 0; i < list.length; i += SET_N) out.push(list.slice(i, i + SET_N));
      return out;
    }

    /** k번째(0-base) 묶음을 푼다. 끝나면 다음 묶음으로 이어 갈 수 있다. */
    function startSet(k) {
      var all = reviewOrder();
      var sets = setsOf(all);
      if (!sets.length) { toast('복습할 문항이 없습니다'); return; }
      if (k >= sets.length) k = sets.length - 1;
      var part = sets[k];
      var arr = part.map(function (x) {
        return {
          qid: x.qid, stem: x.stem, choices: x.choices, answer: x.answer,
          explanation: x.explanation, hint: x.hint, subject: x.subject,
          src: x.src || '', srcLabel: x.srcLabel, incomplete: !!x.incomplete
        };
      });
      var from = k * SET_N + 1, to = k * SET_N + part.length;
      var backTo = '#/wrong' + (selRound ? '/' + encodeURIComponent(selRound) : '');
      var cfg = {
        questions: arr, mode: 'study',
        title: (selRound ? selRound + ' ' : '') +
               (tab === 'wrong' ? '오답 복습' : '즐겨찾기 복습') +
               ' (' + from + '~' + to + ')',
        subtitle: '먼저 틀린 문항부터 · ' + (k + 1) + '/' + sets.length + '묶음 · ' + part.length + '문항',
        sessionType: tab === 'wrong' ? '오답복습' : '즐겨찾기복습',
        backHash: backTo
      };
      if (k + 1 < sets.length) {
        cfg.nextSet = {
          label: '다음 ' + Math.min(SET_N, all.length - (k + 1) * SET_N) + '문항 →',
          run: function () { startSet(k + 1); }
        };
      }
      Quiz.start(cfg);
    }

    /** 회차 선택 상자 — 전체 + 회차별 개수 */
    function roundSelect() {
      var base = tab === 'wrong' ? wrongList : bmList;
      var cnt = {};
      base.forEach(function (x) {
        roundsOf(x).forEach(function (lab) { cnt[lab] = (cnt[lab] || 0) + 1; });
      });
      var labels = Object.keys(cnt).sort(function (a, b) {
        return roundSortKey(b) - roundSortKey(a) || a.localeCompare(b);
      });
      if (selRound && labels.indexOf(selRound) < 0) labels.unshift(selRound); // 지금은 0개여도 선택 유지
      var opt = '<option value="">전체 회차 (' + base.length + ')</option>' +
        labels.map(function (lab) {
          return '<option value="' + MD.esc(lab) + '"' + (lab === selRound ? ' selected' : '') + '>' +
            MD.esc(lab) + ' (' + (cnt[lab] || 0) + ')</option>';
        }).join('');
      return '<div class="card setbar"><div class="row" style="gap:14px;flex-wrap:wrap">' +
        '<strong style="white-space:nowrap">📚 회차 선택</strong>' +
        '<label class="setitem"><span>회차</span><select id="selRound">' + opt + '</select></label>' +
        (selRound ? '<button class="btn sm ghost" id="btnAllRounds">전체 보기</button>' : '') +
        '<span class="small muted" style="margin-left:auto">' +
        (selRound ? MD.esc(selRound) + ' 문항만 보고 있습니다' : '모든 회차를 함께 보고 있습니다') +
        '</span></div></div>';
    }

    function render() {
      var l = curList();
      var bys = bysFor(l);
      var sel = selSubjects();
      var shown = shownList();
      var total = tab === 'wrong' ? wrongList.length : bmList.length;
      var h = head;

      h += '<div class="row" style="gap:8px;margin-bottom:14px">' +
        '<button class="btn sm ' + (tab === 'wrong' ? 'primary' : 'ghost') + '" data-tab="wrong">오답 (' + wrongList.length + ')</button>' +
        '<button class="btn sm ' + (tab === 'bm' ? 'primary' : 'ghost') + '" data-tab="bm">★ 즐겨찾기 (' + bmList.length + ')</button>' +
        '</div>';

      if (total) h += roundSelect();

      if (!l.length) {
        h += '<div class="empty"><div class="ico">' + (tab === 'wrong' ? '🎉' : '★') + '</div>' +
          (selRound
            ? MD.esc(selRound) + '에는 ' + (tab === 'wrong' ? '틀린' : '즐겨찾기한') + ' 문항이 없습니다.' +
              '<br><span class="small">위에서 «전체 회차»를 고르면 모두 볼 수 있습니다.</span>'
            : (tab === 'wrong'
              ? '오답이 없습니다.<br><span class="small">기출·예상문제를 풀면 틀린 문항이 여기에 모입니다.</span>'
              : '즐겨찾기한 문항이 없습니다.<br><span class="small">문제풀이 화면에서 ☆ 버튼을 눌러 추가하세요.</span>')) +
          '</div>';
        view().innerHTML = h;
        bind();
        return;
      }

      h += '<div class="grid g4">';
      SUBJECTS.forEach(function (s) {
        var n = (bys[s] || []).length;
        var isSel = !!selected[s];
        var clickable = n > 0;
        h += '<div class="stat' + (isSel ? ' sel' : '') + (clickable ? ' clickable' : '') + '"' +
          (clickable ? ' data-subj="' + s + '"' : '') + '>' +
          '<div class="k">' + s + (isSel ? ' ✓' : '') + '</div>' +
          '<div class="v" style="font-size:22px">' + n + '</div>' +
          '<div class="n">' + (tab === 'wrong' ? '오답 문항' : '즐겨찾기') + (clickable ? ' · 눌러서 선택' : '') + '</div></div>';
      });
      h += '</div>';

      h += '<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div><strong>복습 시작</strong><div class="small muted" style="margin-top:3px">' +
        (selRound ? MD.esc(selRound) + ' · ' : '') +
        (sel.length ? '선택 ' + sel.length + '과목(' + sel.join(', ') + ') · ' + shown.length + '문항'
          : (selRound ? '' : '전체 · ') + l.length + '문항') +
        '</div></div>' +
        '<div class="row">' +
        (sel.length ? '<button class="btn sm ghost" id="btnClearSel">선택 해제</button>' : '') +
        '<button class="btn primary" id="btnReview">복습하기</button>' +
        (tab === 'wrong'
          ? '<button class="btn sm" id="btnClearAll">' + (selRound ? '이 회차 오답 비우기' : '전체 비우기') + '</button>'
          : '') +
        '</div></div>';

      // 20문항이 넘으면 묶음으로 나눠 보여준다 — 먼저 틀린 문항이 앞 묶음에 온다
      var setList = setsOf(reviewOrder());
      if (setList.length > 1) {
        h += '<div class="small muted" style="margin-top:12px;margin-bottom:7px">' +
          '<strong>' + SET_N + '문항씩 ' + setList.length + '묶음</strong> · 먼저 틀린 문항부터 순서대로 나왔습니다. ' +
          '한 묶음을 마치면 바로 다음 묶음으로 이어 갈 수 있습니다.</div>' +
          '<div class="row" style="flex-wrap:wrap;gap:7px">';
        setList.forEach(function (part, k) {
          var from = k * SET_N + 1, to = k * SET_N + part.length;
          h += '<button class="btn sm ' + (k === 0 ? 'primary' : 'ghost') + '" data-set="' + k + '">' +
            from + '~' + to + '</button>';
        });
        h += '</div>';
      }
      h += '</div>';

      h += '<div class="list">';
      shown.forEach(function (x) {
        if (tab === 'wrong') {
          var g = x._group || { total: x.count, dates: [], rounds: [] };
          var repeat = g.total >= 2;                 // 2회 이상 틀린 문항
          h += '<div class="card' + (repeat ? ' repeat-wrong' : '') + '" style="padding:14px 16px">' +
            '<div class="row" style="margin-bottom:7px">' +
            (repeat ? '<span class="tag bad" title="반복해서 틀린 문항입니다">🔁 반복오답 ' + g.total + '회</span>' : '') +
            '<span class="tag acc">' + MD.esc(x.subject || '기타') + '</span>' +
            (x.srcLabel ? '<span class="tag">' + MD.esc(x.srcLabel) + '</span>' : '') +
            (!repeat ? '<span class="tag bad">' + x.count + '회 오답</span>' : '') +
            (x.lastOk ? '<span class="tag ok">최근 정답 ✓</span>' : '') +
            '<span class="small muted" style="margin-left:auto">' + new Date(x.last).toLocaleDateString('ko-KR') + '</span>' +
            '<button class="btn sm ghost" data-del="' + MD.esc(x.qid) + '"' +
            (g.members && g.members.length > 1
              ? ' data-del-group="' + MD.esc(g.members.map(function (m) { return m.qid; }).join('|')) + '"' +
                ' title="같은 문제 ' + g.members.length + '건을 함께 삭제합니다"'
              : '') +
            '>삭제</button></div>';

          // 언제 틀렸는지 — 회차가 달라도 같은 문제면 함께 모아 보여준다
          if (repeat && g.dates.length) {
            h += '<div class="wrong-hist">틀린 날 · ' +
              g.dates.map(function (d) {
                return '<b>' + d.date + '</b>' + (d.src ? ' <span>(' + MD.esc(d.src) + ')</span>' : '');
              }).join(' → ') +
              (g.rounds.length > 1
                ? '<div class="small" style="margin-top:4px">같은 문제가 <strong>' + g.rounds.length +
                  '개 회차</strong>에 출제되었고 모두 틀렸습니다 — ' + g.rounds.map(MD.esc).join(', ') + '</div>'
                : '') +
            '</div>';
          }

          h += '<div style="font-weight:600;margin-bottom:9px">' + MD.inline(x.stem) + '</div>';
          (x.choices || []).forEach(function (c) {
            var mark = c.n === x.answer ? 'style="color:var(--ok);font-weight:700"'
              : c.n === x.picked ? 'style="color:var(--bad);text-decoration:line-through"' : 'class="muted"';
            h += '<div class="small" ' + mark + '>' + Quiz.CIRCLE[c.n - 1] + ' ' + MD.inline(c.text) +
              (c.n === x.answer ? '  ← 정답' : c.n === x.picked ? '  ← 내가 고른 답' : '') + '</div>';
          });
          if (x.explanation) {
            h += '<details style="margin-top:10px"><summary class="small" style="cursor:pointer;color:var(--accent2)">해설 보기</summary>' +
              '<div class="md small" style="margin-top:8px">' + MD.render(x.explanation) + '</div></details>';
          }
          h += '</div>';
        } else {
          h += '<div class="card" style="padding:14px 16px">' +
            '<div class="row" style="margin-bottom:7px">' +
            '<span class="tag acc">' + MD.esc(x.subject || '기타') + '</span>' +
            (x.srcLabel ? '<span class="tag">' + MD.esc(x.srcLabel) + '</span>' : '') +
            (x.answer == null ? '<span class="tag warn">정답 미확정</span>' : '') +
            '<button class="btn sm ghost bm-on" data-unbm="' + MD.esc(x.qid) + '" style="margin-left:auto"><span class="star">★</span> 해제</button></div>' +
            '<div style="font-weight:600;margin-bottom:9px">' + MD.inline(x.stem) + '</div>';
          (x.choices || []).forEach(function (c) {
            var mark = (x.answer != null && c.n === x.answer) ? 'style="color:var(--ok);font-weight:700"' : 'class="muted"';
            h += '<div class="small" ' + mark + '>' + Quiz.CIRCLE[c.n - 1] + ' ' + MD.inline(c.text) +
              (x.answer != null && c.n === x.answer ? '  ← 정답' : '') + '</div>';
          });
          if (x.explanation) {
            h += '<details style="margin-top:10px"><summary class="small" style="cursor:pointer;color:var(--accent2)">해설 보기</summary>' +
              '<div class="md small" style="margin-top:8px">' + MD.render(x.explanation) + '</div></details>';
          }
          h += '</div>';
        }
      });
      h += '</div>';

      view().innerHTML = h;
      bind();
    }

    /** 지우기·해제 후 다시 그릴 때 선택한 회차를 유지한다 */
    function reloadView() {
      var target = '#/wrong' + (selRound ? '/' + encodeURIComponent(selRound) : '');
      if (location.hash === target) route(); else location.hash = target;
    }

    function bind() {
      view().querySelectorAll('[data-tab]').forEach(function (n) {
        n.onclick = function () { tab = n.dataset.tab; selected = {}; render(); };
      });
      var rs = el('selRound');
      if (rs) rs.onchange = function () { selRound = this.value; selected = {}; render(); };
      var ar = el('btnAllRounds');
      if (ar) ar.onclick = function () { selRound = ''; selected = {}; render(); };
      view().querySelectorAll('[data-subj]').forEach(function (n) {
        n.onclick = function () {
          var s = n.dataset.subj;
          selected[s] = !selected[s];
          render();
        };
      });
      var clearSelBtn = el('btnClearSel');
      if (clearSelBtn) clearSelBtn.onclick = function () { selected = {}; render(); };

      var reviewBtn = el('btnReview');
      if (reviewBtn) reviewBtn.onclick = function () { startSet(0); };
      view().querySelectorAll('[data-set]').forEach(function (n) {
        n.onclick = function () { startSet(+n.dataset.set); };
      });
      var clearAllBtn = el('btnClearAll');
      if (clearAllBtn) clearAllBtn.onclick = function () {
        if (selRound) {
          // 회차를 고른 상태에서는 그 회차 오답만 지운다
          var ids = wrongOfRound(selRound).map(function (x) { return x.qid; });
          if (!ids.length) { toast('지울 문항이 없습니다'); return; }
          if (!confirm(selRound + ' 오답 ' + ids.length + '문항을 오답노트에서 지웁니다.\n' +
                       '다른 회차 기록과 문항별 통계는 그대로 남고, 지우기 직전 상태는 ' +
                       '홈 화면의 「자동 백업」에서 되돌릴 수 있습니다. 계속할까요?')) return;
          Store.snapshot(selRound + ' 오답 비우기 직전', true);
          Store.bulk(function () { ids.forEach(function (id) { Store.clearWrong(id); }); });
          toast(selRound + ' 오답을 비웠습니다');
          reloadView();
          return;
        }
        if (confirm('오답노트 ' + Object.keys(Store.s.wrong).length + '문항을 모두 비웁니다.\n' +
                    '지우기 직전 상태는 홈 화면의 「자동 백업」에서 되돌릴 수 있습니다. 계속할까요?')) {
          Store.clearAllWrong(); toast('오답노트를 비웠습니다'); reloadView();
        }
      };
      view().querySelectorAll('[data-del]').forEach(function (n) {
        n.onclick = function () {
          // 카드 하나가 여러 회차의 같은 문제를 대표하므로, 묶인 것을 함께 지운다
          var ids = (n.dataset.delGroup || n.dataset.del).split('|');
          ids.forEach(function (id) { if (id) Store.clearWrong(id); });
          reloadView();
        };
      });
      view().querySelectorAll('[data-unbm]').forEach(function (n) {
        n.onclick = function () { Store.toggleBookmark(n.dataset.unbm); reloadView(); };
      });
    }

    render();
  }

  /* ══════════════ 통계 ══════════════ */
  function viewStats() {
    var st = Store.s;
    var sessions = (st.sessions || []).slice();
    var live = liveSets();
    var ss = solvedStats();
    var rounds = perExamStats();

    var h = '<h2 class="page">풀이 통계</h2>' +
      '<p class="lead">답을 고르는 즉시 반영됩니다 — <strong>제출하지 않아도</strong> 푼 문항은 모두 여기에 잡힙니다.</p>';

    if (!ss.n && !sessions.length && !live.length) {
      view().innerHTML = h + '<div class="empty"><div class="ico">📊</div>아직 푼 기록이 없습니다.<br>' +
        '<span class="small">기출문제나 모의고사를 풀면 여기에 쌓입니다.</span></div>';
      return;
    }

    var mocks = sessions.filter(function (s) { return s.type === '모의고사'; });
    var passed = mocks.filter(function (s) { return s.pass; }).length;
    var wrongN = Object.keys(st.wrong).length;

    h += '<div class="grid g4">' +
      tile('푼 문항', ss.n.toLocaleString() + '<span style="font-size:15px">문항</span>', '중복 제외 · 실시간') +
      tile('정답률', ss.pct + '<span style="font-size:15px">%</span>', ss.ok + '/' + ss.n + ' 정답') +
      tile('오답노트', wrongN + '<span style="font-size:15px">개</span>', wrongN ? '복습 대기' : '깨끗합니다') +
      tile('모의고사 합격', mocks.length ? passed + '/' + mocks.length + '<span style="font-size:15px">회</span>' : '—',
           mocks.length ? '과목 40 + 평균 60 기준' : '아직 응시 없음') +
      '</div>';

    /* ── 지금 풀고 있는 것 ── */
    if (live.length) {
      h += '<div class="card"><strong>지금 풀고 있는 세트</strong>' +
        '<div class="small muted" style="margin-top:3px">제출 전이라도 고른 답은 이미 위 통계와 오답노트에 반영되어 있습니다</div>' +
        '<div class="list" style="margin-top:11px">';
      live.forEach(function (L) {
        var subj = Store.subjectScoreText(L.bySubject);
        h += '<div class="card" style="padding:12px 14px;margin:0">' +
          '<div class="row" style="margin-bottom:5px">' +
          '<span class="tag acc">' + (L.mode === 'exam' ? '시험 모드' : '학습 모드') + '</span>' +
          '<span style="font-weight:650">' + MD.esc(L.title) + '</span>' +
          '<span class="small muted">' + MD.esc(L.subtitle) + '</span>' +
          '<span class="small muted" style="margin-left:auto">' +
          (L.at ? new Date(L.at).toLocaleString('ko-KR') : '') + '</span></div>' +
          '<div class="small"><strong>' + L.answered + '/' + L.total + '문항 응답</strong>' +
          (L.n ? ' · 현재 <strong>' + L.pct + '점</strong> (' + L.ok + '/' + L.n + ')' : '') +
          (subj ? ' · <span class="muted">' + MD.esc(subj) + '</span>' : '') + '</div>' +
          '<div class="bar" style="margin-top:8px"><i style="width:' +
          Math.round(L.answered / L.total * 100) + '%"></i></div>' +
          '<div class="row" style="margin-top:10px">' +
          '<a class="btn sm primary" href="' + L.hash + '">이어 풀기 →</a>' +
          '<button class="btn sm" data-keep="' + MD.esc(L.key) + '">여기까지를 응시 이력에 남기기</button>' +
          '</div></div>';
      });
      h += '</div></div>';
    }

    /* ── 과목별 누적 (문항 단위) ── */
    h += '<div class="card"><strong>과목별 누적 성취도</strong>' +
      '<div class="small muted" style="margin-top:3px">지금까지 푼 모든 문항 기준(같은 문항을 다시 풀면 최근 결과로 갱신)</div>' +
      '<div class="grid g2" style="margin-top:12px">';
    SUBJECTS.forEach(function (s) {
      var b = ss.bySubject[s] || { ok: 0, n: 0 };
      var p = b.n ? Math.round(b.ok / b.n * 100) : 0;
      h += '<div><div class="row" style="justify-content:space-between">' +
        '<span class="small" style="font-weight:650">' + SUBJ_LABEL[s] + '</span>' +
        '<span class="small muted">' + (b.n ? p + '점 (' + b.ok + '/' + b.n + ')' : '미학습') + '</span></div>' +
        '<div class="bar ' + (!b.n ? '' : p < 40 ? 'bad' : p >= 60 ? 'ok' : '') + '"><i style="width:' + p + '%"></i></div></div>';
    });
    h += '</div></div>';

    /* ── 회차별 성취도 ── */
    if (rounds.length) {
      h += '<div class="card"><strong>회차별 성취도</strong>' +
        '<div class="small muted" style="margin-top:3px">한 문항이라도 푼 회차는 모두 표시됩니다 · 최근에 푼 순서</div>' +
        '<div class="list" style="margin-top:11px">';
      rounds.forEach(function (r) {
        var doneAll = r.n >= r.total;
        h += '<a class="item" href="' + r.hash + '" style="align-items:flex-start">' +
          '<div style="min-width:0;flex:1"><div class="t">' + MD.esc(r.title) + '</div>' +
          '<div class="d">' + r.n + '/' + r.total + '문항 풀이' +
          (doneAll ? ' <span class="tag ok">완주</span>' : '') +
          (r.last ? ' · 최근 ' + new Date(r.last).toLocaleDateString('ko-KR') : '') + '</div>' +
          subjectChips(r.bySubject) + '</div>' +
          '<div class="right"><strong style="font-size:18px">' + r.pct + '점</strong>' +
          '<span class="small muted">' + r.ok + '/' + r.n + '</span></div></a>';
      });
      h += '</div></div>';
    }

    /* ── 유형별 (제출까지 마친 응시 기준) ── */
    if (sessions.length) {
      var byType = {};
      sessions.forEach(function (s) {
        var t = s.type || '기타';
        byType[t] = byType[t] || { n: 0, q: 0, ok: 0 };
        byType[t].n++; byType[t].q += s.total || 0; byType[t].ok += s.score || 0;
      });
      h += '<div class="card"><strong>유형별</strong>' +
        '<div class="small muted" style="margin-top:3px">채점을 마친 응시 ' + sessions.length + '회 기준</div>' +
        '<div class="list" style="margin-top:11px">';
      Object.keys(byType).forEach(function (t) {
        var b = byType[t];
        var p = b.q ? Math.round(b.ok / b.q * 100) : 0;
        h += '<div class="item" style="cursor:default"><div><div class="t">' + MD.esc(t) + '</div>' +
          '<div class="d">' + b.n + '회 · ' + b.q + '문항</div></div>' +
          '<div class="right"><strong>' + p + '점</strong></div></div>';
      });
      h += '</div></div>';
    }

    /* ── 점수 추이 (최근 20회, 막대) ── */
    var recent = sessions.slice(0, 20).reverse();
    if (recent.length >= 2) {
      h += '<div class="card"><strong>점수 추이</strong>' +
        '<div class="small muted" style="margin-top:3px">최근 ' + recent.length + '회 (왼쪽이 오래된 기록)</div>' +
        '<div class="trend">';
      recent.forEach(function (s) {
        var p = s.pct || 0;
        var cls = p >= 60 ? 'ok' : p >= 40 ? '' : 'bad';
        var d = new Date(s.at);
        h += '<div class="tbar" title="' + MD.esc(s.title) + ' · ' + p + '점 · ' +
          (d.getMonth() + 1) + '/' + d.getDate() + '">' +
          '<span class="tval">' + p + '</span>' +
          '<i class="' + cls + '" style="height:' + Math.max(p, 3) + '%"></i>' +
          '<span class="tlbl">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>';
      });
      h += '</div><div class="small muted" style="margin-top:8px">' +
        '기준선 60점 이상이 초록, 40점 미만이 빨강입니다.</div></div>';
    }

    /* ── 전체 기록 ── */
    h += '<div class="card"><div class="row" style="justify-content:space-between">' +
      '<strong>응시 기록 ' + sessions.length + '건</strong>' +
      (sessions.length ? '<button class="btn sm" id="btnClearSessions">기록 비우기</button>' : '') + '</div>' +
      (sessions.length ? '' : '<div class="small muted" style="margin-top:8px">' +
        '아직 끝까지 제출한 풀이가 없습니다. 위의 문항 단위 통계는 제출과 무관하게 계속 쌓입니다.</div>') +
      '<div class="list" style="margin-top:11px">';
    sessions.forEach(function (s) {
      var d = new Date(s.at);
      var nw = s.wrongQids ? s.wrongQids.length : null;
      h += '<a class="card" href="#/session/' + s.at + '" style="padding:12px 14px;margin:0;display:block;color:inherit;text-decoration:none">' +
        '<div class="row" style="margin-bottom:5px">' +
        '<span class="tag acc">' + MD.esc(s.type || '학습') + '</span>' +
        '<span style="font-weight:650">' + MD.esc(s.title) + '</span>' +
        (s.type === '모의고사'
          ? '<span class="tag ' + (s.pass ? 'ok' : 'bad') + '">' + (s.pass ? '합격' : '불합격') + '</span>' : '') +
        (nw ? '<span class="tag bad">오답 ' + nw + '</span>' : '') +
        '<span class="small muted" style="margin-left:auto">' +
        d.toLocaleDateString('ko-KR') + ' ' + d.toTimeString().slice(0, 5) + ' →</span></div>' +
        '<div class="small">' +
        '<strong>평균 ' + (s.pct || 0) + '점</strong>' +
        '<span class="muted"> · ' + (s.score || 0) + '/' + (s.total || 0) + '문항' +
        (s.elapsed ? ' · ' + Quiz.fmtTime(s.elapsed) : '') + '</span></div>' +
        subjectChips(s.bySubject) +
        '</a>';
    });
    h += '</div></div>';

    view().innerHTML = h;

    // 제출하지 않은 풀이를 지금 상태 그대로 응시 이력에 남긴다(진행 중 기록은 지우지 않는다)
    view().querySelectorAll('[data-keep]').forEach(function (n) {
      n.onclick = function () {
        var L = liveSets().filter(function (x) { return x.key === n.dataset.keep; })[0];
        if (!L) { toast('기록을 찾지 못했습니다'); return; }
        if (!L.n) { toast('채점 가능한 답이 아직 없습니다'); return; }
        keepAsSession(L);
        toast('응시 이력에 남겼습니다 (' + L.pct + '점)');
        route();
      };
    });

    var cb = el('btnClearSessions');
    if (cb) cb.onclick = function () {
      if (confirm('응시 기록 ' + sessions.length + '건을 모두 지웁니다.\n' +
                  '오답노트·문항별 통계·진도는 그대로 남고, 지우기 직전 상태는 홈 화면의 ' +
                  '「자동 백업」에서 되돌릴 수 있습니다. 계속할까요?')) {
        Store.clearSessions(); toast('응시 기록을 비웠습니다'); route();
      }
    };
  }

  /** 진행 중인 풀이를 '여기까지'로 채점해 응시 이력·세트 이력에 남긴다 */
  function keepAsSession(L) {
    var subjNames = Object.keys(L.bySubject);
    var fail40 = subjNames.filter(function (s) {
      return L.bySubject[s].n >= 5 && L.bySubject[s].ok / L.bySubject[s].n < 0.4;
    });
    var pass = L.pct >= 60 && !fail40.length && L.answered >= L.total;
    var qidsWrong = [];
    L.qs.forEach(function (q, i) {
      if (q.answer == null || L.picked[i] == null) return;
      if (L.picked[i] !== q.answer) qidsWrong.push(q.qid);
    });
    Store.addAttempt(L.key, {
      ok: L.ok, n: L.n, pct: L.pct, mode: L.mode, pass: pass,
      bySubject: L.bySubject, elapsed: 0, partial: L.answered < L.total
    });
    Store.addSession({
      at: Date.now(),
      type: L.base === 'pred' ? '예상문제' : '기출',
      title: L.title + (L.answered < L.total ? ' (' + L.answered + '/' + L.total + '문항까지)' : ''),
      subtitle: L.subtitle, setKey: L.key, mode: L.mode,
      score: L.ok, total: L.n, pct: L.pct,
      bySubject: L.bySubject, pass: pass, elapsed: 0, partial: L.answered < L.total,
      wrongQids: qidsWrong
    });
  }

  /* ══════════════ 응시 1회 상세 (모의고사 포함) ══════════════ */
  function viewSession(atStr) {
    var at = +atStr;
    var s = (Store.s.sessions || []).filter(function (x) { return x.at === at; })[0];
    if (!s) { location.hash = '#/stats'; return; }
    var map = allQuestionsMap();
    var back = s.type === '모의고사' ? '#/mock' : '#/stats';
    var d = new Date(s.at);

    var h = '<h2 class="page">' + MD.esc(s.title) + '</h2>' +
      '<p class="lead">' + d.toLocaleString('ko-KR') + ' 응시 · ' + MD.esc(s.subtitle || '') +
      (s.elapsed ? ' · 소요 ' + Quiz.fmtTime(s.elapsed) : '') + '</p>';

    h += '<div class="card" style="text-align:center">' +
      '<div class="small muted">득점</div>' +
      '<div style="font-size:48px;font-weight:800;letter-spacing:-2px;color:' +
      (s.pass ? 'var(--ok)' : 'var(--bad)') + '">' + (s.pct || 0) + '<span style="font-size:22px">점</span></div>' +
      '<div class="muted">' + (s.score || 0) + ' / ' + (s.total || 0) + '문항 정답</div>' +
      (s.type === '모의고사'
        ? '<div style="margin-top:10px"><span class="tag ' + (s.pass ? 'ok' : 'bad') + '" style="font-size:14px;padding:6px 18px">' +
          (s.pass ? '합격 기준 충족' : '불합격') + '</span></div>' : '') +
      '</div>';

    var bys = s.bySubject || {};
    if (Object.keys(bys).length) {
      h += '<div class="grid g2">';
      Object.keys(bys).forEach(function (k) {
        var b = bys[k], p = b.n ? Math.round(b.ok / b.n * 100) : 0;
        h += '<div class="stat"><div class="k">' + MD.esc(k) + '</div>' +
          '<div class="v">' + p + '%</div><div class="n">' + b.ok + '/' + b.n + '문항</div>' +
          '<div class="bar ' + (p < 40 ? 'bad' : p >= 60 ? 'ok' : '') + '"><i style="width:' + p + '%"></i></div></div>';
      });
      h += '</div>';
    }

    var wq = (s.wrongQids || []).map(function (id) { return map[id]; }).filter(Boolean);
    if (!s.wrongQids) {
      h += '<div class="notice">이 응시 기록에는 문항 정보가 없습니다(문항 단위 기록을 넣기 전에 응시한 기록). ' +
        '이후 응시부터는 여기에서 틀린 문항을 모아 볼 수 있습니다.</div>';
    } else if (!wq.length) {
      h += '<div class="card"><strong>틀린 문항이 없습니다 🎉</strong></div>';
    } else {
      h += '<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div><strong>이 회차에서 틀린 문항 ' + wq.length + '개</strong>' +
        '<div class="small muted" style="margin-top:3px">응시 당시 출제된 문항 그대로입니다</div></div>' +
        '<button class="btn primary sm" id="btnSessReview">오답만 모아 풀기</button></div></div>';

      h += '<div class="list">';
      wq.forEach(function (q) {
        var rec = Store.s.solved[q.qid] || {};
        h += '<div class="card" style="padding:14px 16px">' +
          '<div class="row" style="margin-bottom:7px">' +
          '<span class="tag acc">' + MD.esc(q.subject || '') + '</span>' +
          (q.srcLabel ? '<span class="tag">' + MD.esc(q.srcLabel) + '</span>' : '') +
          (Store.s.wrong[q.qid] ? '<span class="tag bad">오답노트</span>' : '') +
          '</div>' +
          '<div style="font-weight:600;margin-bottom:9px">' + MD.inline(q.stem) + '</div>';
        (q.choices || []).forEach(function (c) {
          var mark = c.n === q.answer ? 'style="color:var(--ok);font-weight:700"'
            : c.n === rec.picked ? 'style="color:var(--bad);text-decoration:line-through"' : 'class="muted"';
          h += '<div class="small" ' + mark + '>' + Quiz.CIRCLE[c.n - 1] + ' ' + MD.inline(c.text) +
            (c.n === q.answer ? '  ← 정답' : c.n === rec.picked ? '  ← 내가 고른 답' : '') + '</div>';
        });
        if (q.explanation) {
          h += '<details style="margin-top:10px"><summary class="small" style="cursor:pointer;color:var(--accent2)">해설 보기</summary>' +
            '<div class="md small" style="margin-top:8px">' + MD.render(q.explanation) + '</div></details>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    var again = (s.qids || []).map(function (id) { return map[id]; }).filter(Boolean);
    h += '<div class="row" style="justify-content:center;margin-top:16px">' +
      '<a class="btn" href="' + back + '">← 목록으로</a>' +
      (again.length ? '<button class="btn" id="btnSessAgain">같은 문항으로 다시 풀기</button>' : '') +
      '<a class="btn" href="#/wrong">오답노트 전체 보기</a></div>';

    view().innerHTML = h;
    var ab = el('btnSessAgain');
    if (ab) ab.onclick = function () {
      Quiz.start({
        questions: shuffle(again.map(toQuizQ)), mode: 'exam',
        title: s.title + ' (재응시)', subtitle: again.length + '문항 · 같은 문항',
        timeLimit: again.length * 90, sessionType: '모의고사', backHash: '#/session/' + s.at
      });
    };
    var rb = el('btnSessReview');
    if (rb) rb.onclick = function () {
      Quiz.start({
        questions: shuffle(wq.map(toQuizQ)), mode: 'study',
        title: s.title + ' 오답 복습', subtitle: wq.length + '문항',
        sessionType: '오답복습', backHash: '#/session/' + s.at
      });
    };
  }

  /* ══════════════ 라우터 ══════════════ */
  function route() {
    Quiz.stop();
    var hash = location.hash.replace(/^#\/?/, '') || 'home';
    var parts = hash.split('/').map(decodeURIComponent);

    document.querySelectorAll('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#/' + parts[0]);
    });

    switch (parts[0]) {
      case 'home': viewHome(); break;
      case 'theory': viewTheory(parts[1]); break;
      case 'exams': parts[1] ? viewExamRound(parts[1]) : viewExams(); break;
      case 'predict': viewPredict(); break;
      case 'mock': viewMock(); break;
      case 'wrong': viewWrong(parts[1]); break;
      case 'stats': viewStats(); break;
      case 'session': viewSession(parts[1]); break;
      default: location.hash = '#/home';
    }
  }

  function applyTheme() {
    var t = Store.s.settings.theme || 'light';
    document.documentElement.setAttribute('data-theme', t);
    var b = el('themeBtn');
    if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  w.applyTheme = applyTheme;
  // quiz.js가 '나가기' 시 해시가 안 바뀌는 경우(예: 오답노트에서 화면 전환 없이 바로
  // 시작한 복습) 직접 라우터를 호출할 수 있도록 노출한다.
  w.route = route;

  w.addEventListener('hashchange', route);
  function boot() {
    refreshData();   // 클라우드 모드에서 뒤늦게 도착한 문제 데이터를 반영
    applyTheme();
    var dd = el('dday');
    if (dd) dd.textContent = Store.s.settings.examDate + ' 시행 · ' + dday();
    var b = el('themeBtn');
    if (b) b.onclick = function () {
      Store.setTheme((Store.s.settings.theme || 'light') === 'light' ? 'dark' : 'light');
      applyTheme();
    };

    // 데이터가 없으면(클라우드에서 못 받은 경우) 화면을 그리지 않고 상황을 알린다
    if (!EXAMS.length) {
      view().innerHTML = '<div class="empty"><div class="ico">⚠️</div>문제 데이터를 불러오지 못했습니다.' +
        '<br><span class="small">새로고침해 보고, 계속 같으면 로그아웃 후 다시 로그인하세요.</span></div>';
      return;
    }

    // 문항 조회기를 저장소에 알려준다(백업 복원 시 오답노트 본문을 다시 채우는 데 쓰인다)
    Store.resolveQ = function (qid) { return allQuestionsMap()[qid] || null; };
    // 제출하지 않고 나온 풀이도 통계·오답노트에 반영한다(예전 버전에서 풀던 것 포함)
    try {
      var added = backfillProgress();
      if (added) setTimeout(function () { toast('제출 전 풀이 ' + added + '문항을 통계에 반영했습니다'); }, 600);
    } catch (e) { console.warn('진행 중 기록 반영 실패:', e); }
    route();
  }
  /**
   * 시작 순서
   *   로컬(file://·localhost) → CloudBoot이 즉시 false를 주고 바로 앱을 띄운다.
   *   인터넷 주소            → CloudBoot이 로그인·데이터 로드·기록 병합을 끝낸 뒤 앱을 띄운다.
   *                            (로그인 화면을 그린 경우에는 {handled:true}로 거부되므로 앱을 띄우지 않는다)
   */
  function start() {
    if (!w.CloudBoot) { boot(); return; }
    w.CloudBoot()
      .then(function (usedCloud) {
        if (usedCloud) {
          // 병합된 기록을 반영하려면 Store를 다시 읽어야 한다
          if (w.Store && w.Store.reload) w.Store.reload();
          renderCloudBar();
        }
        boot();
      })
      .catch(function (e) {
        if (!e || !e.handled) { console.error(e); boot(); }
      });
  }

  /** 클라우드 모드에서만 상단바에 동기화 상태와 로그아웃을 붙인다 */
  function renderCloudBar() {
    var nav = el('nav');
    if (!nav || !w.CLOUD || !w.CLOUD.enabled) return;
    var badge = document.createElement('span');
    badge.id = 'syncStatus';
    badge.className = 'syncbadge sync-ok';
    badge.textContent = '동기화됨';
    nav.appendChild(badge);
    var out = document.createElement('button');
    out.id = 'logoutBtn';
    out.title = (w.CLOUD.email() || '') + ' — 로그아웃';
    out.textContent = '⏏';
    out.onclick = function () {
      if (confirm('로그아웃할까요?\n(기록은 서버에 저장되어 있어 다시 로그인하면 그대로 보입니다)')) {
        if (w.CLOUD.pushNow) w.CLOUD.pushNow().then(w.CLOUD.logout);
        else w.CLOUD.logout();
      }
    };
    nav.appendChild(out);
  }

  w.addEventListener('DOMContentLoaded', start);
  if (document.readyState !== 'loading') start();
})(window);
