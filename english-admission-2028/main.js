// 2028 정시 + 학평 5회 + 영어 코칭 브리핑 — json을 읽어 표·그래프를 그리고, 스크롤에 맞춰 등장시킨다.
// 모션 값은 styles.css의 --dur-* / --stagger와 맞춘다.
// 실행: 로컬 서버 필요 (fetch 사용).  예) npx serve .   또는  python3 -m http.server
document.documentElement.classList.add('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STAGGER = 60; // ms, 형제 요소 간 등장 간격 (--stagger)
const DUR = 240;    // ms, 회차 넘길 때 사라지는 시간 (--dur-out)

const $ = (s) => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (v, d = 1) => (v === null || v === undefined ? '대기' : Number(v).toFixed(d).replace(/\.0$/, ''));

// ---------- 계산 ----------
const filled = (t) => t.wrong.filter((v) => v !== null);
const rate = (t) => {
  const n = t.to - t.from + 1, done = filled(t);
  if (!done.length) return null;
  return Math.round((done.reduce((a, b) => a + b, 0) / (n * done.length)) * 100);
};
const level = (r) => (r >= 70 ? 4 : r >= 50 ? 3 : r >= 30 ? 2 : r >= 15 ? 1 : 0);
// 대학 입결과 같은 방식: (국 + 수 + 탐2과목 평균) ÷ 3
const avgPct = (r) => (r.pending ? null : (r.kor.pct + r.math.pct + (r.soc.pct + r.sci.pct) / 2) / 3);
// 등급 → 히트맵 색 단계 (1·2등급 좋음 … 6등급 이하 나쁨)
const gradeLevel = (g) => (g <= 2 ? 0 : g === 3 ? 1 : g === 4 ? 2 : g === 5 ? 3 : 4);
const stagger = (els, base = 0) => els.forEach((el, i) => (el.style.transitionDelay = `${base + i * STAGGER}ms`));

// 같은 data-key를 가진 곳(첫 화면, 범례 등)을 한 번에 갱신
function setKey(key, v, decimals = 0) {
  if (v === null || v === undefined) return;
  $$(`[data-key="${key}"]`).forEach((el) => {
    el.textContent = typeof v === 'number' ? v.toFixed(decimals) : v;
    if (el.dataset.count !== undefined) el.dataset.count = v;
  });
}

function barRow(label, value, max, unit, cls = '', sub = '') {
  const pct = clamp((value / max) * 100, 0, 100);
  return `<div class="bar-row">
    <span>${label}</span>
    <span class="bar-track"><span class="bar-fill ${cls}" style="width:${pct}%"></span></span>
    <span class="bar-val">${value}${unit}</span>
    ${sub ? `<span class="bar-sub">${sub}</span>` : ''}
  </div>`;
}

// ---------- 첫 화면 ----------
function renderHero(mocks, eng, plan) {
  const done = mocks.rounds.filter((r) => !r.pending);
  const last = done[done.length - 1];
  const now = Math.round(avgPct(last) * 10) / 10;
  setKey('now', now, 1);
  setKey('now-round', last.label);
  setKey('target', plan.target);
  setKey('gap', Math.round((plan.target - now) * 10) / 10, 1);
  // 첫 화면 눈금: 70~100 위에 지금과 목표
  const g = $('#gauge'), x = (v) => `${clamp(((v - 70) / 30) * 100, 0, 100)}%`;
  if (g) { g.style.setProperty('--now', x(now)); g.style.setProperty('--goal', x(plan.target)); }

  const byName = (name) => eng.types.find((t) => t.name === name);
  setKey('blank', rate(byName('빈칸')));
  setKey('listen', rate(byName('듣기')));
  $$('[data-rounds]').forEach((el) => (el.textContent = filled(eng.types[0]).length));
  const er = [...eng.rounds].reverse().find((r) => r.raw !== null);
  if (er) { setKey('eng-raw', er.raw); setKey('eng-grade', er.grade); setKey('eng-label', er.label); }
}

// 큰 숫자: 스크롤 위치에 따라 숫자 표 첫 줄로 줄어들며 이동 (고정 없음, transform·opacity만)
function heroFlight() {
  const big = $('#hero-big'), hero = $('.hero'), land = $('.m-now .m-v > span');
  if (!big || !land || reduce) return;
  hero.classList.add('flying'); // 도착 전까지 표 첫 줄 숫자는 숨겨 두어 두 숫자가 겹치지 않게
  let from = null;
  const measure = () => {
    big.style.transform = ''; big.style.opacity = '';
    // offsetTop/Left는 등장 효과(translateY)를 무시한 실제 배치 위치라, 숫자 칸이 아직 등장 전이어도 정확하다
    const pos = (el) => { let x = 0, y = 0; for (let n = el; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
    const a = pos(big), b = pos(land);
    // 두 숫자 모두 inline-block + line-height 1이라 글자 크기 비율 = 줄일 비율. 왼쪽 위를 기준으로 맞춘다
    const s = parseFloat(getComputedStyle(land).fontSize) / parseFloat(getComputedStyle(big).fontSize);
    from = { dx: b.x - a.x, dy: b.y - a.y, s, range: Math.max(160, b.y - a.y + innerHeight * 0.25) };
  };
  const tick = () => {
    if (!from) measure();
    const p = clamp(scrollY / from.range, 0, 1);
    const e = 1 - Math.pow(1 - p, 2); // ease-out
    big.style.transform = `translate(${from.dx * e}px, ${from.dy * e}px) scale(${1 + (from.s - 1) * e})`;
    hero.classList.toggle('landed', p >= 1);
  };
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { tick(); ticking = false; }); } }, { passive: true });
  addEventListener('resize', () => { from = null; tick(); });
  document.fonts?.ready.then(() => { from = null; tick(); });
  tick();
}

