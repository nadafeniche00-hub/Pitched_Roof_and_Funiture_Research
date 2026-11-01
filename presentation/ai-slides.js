/* ---------- the three AI helper slides: animations built from the real test results (a typed sentence, a drawn sketch, a drawn roof) */
const AIV = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, a = {}, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ICON = {
    chat: 'M4 5h16v11H9l-5 4z', clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2', question: 'M9 9a3 3 0 1 1 4.5 2.6C12.5 12.2 12 13 12 14M12 18h.01',
    gabled: 'M3 19V11l9-6 9 6v8zM3 11h18', hipped: 'M3 19l4-11h10l4 11zM7 8l5 4 5-4', 'half-hipped': 'M3 19v-6l3-2 2-5h8l2 5 3 2v6zM6 11h12', mansard: 'M3 19v-5l3-5 6-3 6 3 3 5v5zM6 9h12',
    pyramidal: 'M3 19L12 5l9 14zM12 5v14M3 19l9-4 9 4', skillion: 'M3 19V8l18 6v5z', flat: 'M3 9h18v10H3zM3 9l3-3h12l3 3',
  };
  const ico = (n, size = 40, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n]}"/></svg>`;
  const COL = { bedroom: '#2b63a8', living: '#8a3d86', kitchen: '#b0743a', study: '#2f7d4f', bath: '#1d7c8f' };
  const LBL = { bedroom: 'Bedroom', living: 'Living', kitchen: 'Kitchen', study: 'Study', bath: 'Bath' };
  const appear = (e, ms = 500) => { e.style.transition = `opacity ${ms}ms, transform ${ms + 150}ms cubic-bezier(.2,.9,.25,1.4)`; e.style.opacity = 1; e.style.transform = 'none'; };
  const hide0 = (e, tf = 'scale(.2)') => { e.style.transition = 'none'; e.style.opacity = 0; e.style.transform = tf; };
  const cnt = (el, to, ms, f = (v) => Math.round(v).toString()) => { const t0 = performance.now(); (function s() { const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = f(to * e); if (k < 1) setTimeout(s, 30); })(); };

  /** a mascot as SVG shapes in a 220 x 220 box (Reader: glasses, Looker: monocle, Glancer: lightning) */
  function mascot(kind) {
    const col = { reader: '#ffc533', looker: '#5fa8e0', glancer: '#ff4d2e' }[kind];
    const acc = {
      reader: '<g fill="none" stroke="#14161c" stroke-width="6"><circle cx="80" cy="108" r="27"/><circle cx="140" cy="108" r="27"/><path d="M107 108h6"/></g>',
      looker: '<g fill="none" stroke="#14161c" stroke-width="6"><circle cx="140" cy="108" r="36"/><path d="M168 132q22 30 4 62"/></g>',
      glancer: '<path d="M122 2L88 54h24l-12 40 44-56h-26z" fill="#ffc533" stroke="#14161c" stroke-width="5" stroke-linejoin="round"/><g stroke="#14161c" stroke-width="6" stroke-linecap="round"><path d="M14 112h24M6 138h28M16 164h24"/></g>',
    }[kind];
    return `<ellipse cx="110" cy="206" rx="62" ry="9" fill="#000" opacity=".25"/><circle cx="110" cy="118" r="84" fill="${col}" stroke="#14161c" stroke-width="6"/><ellipse class="aieye" cx="80" cy="108" rx="17" ry="21" fill="#fff"/><ellipse class="aieye" cx="140" cy="108" rx="17" ry="21" fill="#fff"/><circle class="aipupil" cx="84" cy="112" r="8" fill="#14161c"/><circle class="aipupil" cx="144" cy="112" r="8" fill="#14161c"/><path d="M82 152q28 26 56 0" fill="none" stroke="#14161c" stroke-width="6" stroke-linecap="round"/>${acc}`;
  }

  let RUN = 0;
  const PLAY = {};

  // ---- 1: three helpers, each takes one kind of input and returns one kind of answer
  PLAY.ai1 = async (w) => {
    const svg = $('#ai1svg'); svg.innerHTML = '';
    const cols = [{ x: 350, kind: 'reader', c: '#ffc533', inp: 'WORDS', out: 'ROOMS', name: 'Reader', sub: 'reads words' }, { x: 960, kind: 'looker', c: '#5fa8e0', inp: 'SKETCH', out: 'A PLAN', name: 'Looker', sub: 'reads sketches' }, { x: 1570, kind: 'glancer', c: '#ff4d2e', inp: 'PHOTO', out: 'ROOF TYPE', name: 'Glancer', sub: 'names roofs' }];
    const packet = (d, color, begin) => { const c = S('circle', { r: 13, fill: color, stroke: '#14161c', 'stroke-width': 4 }, svg); S('animateMotion', { dur: '1.5s', begin: begin + 's', repeatCount: 'indefinite', path: d }, c); };
    for (const k of cols) {
      const x = k.x;
      // input card
      const inp = S('g', { class: 'aisv' }, svg); hide0(inp, 'translateY(-40px) scale(.9)');
      S('rect', { x: x - 195, y: 18, width: 400, height: 150, fill: k.c }, inp);
      S('rect', { x: x - 205, y: 8, width: 400, height: 150, fill: '#fff', stroke: '#14161c', 'stroke-width': 5 }, inp);
      const t = S('text', { x: x - 180, y: 138, 'font-size': 34, 'font-weight': 900, fill: '#14161c' }, inp); t.textContent = k.inp;
      if (k.kind === 'reader') S('path', { d: `M${x - 20} 45h170M${x - 20} 78h140M${x - 20} 111h95`, stroke: '#14161c', 'stroke-width': 11, 'stroke-linecap': 'round', opacity: .8 }, inp);
      if (k.kind === 'looker') S('path', { d: `M${x + 15} 28h150v100h-150zM${x + 90} 28v100M${x + 15} 85h75`, fill: 'none', stroke: '#14161c', 'stroke-width': 6 }, inp);
      if (k.kind === 'glancer') { S('rect', { x: x + 5, y: 28, width: 165, height: 100, fill: '#bcd9ee', stroke: '#14161c', 'stroke-width': 5 }, inp); S('path', { d: `M${x + 25} 118l62-62 62 62z`, fill: '#a4503a', stroke: '#14161c', 'stroke-width': 5, 'stroke-linejoin': 'round' }, inp); }
      // helper
      const m = S('g', { class: 'aisv' }, svg); hide0(m, 'scale(.3)');
      const bob = S('g', { class: 'aibob', style: `animation-delay:${-cols.indexOf(k)}s` }, m);
      const inner = S('g', { transform: `translate(${x - 125} 215) scale(1.136)` }, bob); inner.innerHTML = mascot(k.kind);
      const nm = S('text', { x, y: 508, 'text-anchor': 'middle', 'font-size': 48, 'font-weight': 900, fill: '#fff' }, svg); nm.textContent = k.name; nm.style.opacity = 0; nm.style.transition = 'opacity .5s';
      const sb = S('text', { x, y: 546, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700, fill: '#9aa1ab' }, svg); sb.textContent = k.sub; sb.style.opacity = 0; sb.style.transition = 'opacity .5s';
      // output card
      const out = S('g', { class: 'aisv' }, svg); hide0(out, 'translateY(40px) scale(.9)');
      S('rect', { x: x - 195, y: 628, width: 400, height: 160, fill: k.c }, out);
      S('rect', { x: x - 205, y: 618, width: 400, height: 160, fill: '#fff', stroke: '#14161c', 'stroke-width': 5 }, out);
      const o = S('text', { x: x - 180, y: 762, 'font-size': 30, 'font-weight': 900, fill: '#14161c' }, out); o.textContent = k.out;
      if (k.kind === 'reader') { for (const [cx, cy, r, c] of [[x - 120, 676, 28, '#2b63a8'], [x - 55, 716, 22, '#1d7c8f'], [x + 25, 674, 30, '#2f7d4f'], [x + 110, 716, 26, '#b0743a']]) S('circle', { cx, cy, r, fill: c, stroke: '#14161c', 'stroke-width': 4 }, out); S('path', { d: `M${x - 98} 690L${x - 74} 706M${x - 36} 706L${x - 8} 690`, stroke: '#14161c', 'stroke-width': 4, 'stroke-dasharray': '6 5' }, out); }
      if (k.kind === 'looker') for (const [rx, ry, rw, rh, c] of [[x - 30, 636, 90, 60, '#2b63a8'], [x + 60, 636, 90, 48, '#8a3d86'], [x - 30, 696, 90, 44, '#1d7c8f'], [x + 60, 684, 90, 56, '#b0743a']]) S('rect', { x: rx, y: ry, width: rw, height: rh, fill: c, stroke: '#14161c', 'stroke-width': 4 }, out);
      if (k.kind === 'glancer') { const ic = S('path', { d: ICON.hipped, transform: `translate(${x + 20} 626) scale(5.6)`, fill: 'none', stroke: '#14161c', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, out); const h = S('text', { x: x + 10, y: 756, 'font-size': 34, 'font-weight': 900, fill: '#ff4d2e' }, out); h.textContent = 'Hipped'; }
      await w(250); appear(inp, 600);
      await w(500);
      S('path', { d: `M${x} 158V228`, stroke: '#fff', 'stroke-width': 4, 'stroke-dasharray': '3 14', 'stroke-linecap': 'round', fill: 'none' }, svg); packet(`M${x} 158V232`, k.c, 0);
      await w(700); appear(m, 700); nm.style.opacity = 1; sb.style.opacity = 1;
      await w(500);
      S('path', { d: `M${x} 560V628`, stroke: '#fff', 'stroke-width': 4, 'stroke-dasharray': '3 14', 'stroke-linecap': 'round', fill: 'none' }, svg); packet(`M${x} 560V634`, '#fff', 0.6);
      await w(700); appear(out, 600);
      await w(500);
    }
  };

  // ---- 2: the Reader and the Looker side by side
  const READER = { sentence: 'Two bedrooms, a bathroom next to the bedrooms, a study of 6 m² and an open kitchen with the living room', rooms: [
    { id: 'bed1', type: 'bedroom', area: 12, x: 120, y: 110 }, { id: 'bed2', type: 'bedroom', area: 12, x: 120, y: 340 }, { id: 'bath', type: 'bath', area: 5, x: 330, y: 225 },
    { id: 'study', type: 'study', area: 6, x: 330, y: 415 }, { id: 'kit', type: 'kitchen', area: 9, x: 560, y: 100 }, { id: 'liv', type: 'living', area: 18, x: 640, y: 330 }], links: [['bath', 'bed1'], ['bath', 'bed2'], ['kit', 'liv']] };
  const LOOKED = [{ type: 'bedroom', x: 0, y: 0, w: 4, d: 3.3 }, { type: 'living', x: 4, y: 0, w: 4, d: 2.5 }, { type: 'bath', x: 0, y: 3.3, w: 4, d: 2.7 }, { type: 'kitchen', x: 4, y: 2.5, w: 4, d: 3.5 }];
  PLAY.ai2 = async (w) => {
    const txt = $('#ai2txt'), dots = $('#ai2dots'), bub = $('#ai2bub'), plan = $('#ai2plan'), scan = $('#ai2scan'), hls = [...document.querySelectorAll('#ai2img .ai2hl')], chips = $('#ai2chips'), rb = $('#ai2rb');
    txt.textContent = ''; dots.style.opacity = 0; bub.innerHTML = ''; plan.innerHTML = ''; chips.style.opacity = 0; rb.style.opacity = 0;
    hls.forEach((h) => { h.style.transition = 'none'; h.style.background = 'transparent'; h.style.outline = 'none'; }); scan.style.transition = 'none'; scan.style.top = '0'; scan.style.opacity = 0;
    const reader = async () => {
      const linkG = S('g', {}, bub), bubG = S('g', {}, bub), by = {};
      await w(600);
      for (let i = 1; i <= READER.sentence.length; i++) { txt.textContent = READER.sentence.slice(0, i); await w(22); }
      await w(250); dots.style.opacity = 1; await w(1100); dots.style.opacity = 0;
      for (const r of READER.rooms) {
        by[r.id] = r; const g = S('g', { class: 'aisv' }, bubG); hide0(g, 'scale(.1)'); const rad = 14.5 * Math.sqrt(r.area);
        S('circle', { cx: r.x, cy: r.y + 7, r: rad, fill: '#14161c' }, g); S('circle', { cx: r.x, cy: r.y, r: rad, fill: COL[r.type], stroke: '#14161c', 'stroke-width': 4 }, g);
        const t = S('text', { x: r.x, y: r.y - 1, 'text-anchor': 'middle', 'font-size': Math.max(18, rad * 0.38), 'font-weight': 900, fill: '#fff' }, g); t.textContent = LBL[r.type];
        const a = S('text', { x: r.x, y: r.y + Math.max(18, rad * 0.4), 'text-anchor': 'middle', 'font-size': Math.max(16, rad * 0.32), 'font-weight': 700, fill: '#fff' }, g); a.textContent = r.area + ' m²';
        appear(g, 420); await w(330);
      }
      for (const [a, b] of READER.links) { const l = S('line', { x1: by[a].x, y1: by[a].y, x2: by[b].x, y2: by[b].y, stroke: '#14161c', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-dasharray': '16 12' }, linkG); l.style.opacity = 0; l.style.transition = 'opacity .5s'; l.style.opacity = 1; await w(350); }
      rb.style.opacity = 1;
    };
    const looker = async () => {
      const K = 52, ox = 210, oy = 20, rects = [];
      for (const r of LOOKED) {
        const g = S('g', { class: 'aisv' }, plan); hide0(g, 'scale(.8)');
        S('rect', { x: ox + r.x * K, y: oy + r.y * K, width: r.w * K, height: r.d * K, fill: COL[r.type], stroke: '#14161c', 'stroke-width': 6 }, g);
        const t = S('text', { x: ox + (r.x + r.w / 2) * K, y: oy + (r.y + r.d / 2) * K - 2, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 900, fill: '#fff' }, g); t.textContent = LBL[r.type];
        const s = S('text', { x: ox + (r.x + r.w / 2) * K, y: oy + (r.y + r.d / 2) * K + 28, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#fff' }, g); s.textContent = `${r.w.toFixed(1)} × ${r.d.toFixed(1)} m`;
        rects.push(g);
      }
      const dim = S('g', { class: 'aisv' }, plan); hide0(dim, 'translateY(14px)');
      S('path', { d: `M${ox} ${oy + 6 * K + 28}h${8 * K}M${ox} ${oy + 6 * K + 18}v20M${ox + 8 * K} ${oy + 6 * K + 18}v20`, stroke: '#14161c', 'stroke-width': 3, fill: 'none' }, dim);
      const dt = S('text', { x: ox + 4 * K, y: oy + 6 * K + 64, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 800, fill: '#14161c' }, dim); dt.textContent = '8.0 m';
      await w(1500);
      scan.style.opacity = 1; scan.style.transition = 'top 2s linear'; scan.style.top = 'calc(100% - 12px)'; await w(2100); scan.style.opacity = 0;
      for (let i = 0; i < 4; i++) { const h = hls[i]; h.style.transition = 'background .3s, outline .3s'; h.style.background = COL[LOOKED[i].type] + '88'; h.style.outline = '5px solid ' + COL[LOOKED[i].type]; appear(rects[i], 450); await w(650); }
      appear(dim, 450); chips.style.opacity = 1;
    };
    await Promise.all([reader(), looker()]);
  };

  // ---- 3: the Glancer flips through the catalogue; the race against the thinker
  const ROOFS = ['gabled', 'hipped', 'half-hipped', 'mansard', 'pyramidal', 'skillion', 'flat'], RN = { gabled: 'Gabled', hipped: 'Hipped', 'half-hipped': 'Half-hip', mansard: 'Mansard', pyramidal: 'Pyramid', skillion: 'Shed', flat: 'Flat' };
  PLAY.ai3 = async (w) => {
    const icons = $('#ai3icons'), flash = $('#ai3flash'), win = $('#ai3win'), lanes = $('#ai3lanes'), big = $('#ai3big');
    win.style.opacity = 0; big.style.opacity = 0; big.style.transform = 'scale(.6)'; flash.style.transition = 'none'; flash.style.opacity = 0;
    icons.innerHTML = ROOFS.map((r) => `<div style="width:106px; text-align:center; opacity:.35; transition:all .15s">${ico(r, 70, 1.8)}<div style="font-weight:800; font-size:19px; margin-top:2px">${RN[r]}</div></div>`).join('');
    lanes.innerHTML = [['The Thinker', 'a chat model studies the photo', '#ffc533'], ['The Glancer', 'CLIP flips through a catalogue', '#ff4d2e']].map(([n, s, c]) => `
      <div style="margin-bottom:46px"><div style="display:flex; align-items:baseline; gap:18px"><span style="font-weight:900; font-size:50px">${n}</span><span style="font-weight:700; font-size:26px; color:#9aa1ab">${s}</span></div>
        <div style="display:flex; align-items:center; gap:24px; margin-top:12px"><div style="flex:1; height:62px; background:rgba(255,255,255,.12); border:4px solid #fff"><div class="bar" style="height:100%; width:0; background:${c}"></div></div><div class="t" style="width:250px; font-weight:900; font-size:54px; font-variant-numeric:tabular-nums">0 s</div></div></div>`).join('');
    const bars = [...lanes.querySelectorAll('.bar')], ts = [...lanes.querySelectorAll('.t')];
    await w(600); flash.style.opacity = 1; await w(60); flash.style.transition = 'opacity .7s'; flash.style.opacity = 0; await w(300);
    const els = [...icons.children];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]) { els.forEach((e, k) => { e.style.opacity = k === i ? 1 : .35; e.style.transform = k === i ? 'translateY(-12px) scale(1.15)' : 'none'; }); await w(90); }
    els.forEach((e, k) => { const hit = ROOFS[k] === 'hipped'; e.style.opacity = hit ? 1 : .25; e.style.transform = hit ? 'translateY(-14px) scale(1.25)' : 'none'; if (hit) e.style.filter = 'drop-shadow(0 0 14px #ffc533)'; });
    await w(400); win.style.opacity = 1; await w(500);
    // the race: the Glancer is done at once, the Thinker takes 66 s (shown at 8x speed)
    const t0 = performance.now(); let done = false;
    bars[1].style.transition = 'width .35s ease-out'; bars[1].style.width = '100%'; ts[1].textContent = '0.07 s ✓'; ts[1].style.color = '#5fd38d';
    const tick = () => { if (done || !$('#ai3.on')) return; const el = Math.min(65.8, ((performance.now() - t0) / 1000) * 8); bars[0].style.transition = 'none'; bars[0].style.width = (el / 65.8 * 100) + '%'; ts[0].textContent = el.toFixed(0) + ' s'; if (el >= 65.8) { done = true; ts[0].textContent = '66 s ✓'; ts[0].style.color = '#5fd38d'; return; } setTimeout(tick, 40); };
    tick();
    await w(8800); big.style.opacity = 1; big.style.transform = 'none';
  };

  const play = async (id) => { const my = ++RUN, w = async (ms) => { await sleep(ms); if (my !== RUN) throw 0; }; try { await PLAY[id](w); } catch (e) { if (e !== 0) console.error(e); } };
  return { play, stop() { RUN++; }, has: (id) => !!PLAY[id] };
})();
