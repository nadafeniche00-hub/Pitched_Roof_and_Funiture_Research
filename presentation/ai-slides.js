/* ---------- the two AI helper slides: animations built from the real test results (a typed sentence, a drawn sketch, a drawn roof) */
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

  let RUN = 0;
  const PLAY = {};

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
