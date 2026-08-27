/* 실기(필답형) — 주관식 출제와 자동채점
 *
 * 필기와 달리 보기가 없다. 채점은 4단으로 나뉜다.
 *   1단 숫자·단위 대조 (계산)      → 완전 자동
 *   2단 채점 포인트 키워드 (서술)  → 자동, 놓친 포인트를 짚어준다
 *   3단 최종 O/△/X 자기판정        → 최종 판정은 사람이 한다
 *   4단 애매한 것만 Claude 에게    → 답안 내보내기
 * 2단은 판단을 대신하지 않는다. "전색을 하면 안 된다"처럼 반대로 써도 키워드는
 * 들어가고, 뜻이 맞아도 용어가 다르면 떨어진다. 그래서 3단을 뺄 수 없다.
 */
(function (w) {
  'use strict';

  var LEVELS = ['기사', '산업기사'];

  function all() { return w.PRACTICAL || []; }
  function byId(id) {
    var r = null;
    all().forEach(function (e) { if (e.id === id) r = e; });
    return r;
  }
  function qidOf(exam, q) { return 'prac#' + exam.id + '#' + q.no; }

  /* ── 정규화 ───────────────────────────────────────── */
  // 순서 나열의 구분자를 지우려면 하이픈을 빼야 하는데, 그러면 음수 지수가 깨진다.
  // 그래서 텍스트용과 숫자용 정규화를 따로 둔다.
  function normText(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
      .replace(/[\s,·:;\-–—()\[\]'"]/g, '');
  }
  function nums(s) {
    var t = String(s == null ? '' : s).normalize('NFKC').toLowerCase()
      .replace(/×/g, 'x').replace(/[−–—]/g, '-').replace(/\^/g, '')
      .replace(/[\s,]/g, '');
    var out = [], re = /(-?\d+\.?\d*)(?:x10(-?\d+)|e(-?\d+))?/g, m;
    while ((m = re.exec(t))) {
      var v = parseFloat(m[1]);
      if (isNaN(v)) continue;
      var ex = m[2] || m[3];
      if (ex) v *= Math.pow(10, parseInt(ex, 10));
      out.push(v);
    }
    return out;
  }
  function hit(ans, keys) {
    var a = normText(ans);
    return (keys || []).some(function (k) { return a.indexOf(normText(k)) >= 0; });
  }

  /* ── 채점 ─────────────────────────────────────────── */
  function grade(q, ans) {
    var g = q.grade;
    if (!g || !String(ans || '').trim()) {
      return { score: 0, auto: false, msg: g ? '답안이 비어 있습니다' : '채점기준 없음 — 직접 대조하세요' };
    }
    var vs, i, items, got, sc, miss;

    if (g.mode === 'numeric') {
      vs = nums(ans);
      var cands = [g].concat(g.also || []);
      for (i = 0; i < cands.length; i++) {
        var c = cands[i];
        // 절대오차만 쓰면 유효숫자를 달리 반올림한 답이 오답이 된다
        var tol = Math.max(c.tol != null ? c.tol : g.tol, Math.abs(c.value) * 0.015);
        var okv = vs.some(function (v) { return Math.abs(v - c.value) <= tol; });
        if (okv) {
          return { score: 1, auto: true,
            msg: '정답' + (c.note ? ' — 별해 인정: ' + c.note : '') };
        }
      }
      var near = (g.near || []).filter(function (n) {
        var t = Math.max(Math.abs(n.value) * 0.01, g.tol);
        return vs.some(function (v) { return Math.abs(v - n.value) <= t; });
      });
      return { score: 0, auto: true,
        msg: near.length ? '오답 — ' + near[0].note
                         : '오답 (정답 ' + g.value + (g.unit || '') + ')' };
    }

    if (g.mode === 'blanks') {
      items = g.blanks;
      got = items.map(function (it) { return { it: it, ok: hit(ans, it.any) }; });
      sc = got.reduce(function (a, x) { return a + (x.ok ? x.it.weight : 0); }, 0);
      miss = got.filter(function (x) { return !x.ok; }).map(function (x) { return x.it.label; });
      return { score: round2(sc), auto: true, miss: miss,
        msg: miss.length ? '누락 → ' + miss.join(' / ') : '전부 포함' };
    }

    // 순서 무관 나열. "6가지 중 4가지를 쓰시오" 처럼 보기가 정답 수보다 많을 수 있으므로
    // 맞힌 개수를 need 로 나눈다 — 전부 나열해야 만점이 되면 안 된다.
    if (g.mode === 'set') {
      items = g.items;
      var need = g.need || items.length;
      got = items.map(function (it) { return { it: it, ok: hit(ans, it.any) }; });
      var n = got.filter(function (x) { return x.ok; }).length;
      sc = Math.min(1, n / need);
      miss = got.filter(function (x) { return !x.ok; }).map(function (x) { return x.it.label; });
      return { score: round2(sc), auto: true, miss: miss,
        msg: n >= need ? need + '가지 모두 정답'
                       : need + '가지 중 ' + n + '가지만 맞음 · 남은 정답 → ' + miss.join(' / ') };
    }

    if (g.mode === 'keywords') {
      got = g.rubric.map(function (it) { return { it: it, ok: hit(ans, it.any) }; });
      sc = got.reduce(function (a, x) { return a + (x.ok ? x.it.weight : 0); }, 0);
      miss = got.filter(function (x) { return !x.ok; }).map(function (x) { return x.it.label; });
      return { score: round2(sc), auto: false, miss: miss, points: got,
        msg: miss.length ? '놓친 포인트 → ' + miss.join(' / ') : '채점 포인트 전부 포함' };
    }

    if (g.mode === 'sequence') {
      var a = normText(ans), pos = -1, order = true, found = 0;
      g.seq.forEach(function (s) {
        var p = a.indexOf(normText(s));
        if (p < 0) return;
        found++;
        if (p < pos) order = false;
        pos = p;
      });
      if (found === g.seq.length && order) return { score: 1, auto: true, msg: '순서까지 정확' };
      if (found === g.seq.length) return { score: 0.5, auto: true, msg: '항목은 전부 있으나 순서가 틀림' };
      return { score: round2(found / g.seq.length * 0.5), auto: true,
        msg: g.seq.length + '개 중 ' + found + '개만 기재' };
    }
    return { score: 0, auto: false, msg: '직접 대조하세요' };
  }
  function round2(x) { return Math.round(x * 100) / 100; }

  w.Practical = {
    LEVELS: LEVELS, all: all, byId: byId, qidOf: qidOf,
    grade: grade, nums: nums, normText: normText
  };
})(window);