// ---------- 01 정시 구조 ----------
function renderCsat(plan) {
  const U = plan.univs, pad = (n) => String(n).padStart(2, '0');
  setKey('univ-count', U.length);
  // 수능까지 남은 날 (한국 시간 기준 날짜 차이)
  const exam = Date.UTC(2027, 10, 18), today = new Date(), t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const left = Math.round((exam - t0) / 86400000);
  $('#dday').textContent = left > 0 ? `D-${left}` : left === 0 ? 'D-DAY' : '수능 종료';
  $('#schedule').innerHTML = plan.schedule.map((x) => `<li><b>${x.when}</b><span>${x.what}</span></li>`).join('');

  // 두 대학씩 한 쌍
  const pairs = [];
  for (let i = 0; i < U.length; i += 2) pairs.push(U.slice(i, i + 2));
  const engWord = (u) => (u.eng.scale.includes('감점') || u.ratio.some((r) => r.note.includes('감점')) ? '감점' : '가산');
  const ratioText = (r, u) => r.kor === null ? r.note
    : `${r.type ? r.type + '형 ' : ''}국 ${r.kor} · 수 ${r.math} · 영 ${r.eng ?? engWord(u)} · 탐 ${r.tam}`;
  const card = (u, n) => `<article class="uv-card">
      <span class="uv-no">${pad(n)} / ${U.length}</span>
      <div class="uv-head"><h4 class="uv-name">${u.univ}</h4>${u.logo ? `<img class="uv-logo-in" src="${u.logo}" alt="${u.univ} 로고" loading="lazy" decoding="async">` : ''}</div>
      <p class="uv-track">${u.track}</p>
      <dl class="uv-facts">
        <dt>모집</dt><dd>${u.group}</dd>
        <dt>전형 방법</dt><dd>${u.method}</dd>
        <dt>비율</dt><dd>${u.ratio.map((r) => ratioText(r, u)).join('<br>')}${u.ratio.some((r) => r.note && r.kor !== null) ? `<br><small>${u.ratio.map((r) => r.note).filter(Boolean).join(' / ')}</small>` : ''}${u.pick ? `<br><small>${u.pick}</small>` : ''}</dd>
        <dt>영어</dt><dd>${u.eng.g2 === null ? u.eng.scale : `2등급 ${u.eng.g2} → 4등급 ${u.eng.g4} (${u.eng.scale})`}</dd>
        <dt>한국사</dt><dd>${u.hist}</dd>
        <dt>출결</dt><dd>${u.att || '반영 안 함'}</dd>
        <dt>학과</dt><dd>${u.units}</dd>
        <dt>입결</dt><dd>${u.cut && u.cut.length ? u.cut.map((c) => `${c.unit}(${c.group}) <b>${c.c26}</b>${c.c25 !== null ? ` <small class="nw">2025 ${c.c25}</small>` : ''}`).join('<br>') + '<br><small>2026 70%컷, 국수탐 백분위</small>' : '학과별 자료 미확보'}</dd>
      </dl>
      <ul class="uv-memo">${u.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
      <p class="uv-me"><b>나에게</b> ${u.me}</p>
      ${u.planPdf ? `<div class="uv-plan">
        <span class="uv-plan-l">2028 ${u.planFile && u.planFile.includes('기본계획') ? '입학전형 기본계획' : '입학전형 시행계획'} 원본<small>PDF ${u.planMB}MB${u.page ? `, 정시 부분 ${u.page}쪽` : ''}</small></span>
        <span class="uv-plan-btns">
          <a class="pill" href="${u.planPdf}${u.page ? `#page=${u.page}` : ''}" target="_blank" rel="noopener">원본 보기</a>
          <a class="pill ghost" href="${u.planPdf}" download="${u.planFile}">내려받기</a>
        </span></div>` : '<p class="uv-src">시행계획 원본 미확보</p>'}
    </article>`;
  $('#univs').innerHTML = pairs.map((pr, i) => `<li class="uv-step${i ? '' : ' on'}">${pr.map((u, j) => card(u, i * 2 + j + 1)).join('')}</li>`).join('');
  // 배경: 쌍마다 두 대학 이름을 크게 흐리게 (사진·로고 파일이 있으면 첫 대학 것을 깔기)
  // 배경: 왼쪽은 첫 대학, 오른쪽은 둘째 대학 대표색 그라데이션 (휴대폰은 위·아래)
  $('#uv-layers').innerHTML = pairs.map((pr, i) => `<figure class="uv-bg${i ? '' : ' on'}" style="--c1:${pr[0].color || 'transparent'};--c2:${(pr[1] || pr[0]).color || 'transparent'}">
      <i class="uv-tint"></i>
      <span class="uv-mark">${pr.map((u) => `<span>${u.univ}</span>`).join('')}</span></figure>`).join('');
  $$('#uv-layers img, .uv-logo-in').forEach((img) => img.addEventListener('error', () => img.remove()));
  const steps = $$('.uv-step'), layers = $$('.uv-bg');
  const show = (i) => {
    steps.forEach((s, j) => s.classList.toggle('on', j === i));
    layers.forEach((l, j) => l.classList.toggle('on', j === i));
  };
  $('#not-csat').textContent = plan.notByCsat.join(', ');
  $('#unconfirmed').textContent = plan.unconfirmed.join(', ');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) show(steps.indexOf(e.target)); }),
    { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe(s));
}

