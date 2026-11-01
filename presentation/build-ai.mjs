// Builds the stand-alone "AI helpers" deck: embeds the two test images and the real roof-shape shares (OpenStreetMap, 16 states).
import fs from 'node:fs';
const R = (p) => fs.readFileSync(new URL(p, import.meta.url));
let h = R('./ai-deck.src.html').toString('utf8');
const sp = JSON.parse(R('../shared/statePatterns.json')).states, all = Object.values(sp);
const total = all.reduce((a, s) => a + s.n, 0), cnt = (k) => all.reduce((a, s) => a + (s.counts[k] || 0), 0);
const shares = {};
for (const k of ['gabled', 'hipped', 'half-hipped', 'mansard', 'pyramidal', 'skillion', 'flat']) shares[k] = +((100 * cnt(k)) / total).toFixed(2);
const DATA = { total, shares, coverage: +(100 - (100 * cnt('other')) / total).toFixed(1) };
const img = (n) => 'data:image/png;base64,' + R('./img/' + n).toString('base64');
const J = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
h = h.replace('{{DATA}}', () => J(DATA)).replace('{{PLAN_IMG}}', () => img('ai_test_plan.png')).replace('{{ROOF_IMG}}', () => img('ai_test_roof.png'));
const HEAD = '</title><meta name="claude:viewport-fit-sides" content="cover"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap">';
fs.writeFileSync(new URL('./ai-deck.fragment.html', import.meta.url), h.replace('</title>', () => HEAD));
fs.writeFileSync(new URL('./ai-deck.html', import.meta.url), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap">' + h);
console.log('built', (h.length / 1e3).toFixed(0) + ' KB', DATA);
