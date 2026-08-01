/* 의존성 없는 최소 마크다운 렌더러 (이론/해설 표시용) */
(function (w) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── 수식(분수·지수·근호) 렌더링 ────────────────────────────
     지원 문법 (마크다운 원문에 그대로 쓰면 됨)
       $ ... $      인라인 수식
       $$ ... $$    블록 수식(가운데 정렬)
       \frac{a}{b}  분수 (위 a / 아래 b, 가로선)
       a^{n} a_{n}  지수·아래첨자
       \sqrt{x}     제곱근,  \cbrt{x} 세제곱근
       \times \cdot \div \le \ge \pm \approx \deg \alpha ...
  */
  var SYM = {
    '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±',
    '\\le': '≤', '\\ge': '≥', '\\ne': '≠', '\\approx': '≒',
    '\\deg': '°', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ',
    '\\epsilon': 'ε', '\\theta': 'θ', '\\phi': 'φ', '\\sigma': 'σ', '\\tau': 'τ',
    '\\rho': 'ρ', '\\nu': 'ν', '\\pi': 'π', '\\Delta': 'Δ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\omega': 'ω', '\\sum': 'Σ',
    '\\infty': '∞', '\\to': '→', '\\propto': '∝', '\\ell': 'ℓ',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\quad': ' ',
    '\\qquad': '  ', '\\varepsilon': 'ε', '\\varphi': 'φ', '\\psi': 'ψ',
    '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
    '\\geq': '≥', '\\leq': '≤', '\\neq': '≠', '\\sim': '∼',
    '\\gg': '≫', '\\ll': '≪', '\\perp': '⊥', '\\angle': '∠',
    '\\partial': '∂', '\\int': '∫', '\\prime': '′',
    // 대문자 그리스·단위 기호 (Ω·Φ 등이 명령 이름 그대로 보이던 문제 보완)
    '\\Omega': 'Ω', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Sigma': 'Σ',
    '\\Pi': 'Π', '\\Lambda': 'Λ', '\\Gamma': 'Γ', '\\Theta': 'Θ',
    '\\varPhi': 'Φ', '\\varOmega': 'Ω', '\\degree': '°', '\\circ': '∘'
  };

  /** 삼각·로그 등 함수명은 정체(로만체)로 세워 표시한다 */
  var FUNCS = ['arcsin','arccos','arctan','sinh','cosh','tanh',
               'sin','cos','tan','cot','sec','csc','log','ln','exp','max','min'];

  /** 중괄호 균형을 맞춰 인수 하나를 떼어냄 → [내용, 남은문자열] */
  function arg(str) {
    // 중괄호 없이 명령을 인수로 쓴 경우도 통째로 받는다 (예: \sigma_\theta, x^\circ)
    if (str[0] === '\\') {
      var cmd = /^\\[A-Za-z]+/.exec(str);
      if (cmd) return [cmd[0], str.slice(cmd[0].length)];
    }
    if (str[0] !== '{') return [str[0] || '', str.slice(1)];
    var d = 0, i = 0;
    for (; i < str.length; i++) {
      if (str[i] === '{') d++;
      else if (str[i] === '}') { d--; if (!d) break; }
    }
    return [str.slice(1, i), str.slice(i + 1)];
  }

  function tex(src) {
    var out = '', s = String(src);
    while (s.length) {
      if (s.slice(0, 5) === '\\frac' || s.slice(0, 6) === '\\dfrac') {
        s = s.slice(s[1] === 'd' ? 6 : 5);
        var a = arg(s); var num = a[0]; s = a[1];
        var b = arg(s); var den = b[0]; s = b[1];
        out += '<span class="frac"><span class="num">' + tex(num) +
               '</span><span class="den">' + tex(den) + '</span></span>';
        continue;
      }
      if (s.slice(0, 5) === '\\sqrt') {
        s = s.slice(5); var r = arg(s); s = r[1];
        out += '√<span style="border-top:1.4px solid currentColor;padding:0 .15em">' + tex(r[0]) + '</span>';
        continue;
      }
      if (s.slice(0, 5) === '\\cbrt') {
        s = s.slice(5); var r3 = arg(s); s = r3[1];
        out += '<sup style="font-size:.62em">3</sup>√<span style="border-top:1.4px solid currentColor;padding:0 .15em">' +
               tex(r3[0]) + '</span>';
        continue;
      }
      if (s.slice(0, 5) === '\\text' || s.slice(0, 7) === '\\mathrm' || s.slice(0, 4) === '\\bar') {
        var isBar = s.slice(0, 4) === '\\bar';
        s = s.slice(isBar ? 4 : (s[2] === 'e' ? 5 : 7));
        var tv = arg(s); s = tv[1];
        out += isBar
          ? '<span style="border-top:1.3px solid currentColor">' + tex(tv[0]) + '</span>'
          : '<span style="font-family:inherit">' + tex(tv[0]) + '</span>';
        continue;
      }
      // \left( \right) 의 크기 지정자만 제거한다.
      // 주의: \rightarrow 는 \right 로 시작하므로 먼저 걸러내야 'arrow' 로 깨지지 않는다.
      if ((s.slice(0, 5) === '\\left' || s.slice(0, 6) === '\\right') &&
          !/^\\(left|right)(arrow|harpoon)/.test(s)) {
        s = s.slice(s[2] === 'e' ? 5 : 6); continue;
      }
      if (s[0] === '^' || s[0] === '_') {
        var tag = s[0] === '^' ? 'sup' : 'sub';
        s = s.slice(1); var e = arg(s); s = e[1];
        out += '<' + tag + '>' + tex(e[0]) + '</' + tag + '>';
        continue;
      }
      if (s[0] === '\\') {
        if (s[1] === ' ' || s[1] === ',' || s[1] === ';') { out += ' '; s = s.slice(2); continue; }
        var m = s.match(/^\\[A-Za-z]+/);
        if (m && SYM[m[0]] !== undefined) { out += SYM[m[0]]; s = s.slice(m[0].length); continue; }
        // \sin \tan \log 같은 함수명은 기울이지 않고 정체로 세워 쓴다
        if (m && FUNCS.indexOf(m[0].slice(1)) >= 0) {
          out += '<span style="font-style:normal">' + m[0].slice(1) + '</span>';
          s = s.slice(m[0].length); continue;
        }
        if (m) { out += m[0].slice(1); s = s.slice(m[0].length); continue; }
      }
      if (s[0] === '{' || s[0] === '}') { s = s.slice(1); continue; }
      out += s[0]; s = s.slice(1);
    }
    return out;
  }

  /** 이미 esc 된 문자열에서 $...$ / $$...$$ 를 수식으로 치환 */
  function mathify(escaped) {
    return escaped
      .replace(/\$\$([^$]+)\$\$/g, function (_, x) {
        return '<span class="fx fxblock">' + tex(x) + '</span>';
      })
      .replace(/\$([^$\n]+)\$/g, function (_, x) {
        return '<span class="fx">' + tex(x) + '</span>';
      });
  }

  function inline(s) {
    return mathify(esc(s))
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }

  function tableRow(line) {
    var cells = line.trim().replace(/^\||\|$/g, '').split('|');
    return cells.map(function (c) { return c.trim(); });
  }

  function render(src) {
    if (!src) return '';
    var lines = String(src).replace(/\r/g, '').split('\n');
    var out = [], i = 0;

    while (i < lines.length) {
      var l = lines[i];

      // 코드블록
      if (/^```/.test(l)) {
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 표
      if (/^\s*\|.*\|/.test(l) && i + 1 < lines.length && /^\s*\|[\s:-]+\|/.test(lines[i + 1])) {
        var head = tableRow(l);
        i += 2;
        var body = [];
        while (i < lines.length && /^\s*\|.*\|/.test(lines[i])) { body.push(tableRow(lines[i])); i++; }
        out.push('<table><thead><tr>' +
          head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          body.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>');
        continue;
      }

      // 헤딩
      var h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = h[1].length;
        var id = 'h_' + h[2].replace(/[^\w가-힣]/g, '').slice(0, 40);
        out.push('<h' + lv + ' id="' + id + '">' + inline(h[2]) + '</h' + lv + '>');
        i++; continue;
      }

      // 수평선
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }

      // 인용
      if (/^\s*>\s?/.test(l)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, '')); i++;
        }
        out.push('<blockquote>' + render(q.join('\n')) + '</blockquote>');
        continue;
      }

      // 목록 (중첩 1단계 지원)
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l);
        var items = [], baseIndent = l.match(/^\s*/)[0].length;
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          var ind = lines[i].match(/^\s*/)[0].length;
          var txt = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
          if (ind > baseIndent && items.length) {
            items[items.length - 1].sub.push(txt);
          } else {
            items.push({ txt: txt, sub: [] });
          }
          i++;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (it) {
          var s = '<li>' + inline(it.txt);
          if (it.sub.length) {
            s += '<ul>' + it.sub.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul>';
          }
          return s + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      // 빈 줄
      if (!l.trim()) { i++; continue; }

      // 문단
      var p = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|\|)/.test(lines[i]) &&
             !/^\s*-{3,}\s*$/.test(lines[i])) {
        p.push(lines[i]); i++;
      }
      // 원문의 개행을 그대로 살려 <br>로 표시 — 같은 문단 안에서도 사실별로
      // 줄을 나눠 쓴 해설(예: "A: ... \n B는 ... \n ※ 주의: ...")이 한 줄로
      // 뭉쳐 보이지 않도록 한다.
      if (p.length) out.push('<p>' + inline(p.join('\n')).replace(/\n/g, '<br>') + '</p>');
      else i++;
    }
    return out.join('\n');
  }

  w.MD = { render: render, esc: esc, inline: inline, tex: tex, mathify: mathify };
})(window);
