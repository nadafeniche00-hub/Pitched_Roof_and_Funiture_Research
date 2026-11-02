// Walls of a layout, one per line: pure geometry on plain arrays, no imports (so it can be tested without the browser).

/** intervals [a, b] joined where they overlap or touch */
const union = (spans) => {
  const out = [];
  for (const s of spans.slice().sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 0.02) last[1] = Math.max(last[1], s[1]); else out.push([s[0], s[1]]);
  }
  return out;
};

/**
 * Every room contributes its own edge, so the walls between neighbours overlap (the walk view draws them twice, hidden in each other). Revit wants one wall per line:
 * the pieces on one line are joined and their door openings kept at the same place along the joined wall.
 */
export function mergeWalls(walls) {
  const lines = new Map();
  for (const w of walls) {
    const vertical = Math.abs(w.p0[0] - w.p1[0]) < 1e-6, c = vertical ? w.p0[0] : w.p0[1];
    const k = vertical ? 1 : 0, a = Math.min(w.p0[k], w.p1[k]), b = Math.max(w.p0[k], w.p1[k]);
    const key = `${vertical ? 'v' : 'h'}${c.toFixed(2)}`, g = lines.get(key) || { vertical, c, spans: [], ops: [] };
    g.spans.push([a, b]);
    for (const o of w.op) g.ops.push([a + o[0], a + o[1]]);
    lines.set(key, g);
  }
  const out = [];
  for (const g of lines.values()) {
    const ops = union(g.ops);
    for (const [a, b] of union(g.spans)) {
      out.push({
        p0: g.vertical ? [g.c, a] : [a, g.c],
        p1: g.vertical ? [g.c, b] : [b, g.c],
        op: ops.filter(([s, e]) => e > a && s < b).map(([s, e]) => [Math.max(s, a) - a, Math.min(e, b) - a]),
      });
    }
  }
  return out;
}