// ---------- 02 반영 비율 ----------
function renderRatio(plan) {
  const seg = (cls, v, name) => (v ? `<span class="seg-s ${cls}" style="flex:${v}" title="${name} ${v}%">${v}</span>` : '');
  const rows = [];
  plan.univs.forEach((u) => u.ratio.forEach((r, k) => {
    if (r.kor === null) return;
    const name = `${k ? '' : u.univ}${r.type ? ` <small>${r.type}형</small>` : ''}`;
    const sub = k === u.ratio.length - 1 ? [u.ratio.length > 1 ? u.pick : '', r.eng === null ? (r.note.includes('감점') || u.eng.scale.includes('감점') ? '영어 감점' : '영어 가산') : '', r.note].filter(Boolean).join(', ') : '';
    rows.push(`<div class="stack-row${k ? ' alt' : ''}">
      <span class="stack-name">${name}</span>
      <span class="stack-track">${seg('kor', r.kor, '국어')}${seg('math', r.math, '수학')}${seg('eng', r.eng, '영어')}${seg('tam', r.tam, '탐구')}</span>
      ${sub ? `<span class="stack-sub">${sub}</span>` : ''}</div>`);
  }));
  $('#ratio-bars').innerHTML = rows.join('');
  $('#ratio-bars').setAttribute('aria-label', '대학별 수능 반영 비율. ' + plan.univs.map((u) =>
    `${u.univ} ${u.ratio.map((r) => r.kor === null ? r.note : `${r.type ? r.type + '형 ' : ''}국어 ${r.kor}, 수학 ${r.math}, 영어 ${r.eng ?? '감점·가산'}, 탐구 ${r.tam}`).join(' 또는 ')}`).join('. '));

  // 한국사 5등급 손해 (값이 있는 대학만, 큰 순)
  const H = plan.univs.filter((u) => typeof u.hist5 === 'number').sort((a, b) => a.hist5 - b.hist5);
  const lose = H.filter((u) => u.hist5 < 0).length;
  $('#hist-n').textContent = lose; $('#hist-u').textContent = `/${H.length}곳`;
  const max = Math.max(...H.map((u) => -u.hist5), 1);
  $('#hist-bars').innerHTML = H.map((u) => barRow(u.univ, u.hist5 === 0 ? 0 : u.hist5, -max, '', u.hist5 <= -5 ? 'bad' : '',
    u.hist5 === 0 ? u.hist : '')).join('');
  $('#hist-bars').setAttribute('aria-label', '한국사 5등급일 때 대학별 감점. ' + H.map((u) => `${u.univ} ${u.hist5}`).join(', '));
}

