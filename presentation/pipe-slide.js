/* ---------- slide 9d: how a plan is made. Every number and drawing is the app's own: presentation/data/make_plan_sample.mjs runs generatePlans and techPrimitives and writes PLAN */
const PIPE = (() => {
  const root = $('#s9d');
  if (!root) return { start() {}, stop() {} };
  const PLAN = {{PLAN}}, LOOP = 21;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), seg = (t, a, b) => clamp((t - a) / (b - a)), E = (u) => u * u * (3 - 2 * u);
  const COL = { bedroom: '#ff6a47', child: '#ffb36b', living: '#ffc533', kitchen: '#f6e27a', study: '#9bd0a8', bath: '#7fb6d9', wc: '#a9c4e8', storage: '#b9b4c8', hall: '#8d95a3' };
  const LBL = { bedroom: 'BED', child: 'KID', living: 'LIVING', kitchen: 'KITCHEN', study: 'STUDY', bath: 'BATH', wc: 'WC', storage: 'STORE', hall: 'HALL' };
  const INK = '#0b0d10', PAPER = '#f3efe6', MONO = 'Consolas, "Cascadia Mono", "Courier New", monospace';
  const txt = (parent, s, attrs) => { const t = el('text', attrs, parent); t.textContent = s; return t; };

  /* ---- 1 Names: the sentence is typed, the rooms and the links come out of it */
  const SENT = [['p1a', '2 bedrooms'], ['p1s1', ', '], ['p1b', 'a bath next to them'], ['p1s2', ', '], ['p1c', 'a study of 6 m²']];
  const TOTAL = SENT.reduce((n, [, s]) => n + s.length, 0), spans = SENT.map(([id]) => $('#' + id)), caret = $('#p1caret'), json1 = $('#p1json');
  const T1 = [0.3, 2.9], tChar = (k) => T1[0] + (k / TOTAL) * (T1[1] - T1[0]);
  const s1 = $('#p1svg'), CH = [['bedroom', 12], ['bedroom', 12], ['bath', 5], ['study', 6]], CHK = [10, 10, 31, 48];
  const chips1 = CH.map(([ty, a], i) => {
    const g = el('g', { opacity: 0 }, s1);
    el('rect', { width: 126, height: 62, fill: COL[ty], stroke: '#fff', 'stroke-width': 3 }, g);
    txt(g, ty.toUpperCase(), { x: 63, y: 24, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: INK, 'letter-spacing': 1 });
    txt(g, a + ' m²', { x: 63, y: 52, 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 900, fill: INK });
    g.dataset.x = 12 + i * 134;
    return g;
  });
  const arcs = [[343, 75, 0], [343, 209, 20]].map(([x0, x1, up]) => el('path', { d: `M${x0} 35 C${x0} ${up - 6} ${x1} ${up - 6} ${x1} 35`, fill: 'none', stroke: '#7fb6d9', 'stroke-width': 4, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, s1));
  const near = txt(s1, 'bath near both', { x: 546, y: 24, 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: '#7fb6d9', opacity: 0 });
  function p1(t) {
    let left = Math.floor(seg(t, T1[0], T1[1]) * TOTAL + 1e-6);
    SENT.forEach(([, s], i) => { const k = Math.min(left, s.length); left -= k; const v = s.slice(0, k); if (spans[i].textContent !== v) spans[i].textContent = v; });
    caret.style.opacity = t > T1[0] && t < T1[1] + 0.9 ? 1 : 0;
    chips1.forEach((g, i) => { const s = E(seg(t, tChar(CHK[i]), tChar(CHK[i]) + 0.4)); g.setAttribute('transform', `translate(${g.dataset.x} ${38 + (1 - s) * 16})`); g.setAttribute('opacity', s); });
    const a = seg(t, tChar(31) + 0.3, tChar(31) + 1.1);
    arcs.forEach((p, i) => p.setAttribute('stroke-dashoffset', 1 - E(clamp(a * 1.5 - i * 0.3))));
    near.setAttribute('opacity', E(seg(a, 0.7, 1)));
    json1.style.opacity = E(seg(t, tChar(48) + 0.2, tChar(48) + 0.8));
  }

  /* ---- 2 Reads: a scan line goes over the sketch, the rectangles light up, the JSON follows */
  const hls = [...root.querySelectorAll('#p2 .p2hl')], scan = $('#p2scan'), jl = [...root.querySelectorAll('#p2json span')];
  function p2(t) {
    const a = seg(t, 0.5, 2.2);
    scan.style.opacity = a > 0 && a < 1 ? 1 : 0; scan.style.top = a * 208 + 'px';
    hls.forEach((h, i) => { h.style.opacity = E(seg(t, 1.2 + i * 0.4, 1.7 + i * 0.4)); });
    jl.forEach((l, i) => { l.style.opacity = E(seg(t, 1.2 + i * 0.3, 1.5 + i * 0.3)); });
  }

  /* ---- 3 Segments: the five steps of notebook 01 on its own synthetic plan, one wipe after the other */
  const NB = { rooms: [[0, 0, 4.5, 3.6], [4.5, 0, 4.5, 3.6], [0, 3.6, 3.6, 3.4], [3.6, 3.6, 2.0, 3.4], [5.6, 3.6, 3.4, 3.4]], doors: [['v', 4.5, 1.4], ['h', 3.6, 1.2], ['h', 3.6, 4.7], ['v', 5.6, 4.8], ['h', 3.6, 7.0]] };
  const s3 = $('#p3svg'), WK = 24, OFX = 18, OFY = 14, RC = ['#ff6a47', '#ffc533', '#7fb6d9', '#9bd0a8', '#c58cff'];
  const defs3 = el('defs', {}, s3), clips = [];
  const lines = (g, attrs) => NB.rooms.forEach(([x, y, w, h]) => [[x, y, x + w, y], [x, y + h, x + w, y + h], [x, y, x, y + h], [x + w, y, x + w, y + h]].forEach(([a, b, c, d]) => el('line', { x1: OFX + a * WK, y1: OFY + b * WK, x2: OFX + c * WK, y2: OFY + d * WK, ...attrs }, g)));
  const gaps = (g, bg) => NB.doors.forEach(([d, c, s]) => el('rect', d === 'v' ? { x: OFX + c * WK - 8, y: OFY + s * WK, width: 16, height: 0.9 * WK, fill: bg } : { x: OFX + s * WK, y: OFY + c * WK - 8, width: 0.9 * WK, height: 16, fill: bg }, g));
  const layer = (k, bg) => {
    const g = el('g', {}, s3);
    if (k) { const cp = el('clipPath', { id: 'pc' + k }, defs3); clips[k] = el('rect', { x: 0, y: 0, width: 0, height: 196 }, cp); g.setAttribute('clip-path', `url(#pc${k})`); }
    el('rect', { x: 0, y: 0, width: 252, height: 196, fill: bg }, g);
    return g;
  };
  { // 0 the plan as an image
    const g = layer(0, PAPER); lines(g, { stroke: INK, 'stroke-width': 4 }); gaps(g, PAPER);
    // 1 gray < 128: black and white
    const g1 = layer(1, '#fff'); lines(g1, { stroke: '#000', 'stroke-width': 5, 'shape-rendering': 'crispEdges' }); gaps(g1, '#fff');
    // 2 distance transform: the middle of the wall is the farthest from the free pixels
    const g2 = layer(2, INK); lines(g2, { stroke: '#31465f', 'stroke-width': 12, 'stroke-linecap': 'square' }); lines(g2, { stroke: '#cfe8ff', 'stroke-width': 3 }); gaps(g2, INK);
    // 3 dilation: a door-wide square makes the walls fat and closes the gaps
    const g3 = layer(3, INK); lines(g3, { stroke: '#7fb6d9', 'stroke-width': 26, 'stroke-linecap': 'square', opacity: 0.9 }); lines(g3, { stroke: INK, 'stroke-width': 3 });
    // 4 connected components: every free region gets a label and a colour
    const g4 = layer(4, INK); lines(g4, { stroke: '#3a4350', 'stroke-width': 26, 'stroke-linecap': 'square' });
    NB.rooms.forEach(([x, y, w, h], i) => { el('rect', { x: OFX + (x + 0.5) * WK, y: OFY + (y + 0.5) * WK, width: (w - 1) * WK, height: (h - 1) * WK, fill: RC[i] }, g4); txt(g4, String(i + 1), { x: OFX + (x + w / 2) * WK, y: OFY + (y + h / 2) * WK + 7, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 900, fill: INK }); });
    // 5 rectangles in metres
    const g5 = layer(5, PAPER); lines(g5, { stroke: INK, 'stroke-width': 4 }); gaps(g5, PAPER);
    NB.rooms.forEach(([x, y, w, h], i) => { el('rect', { x: OFX + x * WK + 3, y: OFY + y * WK + 3, width: w * WK - 6, height: h * WK - 6, fill: 'none', stroke: '#ff4d2e', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }, g5); txt(g5, 'r' + (i + 1), { x: OFX + (x + w / 2) * WK, y: OFY + (y + h / 2) * WK + 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 900, fill: '#ff4d2e' }); });
    txt(g5, '9.0 × 7.0 m', { x: OFX + 9 * WK, y: 191, 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: INK, 'font-family': MONO });
  }
  const sweep = el('line', { x1: 0, x2: 0, y1: 0, y2: 196, stroke: '#ff4d2e', 'stroke-width': 4, opacity: 0 }, s3);
  el('rect', { x: 0, y: 0, width: 252, height: 196, fill: 'none', stroke: '#fff', 'stroke-width': 3 }, s3);
  const steps3 = [...root.querySelectorAll('#p3steps li')], cap3 = $('#p3cap');
  const CAP = ['the plan as an image', 'dark pixels are walls', 'wall thickness = 2 × P90', 'door gaps of 0.9 m sealed', 'each free region is a room', 'rectangles in metres'];
  const T3 = (k) => 0.8 + (k - 1) * 1.35;
  function p3(t) {
    let cur = 0, wiping = -1;
    for (let k = 1; k <= 5; k++) { const p = seg(t, T3(k), T3(k) + 0.9); clips[k].setAttribute('width', 252 * E(p)); if (p > 0) cur = k; if (p > 0 && p < 1) wiping = 252 * E(p); }
    sweep.setAttribute('opacity', wiping >= 0 ? 1 : 0); sweep.setAttribute('x1', wiping); sweep.setAttribute('x2', wiping);
    steps3.forEach((li, i) => { li.classList.toggle('on', i + 1 === cur); li.classList.toggle('done', i + 1 < cur); });
    if (cap3.textContent !== CAP[cur]) cap3.textContent = CAP[cur];
  }

  /* ---- 4 Generates: random slicing trees flicker past, the best of them is cut out of the footprint and scored */
  const R = PLAN.room, cand = PLAN.candidates, NC = cand.length, best = PLAN.best[0], K4 = 17, FX = 14, FY = 8;
  const runMax = cand.reduce((a, c, i) => (a.push(Math.max(i ? a[i - 1] : 0, c.score)), a), []);
  const guillotine = (rects, box, depth = 0) => {
    if (rects.length < 2) return [];
    const near = (a, b) => Math.abs(a - b) < 0.02;
    for (const axis of [0, 1]) {
      const lo = box[axis], hi = box[axis + 2];
      for (const c of [...new Set(rects.flatMap((r) => [r[axis], r[axis + 2]]))].filter((v) => v > lo + 0.02 && v < hi - 0.02)) {
        const a = rects.filter((r) => r[axis + 2] <= c + 0.02), b = rects.filter((r) => r[axis] >= c - 0.02);
        if (a.length + b.length !== rects.length || !a.length || !b.length) continue;
        const cut = axis === 0 ? [c, box[1], c, box[3]] : [box[0], c, box[2], c];
        const boxA = axis === 0 ? [box[0], box[1], c, box[3]] : [box[0], box[1], box[2], c], boxB = axis === 0 ? [c, box[1], box[2], box[3]] : [box[0], c, box[2], box[3]];
        void near;
        return [{ cut, depth }, ...guillotine(a, boxA, depth + 1), ...guillotine(b, boxB, depth + 1)];
      }
    }
    return [];
  };
  const cuts = guillotine(best.rooms.map((r) => r.rect), [0, 0, R.w, R.d]).sort((a, b) => a.depth - b.depth);
  const s4 = $('#p4svg'), fx = (x) => FX + x * K4, fy = (y) => FY + y * K4;
  el('rect', { x: FX, y: FY, width: R.w * K4, height: R.d * K4, fill: INK, stroke: '#fff', 'stroke-width': 3 }, s4);
  const candR = best.rooms.map(() => el('rect', { stroke: INK, 'stroke-width': 1.5, opacity: 0 }, s4));
  const finR = best.rooms.map((r) => { const g = el('g', { opacity: 0 }, s4); el('rect', { x: fx(r.rect[0]), y: fy(r.rect[1]), width: (r.rect[2] - r.rect[0]) * K4, height: (r.rect[3] - r.rect[1]) * K4, fill: COL[r.type] || COL.hall, stroke: INK, 'stroke-width': 1.5 }, g); txt(g, ((LBL[r.type] || r.type).length * 7.4 + 6 <= (r.rect[2] - r.rect[0]) * K4 ? (LBL[r.type] || r.type) : ''), { x: fx((r.rect[0] + r.rect[2]) / 2), y: fy((r.rect[1] + r.rect[3]) / 2) + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: INK, 'font-family': MONO }); return g; });
  const stair = R.stair;
  el('rect', { x: fx(stair[0]), y: fy(stair[1]), width: (stair[2] - stair[0]) * K4, height: (stair[3] - stair[1]) * K4, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: 0.8 }, s4);
  const cutL = cuts.map((c) => el('line', { x1: fx(c.cut[0]), y1: fy(c.cut[1]), x2: fx(c.cut[0]), y2: fy(c.cut[1]), stroke: '#ffc533', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0 }, s4));
  const treeT = txt(s4, '', { x: FX, y: 206, 'font-size': 17, 'font-weight': 600, fill: '#9aa1ab', 'font-family': MONO });
  txt(s4, `${R.w} × ${R.d} m`, { x: FX, y: 228, 'font-size': 17, 'font-weight': 600, fill: '#6f7885', 'font-family': MONO });
  const big = txt(s4, '0.00', { x: 170, y: 58, 'font-size': 58, 'font-weight': 900, fill: '#fff' }), bigL = txt(s4, 'best so far', { x: 172, y: 84, 'font-size': 17, 'font-weight': 600, fill: '#9aa1ab', 'font-family': MONO });
  const PARTS = [['area', 0.22, 'Area|Counted floor against the wanted area of every room. WoFlV: 100 % where the roof is 2 m high, 50 % from 1 to 2 m, nothing below. Weight 0.22.'], ['shape', 0.18, 'Shape|Rooms narrower than their minimum width (Neufert) or longer than 2.5 to 1 lose points. Weight 0.18.'], ['head', 0.14, 'Headroom|The share of the floor that counts must reach what the room type needs. Weight 0.14.'], ['access', 0.18, 'Access|Doors are shared walls of at least 0.9 m. Rooms next to the stair hall score 1, two doors away 0.7, three 0.4; walking through a bedroom costs 60 %. Weight 0.18.'], ['links', 0.18, 'Neighbours|The links of the brief: a bath that should touch both bedrooms and does scores 1. Weight 0.18.'], ['light', 0.10, 'Daylight|A room that needs light must touch a gable wall for at least 1 m, or a dormer. Weight 0.10.']];
  const KEYS = ['area', 'shape', 'headroom', 'access', 'links', 'light'];
  const bars = PARTS.map(([name, w, tp], i) => {
    const y = 102 + i * 26, g = el('g', { 'data-tip': tp }, s4), v = PLAN.parts[KEYS[i]];
    el('rect', { x: 170, y: y - 18, width: 218, height: 24, fill: 'transparent' }, g);
    txt(g, name, { x: 172, y, 'font-size': 16, 'font-weight': 600, fill: '#b5bcc6', 'font-family': MONO });
    el('rect', { x: 232, y: y - 11, width: 120, height: 11, fill: 'rgba(255,255,255,.14)' }, g);
    const f = el('rect', { x: 232, y: y - 11, width: 0, height: 11, fill: v > 0.85 ? '#4fbf7f' : v > 0.6 ? '#ffc533' : '#ff6a47' }, g);
    const n = txt(g, '', { x: 386, y, 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: '#fff', 'font-family': MONO });
    return { f, n, v };
  });
  $('#p4ms').textContent = PLAN.ms + ' ms';
  const T4 = 7.6, TF = 10.4;
  function p4(t) {
    const flick = t >= T4 && t < TF, idx = flick ? Math.floor((t - T4) / 0.11) % NC : NC - 1, c = cand[idx];
    candR.forEach((r, i) => {
      const rr = c.rooms[i], on = flick && rr;
      r.setAttribute('opacity', on ? 1 : 0);
      if (on) { r.setAttribute('x', fx(rr.rect[0])); r.setAttribute('y', fy(rr.rect[1])); r.setAttribute('width', (rr.rect[2] - rr.rect[0]) * K4); r.setAttribute('height', (rr.rect[3] - rr.rect[1]) * K4); r.setAttribute('fill', COL[rr.type] || COL.hall); }
    });
    treeT.textContent = flick ? `tree ${String(Math.floor((t - T4) / 0.11) + 1).padStart(3, '0')}  ${c.score.toFixed(2)}` : t >= TF ? 'refined' : '';
    const refine = E(seg(t, TF + 0.1, 12.2)), fin = best.score, base = runMax[NC - 1];
    const shown = !flick && t < T4 ? 0 : flick ? runMax[idx] : base + (fin - base) * refine;
    big.textContent = shown.toFixed(2); big.setAttribute('fill', refine >= 1 ? '#4fbf7f' : '#fff'); bigL.textContent = refine >= 1 ? 'best plan' : flick ? 'best so far' : 'refining';
    cuts.forEach((cu, i) => {
      const p = E(seg(t, TF + 0.2 + i * 0.3, TF + 0.2 + i * 0.3 + 0.35));
      cutL[i].setAttribute('opacity', p > 0 ? 1 - seg(t, 12.0, 12.5) : 0);
      cutL[i].setAttribute('x2', fx(cu.cut[0] + (cu.cut[2] - cu.cut[0]) * p)); cutL[i].setAttribute('y2', fy(cu.cut[1] + (cu.cut[3] - cu.cut[1]) * p));
    });
    finR.forEach((g, i) => g.setAttribute('opacity', E(seg(t, 11.3 + i * 0.12, 11.8 + i * 0.12))));
    bars.forEach((b, i) => { const p = E(seg(t, 11.6 + i * 0.12, 12.5 + i * 0.12)); b.f.setAttribute('width', 120 * b.v * p); b.n.textContent = p > 0.02 ? (b.v * p).toFixed(2) : ''; });
  }

  /* ---- 5 Draws: the technical plan, wall sections black, as techPrimitives made them */
  const TP = PLAN.technical, K5 = 20, X5 = 16, Y5 = 14, s5 = $('#p5svg');
  el('rect', { x: 6, y: 6, width: 184, height: 232, fill: PAPER, stroke: '#fff', 'stroke-width': 2 }, s5);
  const P5 = (x, y) => `${(X5 + x * K5).toFixed(1)},${(Y5 + y * K5).toFixed(1)}`;
  TP.walls.forEach((q) => el('polygon', { points: q.map(([x, y]) => `${(X5 + x * K5).toFixed(1)},${(Y5 + y * K5).toFixed(1)}`).join(' '), fill: 'none', stroke: '#b9b4a8', 'stroke-width': 0.8, 'stroke-dasharray': '2 2' }, s5)); // the sheet before the walls are drawn
  const walls5 = TP.walls.map((q) => el('polygon', { points: q.map(([x, y]) => P5(x, y)).join(' '), fill: INK, opacity: 0 }, s5));
  const dims5 = TP.dims.map(([a, b]) => el('line', { x1: X5 + a[0] * K5, y1: Y5 + a[1] * K5, x2: X5 + b[0] * K5, y2: Y5 + b[1] * K5, stroke: '#7b7f87', 'stroke-width': 0.9, opacity: 0 }, s5));
  const stair5 = TP.stair.map(([a, b]) => el('line', { x1: X5 + a[0] * K5, y1: Y5 + a[1] * K5, x2: X5 + b[0] * K5, y2: Y5 + b[1] * K5, stroke: '#c0392b', 'stroke-width': 1, opacity: 0 }, s5));
  const win5 = TP.windows.map(([a, b]) => el('line', { x1: X5 + a[0] * K5, y1: Y5 + a[1] * K5, x2: X5 + b[0] * K5, y2: Y5 + b[1] * K5, stroke: '#2b6cb0', 'stroke-width': 1.6, opacity: 0 }, s5));
  const doors5 = TP.doors.map((d) => {
    if (d.k === 'l') return el('line', { x1: X5 + d.a[0] * K5, y1: Y5 + d.a[1] * K5, x2: X5 + d.b[0] * K5, y2: Y5 + d.b[1] * K5, stroke: '#2f7d4f', 'stroke-width': 1.6, opacity: 0 }, s5);
    const rad = (v) => (v * Math.PI) / 180, r = d.r * K5, sx = X5 + d.c[0] * K5 + Math.cos(rad(d.a0)) * r, sy = Y5 + d.c[1] * K5 + Math.sin(rad(d.a0)) * r, ex = X5 + d.c[0] * K5 + Math.cos(rad(d.a1)) * r, ey = Y5 + d.c[1] * K5 + Math.sin(rad(d.a1)) * r;
    return el('path', { d: `M${sx.toFixed(1)} ${sy.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`, fill: 'none', stroke: '#2f7d4f', 'stroke-width': 1.6, opacity: 0 }, s5);
  });
  const leg5 = el('g', { opacity: 0 }, s5);
  [[34, 14, 'outer 36.5 cm'], [78, 5, 'inner 11.5 cm']].forEach(([y, h, s]) => { el('rect', { x: 208, y: y - h / 2, width: 34, height: h, fill: '#fff' }, leg5); txt(leg5, s, { x: 252, y: y + 6, 'font-size': 19, 'font-weight': 700, fill: '#fff' }); });
  el('path', { d: 'M208 138 A26 26 0 0 1 234 112', fill: 'none', stroke: '#2f7d4f', 'stroke-width': 2.4 }, leg5); el('line', { x1: 208, y1: 138, x2: 234, y2: 138, stroke: '#2f7d4f', 'stroke-width': 2.4 }, leg5); txt(leg5, 'door swing', { x: 252, y: 132, 'font-size': 19, 'font-weight': 700, fill: '#fff' });
  [0, 4, 8].forEach((o) => el('line', { x1: 208, y1: 168 + o - 4, x2: 242, y2: 168 + o - 4, stroke: '#7fb6d9', 'stroke-width': 1.8 }, leg5)); txt(leg5, 'window', { x: 252, y: 172, 'font-size': 19, 'font-weight': 700, fill: '#fff' });
  txt(leg5, 'DXF layer WAENDE', { x: 208, y: 214, 'font-size': 15, 'font-weight': 600, fill: '#9aa1ab', 'font-family': MONO }); txt(leg5, 'SOLID, colour 7', { x: 208, y: 234, 'font-size': 15, 'font-weight': 600, fill: '#9aa1ab', 'font-family': MONO });
  const T5 = 12.9;
  function p5(t) {
    walls5.forEach((w, i) => w.setAttribute('opacity', E(seg(t, T5 + i * 0.05, T5 + i * 0.05 + 0.3))));
    const set5 = (list, a, b) => list.forEach((e, i) => e.setAttribute('opacity', E(seg(t, a + (i / list.length) * (b - a) * 0.6, a + (i / list.length) * (b - a) * 0.6 + (b - a) * 0.4))));
    set5(doors5, 14.1, 14.9); set5(win5, 14.2, 14.7); set5(stair5, 14.5, 14.9); set5(dims5, 14.9, 15.7);
    leg5.setAttribute('opacity', E(seg(t, 13.6, 14.2)));
  }

  /* ---- 6 Extrudes: the same walls rise; their tops, the cut faces, are black */
  const s6 = $('#p6svg'), K6 = 17, OX = 214, OY = 66, C30 = Math.cos(Math.PI / 6);
  const iso = (x, y, z) => [OX + (x - y) * C30 * K6, OY + (x + y) * 0.5 * K6 - z * K6];
  const pts6 = (a) => a.map((p) => iso(...p).map((v) => v.toFixed(1)).join(',')).join(' ');
  el('rect', { x: 6, y: 6, width: 376, height: 238, fill: '#e9e6df', stroke: '#fff', 'stroke-width': 2 }, s6);
  el('polygon', { points: pts6([[0, 0, 0], [R.w, 0, 0], [R.w, R.d, 0], [0, R.d, 0]]), fill: '#d3cdc0', stroke: '#a39d90', 'stroke-width': 1 }, s6);
  const boxes = TP.walls.map((q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }).sort((a, b) => a.x0 + a.y0 + a.x1 + a.y1 - (b.x0 + b.y0 + b.x1 + b.y1));
  const solids = boxes.map((b) => ({ b, side: el('polygon', { fill: '#a6a094', stroke: '#7d776b', 'stroke-width': 0.8 }, s6), front: el('polygon', { fill: '#cbc5b8', stroke: '#7d776b', 'stroke-width': 0.8 }, s6), top: el('polygon', { fill: INK, stroke: INK, 'stroke-width': 0.8 }, s6) }));
  const H = 2.6;
  el('rect', { x: 14, y: 226, width: 12, height: 12, fill: INK }, s6); txt(s6, 'cut faces black', { x: 32, y: 237, 'font-size': 17, 'font-weight': 800, fill: INK });
  function p6(t) {
    const h = E(seg(t, 16.3, 17.7)) * H;
    solids.forEach(({ b, side, front, top }) => {
      side.setAttribute('points', pts6([[b.x1, b.y0, 0], [b.x1, b.y1, 0], [b.x1, b.y1, h], [b.x1, b.y0, h]]));
      front.setAttribute('points', pts6([[b.x0, b.y1, 0], [b.x1, b.y1, 0], [b.x1, b.y1, h], [b.x0, b.y1, h]]));
      top.setAttribute('points', pts6([[b.x0, b.y0, h], [b.x1, b.y0, h], [b.x1, b.y1, h], [b.x0, b.y1, h]]));
    });
  }

  /* ---- 7 Renders: two ways out */
  const tileA = $('#p7a'), tileB = $('#p7b');
  function p7(t) {
    [[tileA, 18.2], [tileB, 18.6]].forEach(([e, a]) => { const s = E(seg(t, a, a + 0.6)); e.style.opacity = s; e.style.transform = `translateY(${(1 - s) * 24}px)`; });
  }

  /* ---- the arrows between the cards */
  const cn = $('#pconn');
  const arrow = (x0, y0, x1, y1) => { // a dashed line that flows towards a filled head
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, hx = x1 - ux * 12, hy = y1 - uy * 12;
    el('line', { x1: x0, y1: y0, x2: hx, y2: hy, stroke: '#fff', 'stroke-width': 4, class: 'pflow' }, cn);
    el('polygon', { points: `${x1},${y1} ${hx - uy * 8},${hy + ux * 8} ${hx + uy * 8},${hy - ux * 8}`, fill: '#fff' }, cn);
  };
  [376, 960, 1544].forEach((x) => arrow(x, 603, x, 617));
  arrow(294, 674, 294, 694);
  [[492, 540], [936, 984], [1380, 1428]].forEach(([a, b]) => arrow(a + 12, 884, b - 2, 884));

  /* ---- the small technical plan on the picture of the next slide: the same primitives, drawn once */
  {
    const g = $('#pplan');
    if (g) {
      const K = 20, X = 13, Y = 12, rad = (v) => (v * Math.PI) / 180;
      el('rect', { width: 226, height: 274, fill: PAPER }, g);
      TP.walls.forEach((q) => el('polygon', { points: q.map(([x, y]) => (X + x * K).toFixed(1) + ',' + (Y + y * K).toFixed(1)).join(' '), fill: INK }, g));
      TP.windows.forEach(([a, b]) => el('line', { x1: X + a[0] * K, y1: Y + a[1] * K, x2: X + b[0] * K, y2: Y + b[1] * K, stroke: '#2b6cb0', 'stroke-width': 1.6 }, g));
      TP.doors.forEach((d) => {
        if (d.k === 'l') { el('line', { x1: X + d.a[0] * K, y1: Y + d.a[1] * K, x2: X + d.b[0] * K, y2: Y + d.b[1] * K, stroke: '#2f7d4f', 'stroke-width': 1.6 }, g); return; }
        const r = d.r * K, cx = X + d.c[0] * K, cy = Y + d.c[1] * K;
        el('path', { d: 'M' + (cx + Math.cos(rad(d.a0)) * r).toFixed(1) + ' ' + (cy + Math.sin(rad(d.a0)) * r).toFixed(1) + ' A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (cx + Math.cos(rad(d.a1)) * r).toFixed(1) + ' ' + (cy + Math.sin(rad(d.a1)) * r).toFixed(1), fill: 'none', stroke: '#2f7d4f', 'stroke-width': 1.6 }, g);
      });
      txt(g, 'Grundriss 1:50', { x: 13, y: 262, 'font-size': 15, 'font-weight': 800, fill: INK, 'font-family': MONO });
    }
  }

  /* ---- the clock */
  const bodies = [...root.querySelectorAll('.pbody')], still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = (t) => {
    const f = Math.min(seg(t, 0, 0.35), 1 - seg(t, LOOP - 0.5, LOOP));
    bodies.forEach((b) => { b.style.opacity = f; });
    const SH = 1; // the bottom row starts a second early: the three ways in are still finishing when the search begins
    p1(t); p2(t); p3(t); p4(t + SH); p5(t + SH); p6(t + SH); p7(t + SH);
  };
  let raf = 0, t0 = 0;
  const frame = (now) => { draw(((now - t0) / 1000) % LOOP); raf = requestAnimationFrame(frame); };
  draw(0);
  return { start() { cancelAnimationFrame(raf); if (still) { draw(19.5); return; } t0 = performance.now(); raf = requestAnimationFrame(frame); }, stop() { cancelAnimationFrame(raf); }, at(t) { cancelAnimationFrame(raf); draw(t); } }; // at(t): freeze on one moment (for stills and for checking)
})();
