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
  $('#univs').innerHTML = plan.univs.map((u) =>
    `<li><b>${u.univ}</b><span class="track">${u.track}</span><span>${u.note}</span></li>`).join('');
  $('#not-csat').textContent = plan.notByCsat.join(', ');
  $('#unconfirmed').textContent = plan.unconfirmed.join(', ');
}

// ---------- 02 반영 비율 ----------
function renderRatio(plan) {
  const seg = (cls, v, name) => (v ? `<span class="seg-s ${cls}" style="flex:${v}" title="${name} ${v}%">${v}</span>` : '');
  $('#ratio-bars').innerHTML = plan.ratio.map((r) => `<div class="stack-row">
      <span class="stack-name">${r.univ}</span>
      <span class="stack-track">${seg('kor', r.kor, '국어')}${seg('math', r.math, '수학')}${seg('eng', r.eng, '영어')}${seg('tam', r.tam, '탐구')}</span>
      ${r.engNote || r.extra ? `<span class="stack-sub">${[r.engNote, r.extra].filter(Boolean).join(', ')}</span>` : ''}
    </div>`).join('');
  $('#ratio-bars').setAttribute('aria-label', '대학별 수능 반영 비율. ' + plan.ratio.map((r) =>
    `${r.univ} 국어 ${r.kor}, 수학 ${r.math}, 영어 ${r.eng ?? r.engNote}, 탐구 ${r.tam}`).join('. '));
  const groups = {};
  plan.histRule.forEach((h) => (groups[h.hist] = [...(groups[h.hist] || []), h.univ]));
  $('#hist-rule').innerHTML = '<tr><th>한국사 반영</th><th>대학</th></tr>' +
    Object.entries(groups).map(([rule, us]) => `<tr><td>${rule}</td><td>${us.join(', ')}</td></tr>`).join('');
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
      <td class="num g${gradeLevel(s.grade)}">${s.grade}</td><td class="num">${s.pct ? fmt(s.pct, 2) : '-'}</td></tr>`;
  }).join('');
  return `<table class="round-table"><tr><th>과목</th><th>원점수</th><th>등급</th><th>백분위</th></tr>${rows}</table>
    <p class="round-avg">국수탐 평균 백분위 <b>${fmt(avgPct(r))}</b></p>`;
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
      <span class="plot"><span class="col"></span><b class="val">${fmt(v)}</b><i class="goal-line"></i></span>
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
  $('#weight-bars').innerHTML = plan.englishWeight
    .map((u) => barRow(u.univ, u.weight, 25, '%', '',
      u.g2 !== null ? `4등급이면 ${u.g2 - u.g4}점 손해 (${u.g2} → ${u.g4}${u.scale.startsWith('100') ? ', 100점 만점' : ''})` : u.scale))
    .join('');
  $('#weight-other').textContent = plan.englishOther
    .map((o) => `${o.univ}는 ${o.type}입니다 (2등급 ${o.g2}, 4등급 ${o.g4}).`).join(' ');

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
    observe(); heroFlight(); wirePdf();
  })
  .catch((err) => {
    console.error(err);
    document.documentElement.classList.remove('js'); // 데이터 실패 시 애니메이션 없이 정적 내용이라도 보이게
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      '<p class="note">데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요 (npx serve .).</p>');
  });