// ---------- 03 위치 ----------
function renderCutoffs(plan, now) {
  const lo = 70, hi = 100, x = (v) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
  const marks = `<i class="mk now" style="left:${x(now)}%"></i><i class="mk goal" style="left:${x(plan.target)}%"></i>`;
  $('#cutoffs').innerHTML = plan.cutoffs.map((c) => {
    const v = c.kind === 'range' ? c.hi : c.pct;
    const cls = c.kind === 'range' ? 'range' : v <= now ? 'reach' : v <= plan.target ? 'goal' : '';
    const val = c.kind === 'range' ? `${c.lo}~${c.hi}` : c.pct;
    return `<div class="cut-row">
      <span class="cut-name">${c.name}${c.basis ? ` <small>(${c.basis})</small>` : ''}</span>
      <span class="cut-track"><span class="bar-fill ${cls}" style="width:${x(v)}%"></span>${marks}</span>
      <span class="cut-val">${val}</span></div>`;
  }).join('');
  $('#cutoffs').setAttribute('aria-label', `2026 정시 70%컷과 내 위치. 지금 ${now}, 목표 ${plan.target}. ` +
    plan.cutoffs.map((c) => `${c.name} ${c.kind === 'range' ? `${c.lo}~${c.hi}` : c.pct}`).join(', '));
  $('#cut-note').textContent = `${plan.cutoffSource}. 2028은 5등급제·개편 수능 첫해라 대학 간 서열을 보는 용도로만 씁니다. 학과별 표를 못 구한 곳: ${plan.cutoffMissing.join(', ')}.`;
  $('#combos').innerHTML = '<tr><th>백분위</th><th>국어</th><th>수학</th><th>탐구</th><th>예시</th></tr>' +
    plan.combos.map((c) => `<tr><td>${c.pct}</td>${['kor', 'math', 'tam'].map((k) =>
      `<td class="num g${gradeLevel(c[k])}">${c[k]}</td>`).join('')}<td>${c.example}</td></tr>`).join('');
}

// ---------- 04 학평 5회 ----------
const SUBJ = [['kor', '국어'], ['math', '수학'], ['eng', '영어'], ['soc', '통합사회'], ['sci', '통합과학'], ['hist', '한국사']];

function roundBody(r) {
  if (r.pending) return '<p class="round-pending">결과가 나오면 채웁니다.</p>';
  const rows = SUBJ.map(([k, name]) => {
    const s = r[k];
    return `<tr><th scope="row">${name}</th><td class="num">${fmt(s.raw)}</td>
      <td class="num g${gradeLevel(s.grade)}">${s.grade}</td><td class="num">${s.pct ? (Number.isInteger(s.pct) ? s.pct : s.pct.toFixed(2)) : '-'}</td></tr>`;
  }).join('');
  return `<table class="round-table"><tr><th>과목</th><th>원점수</th><th>등급</th><th>백분위</th></tr>${rows}</table>
    <p class="round-avg">국수탐 평균 백분위 <b>${avgPct(r).toFixed(1)}</b></p>`;
}

