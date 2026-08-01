/* 문제풀이 엔진 — 기출/예상/모의고사/오답노트 공용 */
(function (w) {
  'use strict';

  var CIRCLE = ['①', '②', '③', '④', '⑤'];
  var Q = null; // 현재 세션

  function el(id) { return document.getElementById(id); }

  /**
   * @param {Object} cfg
   *  questions  정규화된 문항 배열
   *  mode       'study'(즉시채점) | 'exam'(제출 후 일괄채점)
   *  title,subtitle
   *  timeLimit  초, 없으면 무제한
   *  backHash   종료 시 이동
   *  onFinish   fn(result) — 채점 후 호출
   */
  function start(cfg) {
    Q = {
      cfg: cfg,
      key: cfg.setKey || null,
      qs: cfg.questions,
      i: 0,
      picked: new Array(cfg.questions.length).fill(null),
      shown: new Array(cfg.questions.length).fill(false), // 해설 공개 여부
      rec: new Array(cfg.questions.length).fill(undefined), // 이미 기록으로 남긴 답
      graded: false,
      startAt: Date.now(),
      left: cfg.timeLimit || null,
      timer: null
    };
    // ── 진행상황 복원 (같은 세트·같은 모드일 때) ──
    // 예전에는 순서(index)로만 복원해서, 무작위로 섞어 내는 세트(예상문제 전체)는
    // 다음에 열 때 다른 문항에 답이 붙는 문제가 있었다. 이제 문항 id로 맞춘다.
    var pr = Q.key ? Store.loadProgress(Q.key) : null;
    if (pr && pr.mode === cfg.mode && pr.picked) {
      var mapped = null;
      if (pr.qids && pr.qids.length === pr.picked.length) {
        var byId = {};
        pr.qids.forEach(function (id, k) { byId[id] = k; });
        mapped = Q.qs.map(function (q) {
          var k = byId[q.qid];
          return k == null ? null : { p: pr.picked[k], s: (pr.shown || [])[k] };
        });
      } else if (pr.picked.length === Q.qs.length) {
        mapped = Q.qs.map(function (q, k) { return { p: pr.picked[k], s: (pr.shown || [])[k] }; });
      }
      if (mapped) {
        Q.picked = mapped.map(function (x) { return x ? (x.p == null ? null : x.p) : null; });
        Q.shown = mapped.map(function (x) { return !!(x && x.s); });
        // 복원된 답은 이미 기록에 반영된 것으로 본다(미응답은 제출 때 기록되도록 비워 둔다)
        Q.rec = Q.picked.map(function (x) { return x === null ? undefined : x; });
        var curId = pr.qids && pr.qids[pr.i || 0];
        var ci = curId ? Q.qs.findIndex(function (q) { return q.qid === curId; }) : (pr.i || 0);
        Q.i = Math.min(Math.max(ci, 0), Q.qs.length - 1);
        Q.resumed = Q.picked.some(function (x) { return x !== null; });
      }
    }
    // 한 번의 풀이를 묶는 토큰 — 같은 풀이 안에서 답을 고쳐도 오답이 중복으로 쌓이지 않게 한다.
    // 이어 풀기로 돌아오면 같은 토큰을 그대로 쓴다.
    Q.sess = (pr && pr.sess) || ((Q.key || 'tmp') + '#' + Q.startAt);
    if (cfg.startIdx != null && !Q.resumed) Q.i = Math.min(cfg.startIdx, Q.qs.length - 1);
    if (Q.left) {
      Q.timer = setInterval(function () {
        Q.left--;
        var t = el('timer');
        if (t) {
          t.textContent = fmtTime(Q.left);
          t.classList.toggle('low', Q.left < 300);
        }
        if (Q.left <= 0) { clearInterval(Q.timer); submit(true); }
      }, 1000);
    }
    document.addEventListener('keydown', onKey);
    render();
  }

  function persist() {
    if (!Q || !Q.key || Q.graded) return;
    Store.saveProgress(Q.key, {
      i: Q.i, picked: Q.picked, shown: Q.shown, mode: Q.cfg.mode,
      qids: Q.qs.map(function (q) { return q.qid; }),
      sess: Q.sess,
      title: Q.cfg.title, subtitle: Q.cfg.subtitle || '',
      sessionType: Q.cfg.sessionType || '', backHash: Q.cfg.backHash || ''
    });
  }

  function stop() {
    persist();
    document.removeEventListener('keydown', onKey);
    if (Q && Q.timer) clearInterval(Q.timer);
    Q = null;
  }

  function fmtTime(s) {
    s = Math.max(0, s | 0);
    var h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }

  function cur() { return Q.qs[Q.i]; }

  /**
   * 문제 지문. 〔조건〕·〔조문〕 이 들어 있으면 그 앞에서 줄을 바꿔
   * 조건을 별도 상자로 보여준다(원본 시험지의 네모 박스와 같은 모양).
   */
  function stemHTML(stem) {
    var s = String(stem || '');
    var m = s.match(/\s*\*\*〔(조건|조문|보기|자료)〕\*\*\s*/);
    if (!m) return '<p class="qstem">' + MD.inline(s) + '</p>';
    var head = s.slice(0, m.index);
    var body = s.slice(m.index + m[0].length);
    return '<p class="qstem">' + MD.inline(head) + '</p>' +
      '<div class="qcond"><span class="lbl">〔' + m[1] + '〕</span>' +
      MD.inline(body) + '</div>';
  }

  function render() {
    var q = cur(), c = Q.cfg;
    var answered = Q.picked.filter(function (x) { return x !== null; }).length;
    var pct = Math.round(answered / Q.qs.length * 100);
    var reveal = Q.graded || (c.mode === 'study' && Q.shown[Q.i]);
    var revealMode = Store.s.settings.reveal || 'instant';
    var hasAns = q.answer != null;

    var h = '<div class="qwrap">';

    // 헤더
    h += '<div class="row" style="margin-bottom:14px">' +
      '<button class="btn sm ghost" data-act="quit">← 나가기</button>' +
      '<div><div style="font-weight:700">' + MD.esc(c.title) + '</div>' +
      '<div class="small muted">' + MD.esc(c.subtitle || '') + '</div></div>' +
      '<div style="margin-left:auto" class="row">' +
      (Q.left != null ? '<span class="timer" id="timer">' + fmtTime(Q.left) + '</span>' : '') +
      (c.mode === 'study' ?
        '<button class="btn sm ' + (revealMode === 'instant' ? 'primary' : 'ghost') + '" data-act="rv" ' +
        'title="해설 표시 방식 전환">해설 ' + (revealMode === 'instant' ? '자동' : '클릭') + '</button>' : '') +
      '<button class="btn sm" data-act="omr">문항표</button>' +
      // 어느 문항에서든 제출할 수 있게 한다. 건너뛴 문항은 오답으로 채점된다.
      (!Q.graded ? '<button class="btn sm primary" data-act="submit" ' +
        'title="지금까지 푼 것으로 채점합니다. 건너뛴 문항은 오답 처리됩니다">제출·채점</button>' : '') +
      '</div></div>';

    if (Q.resumed) {
      h += '<div class="notice resume">이전에 풀던 위치(' + (Q.i + 1) + '번)에서 이어집니다. ' +
        '<button class="btn sm ghost" data-act="restart">처음부터 다시</button></div>';
    }

    // 진행
    h += '<div class="progress"><span class="lbl">' + (Q.i + 1) + ' / ' + Q.qs.length + '</span>' +
      '<div class="track"><i style="width:' + pct + '%"></i></div>' +
      '<span class="lbl">' + answered + '문항 응답</span></div>';

    h += '<div class="card">';
    h += '<div class="qhead"><span class="qno">' + (Q.i + 1) + '</span>' +
      (q.subject ? '<span class="tag acc">' + MD.esc(q.subject) + '</span>' : '') +
      (q.srcLabel ? '<span class="tag">' + MD.esc(q.srcLabel) + '</span>' : '') +
      (q.rate != null ? '<span class="tag ' + (q.rate < 50 ? 'bad' : q.rate < 70 ? 'warn' : 'ok') + '">정답률 ' + q.rate + '%</span>' : '') +
      (!hasAns ? '<span class="tag warn">정답 미확정</span>' : '') +
      (q.caution ? '<span class="tag warn" title="정답 오류신고가 접수된 문항입니다">⚠️ 주의</span>' : '') +
      '<button class="btn sm ghost' + (Store.s.bookmark[q.qid] ? ' bm-on' : '') + '" data-act="bm" title="즐겨찾기 (단축키 B)" style="margin-left:auto">' +
      (Store.s.bookmark[q.qid] ? '<span class="star">★</span>' : '☆') + '</button>' +
      '</div>';

    h += stemHTML(q.stem);

    // 문제 그림
    if (q.img && q.img.stem) {
      h += '<div class="qimg"><img src="' + q.img.stem + '" alt="문제 그림" loading="lazy">' +
        '<div class="cap">원본 그림 (kinz.kr) · 인터넷 연결 시 표시</div></div>';
    }

    // 보기
    if (q.incomplete && !(q.img && (q.img.stem || q.img.choices))) {
      h += '<div class="notice imgnotice">🖼️ <strong>그림·수식 문항입니다.</strong> ' +
        '원본이 이미지로만 되어 있어 문제와 보기를 글자로 옮기지 못했습니다. ' +
        '아래 버튼으로 원본을 열어 그림을 보고 푸세요.' +
        (q.srcUrl
          ? '<div style="margin-top:9px"><a class="btn sm primary" href="' + q.srcUrl +
            '" target="_blank" rel="noopener">원본 문제 열기 (' + (q.srcLabel || '기출') + ' ' + (q.no || '') + '번) ↗</a></div>'
          : '') +
        '</div>';
    }
    h += '<div class="choices">';
    q.choices.forEach(function (ch) {
      var cls = 'choice';
      if (reveal && hasAns) {
        if (ch.n === q.answer) cls += ' correct';
        else if (ch.n === Q.picked[Q.i]) cls += ' wrong';
        else cls += ' dim';
      } else if (Q.picked[Q.i] === ch.n) cls += ' sel';
      var cimg = q.img && q.img.choices && q.img.choices[ch.n];
      h += '<div class="' + cls + '" data-act="pick" data-n="' + ch.n + '">' +
        '<span class="cn">' + ch.n + '</span>' +
        '<span>' + (cimg
          ? '<img src="' + cimg + '" alt="보기 ' + ch.n + '" style="max-height:64px;vertical-align:middle;background:#fff;border-radius:5px;padding:2px">'
          : MD.inline(ch.text)) + '</span></div>';
    });
    h += '</div>';

    // 해설 (원본 댓글 힌트는 별도로 띄우지 않고 빌드 단계에서 해설 본문에 녹여 넣는다)
    if (reveal) {
      if (hasAns) {
        h += '<div class="expl"><h4>정답 ' + CIRCLE[q.answer - 1] +
          (Q.picked[Q.i] === q.answer ? ' · 정답입니다 ✅' :
            Q.picked[Q.i] ? ' · 오답 ❌' : ' · 미응답') + '</h4>' +
          '<div class="md">' + MD.render(q.explanation || '_해설이 등록되지 않은 문항입니다._') + '</div></div>';
      }
      if (!hasAns) {
        h += '<div class="notice">이 회차는 공식 정답표가 공개되지 않았습니다. ' +
          (q.srcUrl ? '<a href="' + q.srcUrl + '" target="_blank" rel="noopener">CBT에서 채점하기 →</a>' : '') +
          '</div>';
      }
    }
    h += '</div>';

    // 하단 버튼
    h += '<div class="row" style="justify-content:space-between;margin-top:16px">' +
      '<button class="btn" data-act="prev"' + (Q.i === 0 ? ' disabled' : '') + '>← 이전</button>' +
      '<div class="row">';
    if (c.mode === 'study' && !Q.graded) {
      h += Q.shown[Q.i]
        ? '<button class="btn ghost" data-act="hide">해설 숨기기</button>'
        : '<button class="btn" data-act="show">해설 보기</button>';
    }
    if (Q.i === Q.qs.length - 1) {
      h += '<button class="btn primary" data-act="submit">' +
        (c.mode === 'exam' ? '제출하고 채점' : '학습 마치기') + '</button>';
    }
    h += '</div>' +
      '<button class="btn" data-act="next"' + (Q.i === Q.qs.length - 1 ? ' disabled' : '') + '>다음 →</button>' +
      '</div>';

    h += '<div class="keyhint">⌨️ <b>1~4</b> 보기 선택 · <b>Enter</b>/<b>→</b>/<b>5</b> 다음 · <b>←</b> 이전' +
      (c.mode === 'study' ? ' · <b>H</b> 해설 표시/숨김' : '') + ' · <b>B</b> 즐겨찾기 · <b>O</b> 문항표 · <b>ESC</b> 나가기</div>';

    h += '<div class="card" id="omrbox" style="display:' + (Q.omrOpen ? 'block' : 'none') + '">' +
      '<div class="small muted" style="margin-bottom:8px">문항표 — 과목별 20문항</div>' + omrRows() + '</div></div>';

    el('view').innerHTML = h;
    bind();
    window.scrollTo(0, 0);
  }

  /** 과목별 20문항씩 줄바꿈한 문항표 */
  function omrRows() {
    var rows = [], cur = null;
    Q.qs.forEach(function (qq, idx) {
      var sj = qq.subject || '기타';
      if (!cur || cur.subject !== sj || cur.items.length >= 20) {
        cur = { subject: sj, items: [] };
        rows.push(cur);
      }
      cur.items.push(idx);
    });
    var h = '';
    rows.forEach(function (r) {
      h += '<div class="omrrow"><div class="omrlbl">' + MD.esc(r.subject) + '</div><div class="omr">';
      r.items.forEach(function (idx) {
        var qq = Q.qs[idx], cl = '';
        var revealed = Q.graded || Q.shown[idx];
        if (revealed && qq.answer != null && Q.picked[idx] !== null) {
          cl = Q.picked[idx] === qq.answer ? 'ok' : 'no';
        } else if (Q.picked[idx] !== null) cl = 'done';
        if (idx === Q.i) cl += ' cur';
        h += '<button class="' + cl + '" data-act="go" data-i="' + idx + '">' + (idx + 1) + '</button>';
      });
      h += '</div></div>';
    });
    return h;
  }

  function bind() {
    el('view').querySelectorAll('[data-act]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        e.stopPropagation();
        var a = n.dataset.act;
        if (a === 'pick') pick(+n.dataset.n);
        else if (a === 'next') { if (Q.i < Q.qs.length - 1) { Q.i++; Q.resumed = false; persist(); render(); } }
        else if (a === 'prev') { if (Q.i > 0) { Q.i--; Q.resumed = false; persist(); render(); } }
        else if (a === 'go') { Q.i = +n.dataset.i; Q.resumed = false; persist(); render(); }
        else if (a === 'show') { Q.shown[Q.i] = true; persist(); render(); }
        else if (a === 'hide') { Q.shown[Q.i] = false; persist(); render(); }
        else if (a === 'submit') submit(false);
        else if (a === 'quit') quit();
        else if (a === 'bm') { toggleBookmark(); }
        else if (a === 'omr') {
          Q.omrOpen = !Q.omrOpen;
          var b = el('omrbox');
          if (b) b.style.display = Q.omrOpen ? 'block' : 'none';
        }
        else if (a === 'rv') {
          Store.setReveal((Store.s.settings.reveal || 'instant') === 'instant' ? 'click' : 'instant');
          render();
        }
        else if (a === 'restart') {
          if (confirm('이 세트의 진행기록을 지우고 1번부터 다시 시작합니다.\n' +
                      '(지금까지 푼 문항의 통계·오답노트 기록은 그대로 남습니다)')) {
            Store.clearProgress(Q.key);
            Q.picked = new Array(Q.qs.length).fill(null);
            Q.shown = new Array(Q.qs.length).fill(false);
            Q.rec = new Array(Q.qs.length).fill(undefined);
            Q.sess = (Q.key || 'tmp') + '#' + Date.now();  // 새 풀이로 취급
            Q.i = 0; Q.resumed = false; render();
          }
        }
      });
    });
  }

  /* ── 키보드 조작 ────────────────────────────
     1·2·3·4 (또는 숫자패드) : 보기 선택
     Enter / → / Space / 5    : 다음 문항
     ← / Backspace            : 이전 문항
     H                        : 해설 보기/숨기기 (토글)
     B                        : 즐겨찾기(★) 토글
     O                        : 문항표 열기/닫기
     ESC                      : 나가기
  */
  function onKey(e) {
    if (!Q) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;   // 입력 중이면 무시
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var k = e.key;
    // 보기 선택
    if (/^[1-4]$/.test(k)) {
      e.preventDefault();
      var n = +k;
      if (cur().choices.some(function (c) { return c.n === n; })) pick(n);
      return;
    }
    // 다음 / 이전
    if (k === 'Enter' || k === 'ArrowRight' || k === ' ' || k === 'Spacebar' || k === '5') {
      e.preventDefault();
      if (Q.i < Q.qs.length - 1) { Q.i++; Q.resumed = false; persist(); render(); }
      else if (!Q.graded) submit(false);
      return;
    }
    if (k === 'ArrowLeft' || k === 'Backspace') {
      e.preventDefault();
      if (Q.i > 0) { Q.i--; Q.resumed = false; persist(); render(); }
      return;
    }
    // 해설 보기/숨기기 (토글)
    if (k === 'h' || k === 'H' || k === 'ㅗ') {
      e.preventDefault();
      if (Q.cfg.mode === 'study' && !Q.graded) {
        Q.shown[Q.i] = !Q.shown[Q.i];
        persist();
        render();
      }
      return;
    }
    // 즐겨찾기(★) 토글
    if (k === 'b' || k === 'B' || k === 'ㅠ') {
      e.preventDefault();
      toggleBookmark();
      return;
    }
    // 문항표
    if (k === 'o' || k === 'O' || k === 'ㅐ') {
      e.preventDefault();
      Q.omrOpen = !Q.omrOpen;
      var b = el('omrbox'); if (b) b.style.display = Q.omrOpen ? 'block' : 'none';
      return;
    }
    if (k === 'Escape') { e.preventDefault(); quit(); }
  }

  /**
   * 즐겨찾기(★) 토글.
   * render()로 전체를 다시 그리면 화면이 맨 위로 튀어 읽던 위치를 잃으므로,
   * 별표 버튼만 제자리에서 갱신한다.
   */
  function toggleBookmark() {
    var q = cur();
    Store.toggleBookmark(q.qid);
    var on = !!Store.s.bookmark[q.qid];
    var btn = el('view').querySelector('[data-act="bm"]');
    if (btn) {
      btn.classList.toggle('bm-on', on);
      btn.innerHTML = on ? '<span class="star">★</span>' : '☆';
    }
    flash(on ? '★ 즐겨찾기에 담았습니다' : '즐겨찾기에서 뺐습니다');
  }

  /** 하단 토스트 (app.js와 같은 요소를 재사용) */
  function flash(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 1500);
  }

  /**
   * 답 고르기.
   * 학습·시험 모드 모두 고르는 즉시 통계·오답노트에 기록한다(제출을 안 해도 남는다).
   *  - 학습 모드: 정답을 보기 전까지는 고쳐 고를 때마다 기록을 갱신하고,
   *               해설이 공개된 뒤의 재선택은 기록하지 않는다(정답을 보고 고친 것이므로).
   *  - 시험 모드: 제출 전 답을 바꾸면 마지막으로 고른 답으로 기록이 갱신된다.
   */
  function pick(n) {
    if (Q.graded) return;
    Q.picked[Q.i] = n;
    Q.resumed = false;
    var q = cur();
    var lockedByReveal = (Q.cfg.mode === 'study' && Q.shown[Q.i]);
    if (q.answer != null && !lockedByReveal && Q.rec[Q.i] !== n) {
      Store.record(q, n, n === q.answer, Q.sess);
      Q.rec[Q.i] = n;
    }
    if (Q.cfg.mode === 'study') {
      // 해설 노출은 설정에 따름 (instant=바로, click='해설 보기' 눌러야)
      if ((Store.s.settings.reveal || 'instant') === 'instant') Q.shown[Q.i] = true;
    }
    persist();
    render();
  }

  /** location.hash로 이동. 이미 같은 해시라면(예: 오답노트에서 시작한 복습처럼
   *  화면 전환 없이 바로 시작한 경우) hashchange가 발생하지 않으므로 라우터를 직접 호출한다. */
  function goHash(h) {
    if (location.hash === h) { if (w.route) w.route(); }
    else location.hash = h;
  }

  function quit() {
    persist();
    var b = Q.cfg.backHash || '#/home';
    document.removeEventListener('keydown', onKey);
    if (Q && Q.timer) clearInterval(Q.timer);
    Q = null;
    goHash(b);
  }

  function submit(auto) {
    var gradable = Q.qs.filter(function (q) { return q.answer != null; });
    if (!Q.graded) {
      // 건너뛴(미응답) 문항은 오답으로 채점된다는 것을 분명히 알리고 확인받는다.
      if (!auto) {
        var un = 0;
        Q.qs.forEach(function (q, idx) {
          if (q.answer != null && Q.picked[idx] === null) un++;
        });
        if (un && !confirm('건너뛴 문항이 ' + un + '개 있습니다.\n' +
                           '지금 제출하면 이 문항들은 모두 오답으로 채점됩니다.\n\n' +
                           '계속 제출할까요?')) return;
      }
      Q.graded = true;
      if (Q.timer) clearInterval(Q.timer);
      // 채점 기록 — 푸는 동안 이미 기록된 문항은 건너뛰고, 남은 것(미응답 포함)만 남긴다
      Store.bulk(function () {
        Q.qs.forEach(function (q, idx) {
          if (q.answer == null) return;
          if (Q.rec[idx] === Q.picked[idx]) return; // 이미 같은 답으로 기록됨
          Store.record(q, Q.picked[idx], Q.picked[idx] === q.answer, Q.sess);
          Q.rec[idx] = Q.picked[idx];
        });
      });
    }
    if (gradable.length === 0) { var bh = Q.cfg.backHash || '#/home'; stop(); goHash(bh); return; }
    showResult(auto);
  }

  function showResult(auto) {
    var bySubj = {}, ok = 0, n = 0;
    Q.qs.forEach(function (q, idx) {
      if (q.answer == null) return;
      var s = q.subject || '기타';
      bySubj[s] = bySubj[s] || { ok: 0, n: 0 };
      bySubj[s].n++; n++;
      if (Q.picked[idx] === q.answer) { bySubj[s].ok++; ok++; }
    });
    var pct = n ? Math.round(ok / n * 100) : 0;
    // 합격 판정: 과목당 40% 이상 + 전체 평균 60% 이상
    var subjNames = Object.keys(bySubj);
    var fail40 = subjNames.filter(function (s) {
      return bySubj[s].n >= 5 && bySubj[s].ok / bySubj[s].n < 0.4;
    });
    var pass = pct >= 60 && fail40.length === 0;
    var elapsed = Math.round((Date.now() - Q.startAt) / 1000);

    // 과목별 점수까지 함께 남긴다 — 기출·예상문제·모의고사 모두 같은 형식으로 기록해
    // 나중에 통계 탭에서 한꺼번에 비교할 수 있게 한다.
    if (Q.key) {
      Store.addAttempt(Q.key, {
        ok: ok, n: n, pct: pct, mode: Q.cfg.mode, pass: pass,
        bySubject: bySubj, elapsed: elapsed
      });
      Store.clearProgress(Q.key);
    }
    // 어떤 문항이 나왔고 무엇을 틀렸는지 함께 남긴다 —
    // 모의고사처럼 매번 다른 문항이 출제되는 세트도 나중에 '이 회차 오답'을 다시 모아볼 수 있게.
    var qidsAll = [], qidsWrong = [];
    Q.qs.forEach(function (q, idx) {
      if (q.answer == null) return;
      qidsAll.push(q.qid);
      if (Q.picked[idx] !== q.answer) qidsWrong.push(q.qid);
    });
    Store.addSession({
      at: Date.now(), type: Q.cfg.sessionType || (Q.cfg.mode === 'exam' ? '모의고사' : '학습'),
      title: Q.cfg.title, subtitle: Q.cfg.subtitle || '',
      setKey: Q.key || '', mode: Q.cfg.mode,
      score: ok, total: n, pct: pct,
      bySubject: bySubj, pass: pass, elapsed: elapsed,
      // 출제 문항 전체는 모의고사만 남긴다(무작위라 다시 만들 수 없으므로).
      // 기출·예상문제는 setKey로 언제든 같은 세트를 다시 불러올 수 있어 저장하지 않는다.
      qids: (Q.cfg.sessionType === '모의고사' ? qidsAll : undefined),
      wrongQids: qidsWrong
    });

    var h = '<div class="qwrap"><h2 class="page">채점 결과</h2>' +
      '<p class="lead">' + MD.esc(Q.cfg.title) + (auto ? ' · ⏰ 시간 종료로 자동 제출' : '') + '</p>';

    h += '<div class="card" style="text-align:center">' +
      '<div class="small muted">득점</div>' +
      '<div style="font-size:52px;font-weight:800;letter-spacing:-2px;color:' +
      (pass ? 'var(--ok)' : 'var(--bad)') + '">' + pct + '<span style="font-size:24px">점</span></div>' +
      '<div class="muted">' + ok + ' / ' + n + '문항 정답 · 소요 ' + fmtTime(elapsed) + '</div>' +
      '<div style="margin-top:12px"><span class="tag ' + (pass ? 'ok' : 'bad') + '" style="font-size:14px;padding:6px 18px">' +
      (pass ? '합격 기준 충족' : '불합격') + '</span></div>' +
      (fail40.length ? '<div class="notice" style="margin-top:14px;text-align:left">⚠️ <strong>과락 과목</strong>: ' +
        fail40.map(MD.esc).join(', ') + ' — 과목당 40% 미만은 총점과 무관하게 불합격입니다.</div>' : '') +
      '</div>';

    h += '<div class="grid g2">';
    subjNames.forEach(function (s) {
      var b = bySubj[s], p = Math.round(b.ok / b.n * 100);
      h += '<div class="stat"><div class="k">' + MD.esc(s) + '</div>' +
        '<div class="v">' + p + '%</div><div class="n">' + b.ok + '/' + b.n + '문항</div>' +
        '<div class="bar ' + (p < 40 ? 'bad' : p >= 60 ? 'ok' : '') + '"><i style="width:' + p + '%"></i></div></div>';
    });
    h += '</div>';

    var wrongIdx = [];
    Q.qs.forEach(function (q, idx) {
      if (q.answer != null && Q.picked[idx] !== q.answer) wrongIdx.push(idx);
    });
    h += '<div class="card"><div class="row" style="justify-content:space-between">' +
      '<strong>틀린 문항 ' + wrongIdx.length + '개</strong>' +
      '<span class="small muted">오답노트에 자동 저장되었습니다</span></div>';
    h += '<div class="omr" style="margin-top:12px">';
    Q.qs.forEach(function (q, idx) {
      var cl = q.answer == null ? '' : (Q.picked[idx] === q.answer ? 'ok' : 'no');
      h += '<button class="' + cl + '" data-act="review" data-i="' + idx + '">' + (idx + 1) + '</button>';
    });
    h += '</div></div>';

    h += '<div class="row" style="justify-content:center;margin-top:18px">' +
      '<button class="btn" data-act="review" data-i="0">문항별 해설 보기</button>' +
      '<button class="btn" data-act="wrongnote">오답노트로 →</button>' +
      '<button class="btn primary" data-act="home">홈으로</button></div></div>';

    el('view').innerHTML = h;
    el('view').querySelectorAll('[data-act]').forEach(function (nd) {
      nd.addEventListener('click', function () {
        var a = nd.dataset.act;
        if (a === 'review') { Q.i = +nd.dataset.i; render(); }
        else if (a === 'home') { var b = Q.cfg.backHash || '#/home'; stop(); goHash(b); }
        else if (a === 'wrongnote') { stop(); goHash('#/wrong'); }
      });
    });
    window.scrollTo(0, 0);
    if (Q.cfg.onFinish) Q.cfg.onFinish({ ok: ok, n: n, pct: pct, pass: pass, bySubject: bySubj });
  }

  w.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persist();
  });

  w.Quiz = { start: start, stop: stop, fmtTime: fmtTime, CIRCLE: CIRCLE };
})(window);