function renderRounds(mocks) {
  const rs = mocks.rounds;
  let idx = rs.map((r) => !r.pending).lastIndexOf(true);
  const card = $('#round-card'), body = $('#round-body'), prev = $('#round-prev'), next = $('#round-next');
  const paint = () => {
    const r = rs[idx];
    $('#round-title').textContent = r.label;
    body.innerHTML = roundBody(r);
    prev.disabled = idx === 0; next.disabled = idx === rs.length - 1;
    prev.querySelector('.nav-label').textContent = idx > 0 ? rs[idx - 1].label : '';
    next.querySelector('.nav-label').textContent = idx < rs.length - 1 ? rs[idx + 1].label : '';
    prev.setAttribute('aria-label', idx > 0 ? `이전 회차 ${rs[idx - 1].label}` : '이전 회차 없음');
    next.setAttribute('aria-label', idx < rs.length - 1 ? `다음 회차 ${rs[idx + 1].label}` : '다음 회차 없음');
  };
  // 넘길 때: 사라짐 ease-in → 내용 교체 → 등장 ease-out (transform·opacity만)
  const go = (d) => {
    const n = clamp(idx + d, 0, rs.length - 1);
    if (n === idx) return;
    idx = n;
    if (reduce) return paint();
    body.classList.add('out');
    setTimeout(() => { paint(); body.classList.remove('out'); }, DUR);
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  card.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
  // 스와이프: 가로로 40px 넘게, 세로보다 크게 움직였을 때만
  let sx = null, sy = null;
  body.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  body.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    sx = null;
  });
  paint();

  // 등급표 (회차 열 순서로 채워짐)
  const head = '<tr><th scope="col">과목</th>' + rs.map((r, c) =>
    `<th scope="col" class="${c === rs.length - 1 ? 'latest' : ''}">${r.label}</th>`).join('') + '</tr>';
  const rows = SUBJ.map(([k, name]) => `<tr><th scope="row">${name}</th>${rs.map((r, c) => {
    const delay = `style="transition-delay:${c * STAGGER * 2}ms"`;
    const latest = c === rs.length - 1 ? ' latest' : '';
    return r.pending ? `<td class="hx${latest}" ${delay}>대기</td>` : `<td class="h${gradeLevel(r[k].grade)}${latest}" ${delay}>${r[k].grade}</td>`;
  }).join('')}</tr>`).join('');
  $('#grade-table').innerHTML = head + rows;

  // 평균 백분위 기둥 (목표 점선 포함)
  const lo = 50, hi = 100, y = (v) => ((v - lo) / (hi - lo)) * 100;
  const target = 89;
  $('#trend').style.setProperty('--goal', `${y(target)}%`);
  const lastDone = rs.map((r) => !r.pending).lastIndexOf(true);
  $('#trend').innerHTML = rs.map((r, i) => {
    const v = avgPct(r);
    return `<li class="step ${r.pending ? 'pending' : ''}${i === lastDone ? ' latest' : ''}" style="--v:${v === null ? 4 : y(v)}%">
      <span class="plot"><span class="col"></span><b class="val">${v === null ? "대기" : v.toFixed(1)}</b><i class="goal-line"></i></span>
      <span class="when">${r.label.replace(' ', '<br>')}</span></li>`;
  }).join('');
  $('#trend').setAttribute('aria-label', '국수탐 평균 백분위 추이. ' + rs.map((r) => `${r.label} ${fmt(avgPct(r))}`).join(', ') + `. 목표 ${target}`);
}

function renderSubjectPlan(plan) {
  $('#subject-plan').innerHTML = plan.subjectPlan.map((s) =>
    `<li><b>${s.subj}</b><span class="grade-move">${s.now} → ${s.goal}</span><span>${s.where}</span></li>`).join('');
}

// ---------- 05 순서 ----------
function renderOrder(plan) {
  $('#priority').innerHTML = plan.priority.map((p, i) =>
    `<li><span class="rank-no">${i + 1}</span><span class="rank-main"><b>${p.item}</b><span>${p.why}</span></span><span class="rank-eff">효과 ${p.effect}</span></li>`).join('');
  $('#winter').innerHTML = plan.winter.map((w) =>
    `<li class="${w.gap ? 'gap' : ''}"><b>${w.subj}</b><span class="track">지금: ${w.base}</span><span>더할 것: ${w.add}</span></li>`).join('');
}

// ---------- 06 영어 ----------
function renderEnglish(eng, plan) {
  const E = plan.univs.filter((u) => u.eng.g2 !== null).map((u) => ({ u, gap: Math.round((u.eng.g2 - u.eng.g4) * 10) / 10 }))
    .sort((a, b) => b.gap - a.gap);
  $('#weight-bars').innerHTML = E.map(({ u, gap }) => barRow(u.univ, gap, 15, '점', gap >= 10 ? 'bad' : '',
    `${u.eng.scale}${u.eng.scale === '감점' ? `: 2등급 ${u.eng.g2}, 4등급 ${u.eng.g4}` : `: 2등급 ${u.eng.g2} → 4등급 ${u.eng.g4}`}`)).join('');
  $('#weight-other').textContent = '대학마다 만점이 달라(100·150·200점, 감점·가산) 막대는 잃는 점수 그 자체입니다. 성균관대·중앙대는 환산표가 모집요강(2027.9)에서 공개됩니다.';

  $('#type-bars').innerHTML = eng.types
    .map((t) => { const r = rate(t); return barRow(`${t.name} ${t.from}~${t.to}번`, r, 100, '%', r >= 60 ? 'bad' : r >= 35 ? 'warn' : ''); })
    .join('');

  // 히트맵: 회차(열) 순서로 채워지고, 마지막 회차 열은 한 박자 늦게 강조
  const lastCol = eng.rounds.length - 1;
  const colDelay = (c) => c * STAGGER * 2 + (c === lastCol ? 160 : 0);
  const cell = (c, cls, txt) => `<td class="${cls}${c === lastCol ? ' latest' : ''}" style="transition-delay:${colDelay(c)}ms">${txt}</td>`;
  const head = '<tr><th scope="col">유형</th>' + eng.rounds.map((r, c) =>
    `<th scope="col" class="${c === lastCol ? 'latest' : ''}">${r.label}</th>`).join('') + '<th scope="col">누적</th></tr>';
  const rows = eng.types.map((t) => {
    const n = t.to - t.from + 1;
    const cells = t.wrong.map((v, c) => (v === null ? cell(c, 'hx', '대기') : cell(c, `h${level((v / n) * 100)}`, `${v}/${n}`))).join('');
    const r = rate(t);
    return `<tr><th scope="row"><b>${t.name}</b> ${t.from}~${t.to}번</th>${cells}${cell(lastCol + 1, `h${level(r)}`, `${r}%`)}</tr>`;
  }).join('');
  const scores = '<tr><th scope="row"><b>원점수</b> (등급)</th>' + eng.rounds.map((r, c) =>
    cell(c, 'hs', r.raw === null ? '대기' : `${r.raw} (${r.grade})`)).join('') + cell(lastCol + 1, 'hs', '') + '</tr>';
  $('#heat').innerHTML = head + rows + scores;

  const lv = {};
  eng.types.forEach((t) => { for (let k = t.from; k <= t.to; k++) lv[k] = level(rate(t)); });
  const blank = eng.types.find((t) => t.name === '빈칸');
  $('#grid45').innerHTML = Array.from({ length: 45 }, (_, i) => i + 1)
    .map((k) => `<div class="cell h${lv[k]}${eng.repeatMisses.items.includes(k) ? ' repeat' : ''}${k >= blank.from && k <= blank.to ? ' zoom' : ''}">${k}</div>`).join('');
}

// ---------- 등장 ----------
function countUp(el, delay = 0) {
  const end = Number(el.dataset.count), d = Number(el.dataset.decimals || 0);
  if (reduce || !end) return;
  el.textContent = (0).toFixed(d);
  const dur = 600;
  setTimeout(() => {
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = (end * (1 - Math.pow(1 - p, 3))).toFixed(d);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

function observe() {
  const groups = {
    '.bars': '.bar-fill', '.grid45': '.cell', '.mets': 'li', '.checks': 'li', '.rows': 'li', '.rank': 'li',
    '.stack': '.stack-row', '.cutoffs': '.cut-row', '.trend': '.col', '.findings': 'li',
  };
  Object.entries(groups).forEach(([g, child]) => $$(g).forEach((box) => {
    const kids = $$(child, box);
    stagger(kids);
    // 강조(세로선, 빨간 테두리, 31~34 확대)는 형제가 다 나온 뒤에 켜지게
    box.style.setProperty('--after', `${kids.length * STAGGER + 120}ms`);
  }));
  $$('.trend .step').forEach((s, i) => (s.style.transitionDelay = `${i * STAGGER}ms`));
  // 누적 막대: 한 줄 안에서 국어 → 탐구 순서로 차오름
  $$('.stack-row').forEach((row, i) => $$('.seg-s', row).forEach((s, j) => (s.style.transitionDelay = `${i * STAGGER + j * STAGGER}ms`)));

  const targets = $$('[data-reveal], .bars, .grid45, .heat, .mets, .checks, .rows, .rank, .stack, .cutoffs, .trend, .findings, .gauge');
  if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
  // 화면에 들어오면 등장, 다시 화면 아래로 내려가면(위로 스크롤) 처음 상태로 되돌림
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const el = e.target;
      if (e.isIntersecting) {
        if (el.classList.contains('is-in')) return;
        el.classList.add('is-in');
        $$('[data-count]', el).forEach((c, i) => countUp(c, i * STAGGER));
      } else if (e.boundingClientRect.top > 0) {
        el.classList.remove('is-in');
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => io.observe(el));

  // 빠르게 넘기면 관찰 프레임 사이에 요소를 건너뛸 수 있어, 이미 지나친 요소는 바로 보이게
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      targets.forEach((el) => {
        if (!el.classList.contains('is-in') && el.getBoundingClientRect().bottom < 0) el.classList.add('is-in');
      });
      ticking = false;
    });
  }, { passive: true });
}

// 유리 카드의 얕은 3D: 마우스(정밀 포인터)에서만, 최대 2도. 터치·움직임 줄이기에서는 꺼짐
function tilt() {
  if (reduce || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  $$('.uv-card, .round, .mets').forEach((el) => {
    el.classList.add('tilt');
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--ry', `${(x * 4).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`);
        el.classList.add('lift');
      });
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.classList.remove('lift'); });
  });
}

// claude.ai Artifact 안에서는 일반 다운로드 링크가 막혀 있어, downloads 기능으로 PDF를 건넨다.
// 일반 브라우저(사이트·한 파일 버전)에서는 window.claude가 없으므로 링크가 그대로 동작한다
async function wirePdf() {
  const btn = $('.btn'), msg = $('#pdf-msg');
  if (!btn || !window.__PDF__ || !window.claude?.use) return;
  const say = (t) => { if (msg) msg.textContent = t; };
  const downloads = await window.claude.use('downloads');
  if (!downloads) { btn.hidden = true; say('이 화면에서는 PDF를 내려받을 수 없습니다. 브리핑 PDF는 따로 보내 드릴게요.'); return; }
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const bin = Uint8Array.from(atob(window.__PDF__), (c) => c.charCodeAt(0));
    try {
      await downloads.save({ filename: btn.getAttribute('download') || 'briefing.pdf', data: new Blob([bin]) });
      say('');
    } catch (err) {
      if (err?.code === 'declined') say('');
      else if (err?.code === 'rate_limited') say('저장 창이 이미 열려 있습니다. 그 창에서 저장해 주세요.');
      else say('PDF를 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.');
    }
  });
}

// 한 파일로 묶은 버전(tools/build_single.py)은 window.__DATA__에 json이 들어 있어 fetch 없이 연다
const load = (u) => (window.__DATA__ && window.__DATA__[u]
  ? Promise.resolve(window.__DATA__[u])
  : fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }));
Promise.all(['data/english.json', 'data/plan.json', 'data/mocks.json'].map(load))
  .then(([eng, plan, mocks]) => {
    renderHero(mocks, eng, plan);
    const done = mocks.rounds.filter((r) => !r.pending);
    const now = Math.round(avgPct(done[done.length - 1]) * 10) / 10;
    renderCsat(plan); renderRatio(plan); renderCutoffs(plan, now);
    renderRounds(mocks); renderSubjectPlan(plan); renderOrder(plan);
    renderEnglish(eng, plan);
    observe(); heroFlight(); wirePdf(); tilt();
  })
  .catch((err) => {
    console.error(err);
    document.documentElement.classList.remove('js'); // 데이터 실패 시 애니메이션 없이 정적 내용이라도 보이게
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      '<p class="note">데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요 (npx serve .).</p>');
  });
