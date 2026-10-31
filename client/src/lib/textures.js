// Procedural surface textures for the walk-through, drawn on canvases so nothing is downloaded.
// Each one covers a known size on the model: floor 1 m, tiles 1 m, plaster 2 m, grass 2 m (the uv scale is set by the caller).
// Later these can be replaced by generated images (for example a diffusion model on the server) without touching the scene code.
import * as THREE from 'three';

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const shade = (r, g, b, k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

export function makeTextures() {
  const floor = tex(512, (g, S) => {
    const R = rng(11), rows = 8, h = S / rows;
    for (let i = 0; i < rows; i++) {
      let x = -R() * S * 0.6;
      while (x < S) {
        const len = S * (0.5 + R() * 0.5), k = 0.82 + R() * 0.3;
        g.fillStyle = shade(196, 150, 98, k);
        g.fillRect(x, i * h, len, h);
        g.strokeStyle = 'rgba(70,40,15,0.55)'; g.lineWidth = 2;
        g.strokeRect(x, i * h, len, h);
        g.strokeStyle = 'rgba(90,55,25,0.18)'; g.lineWidth = 1;
        for (let n = 0; n < 5; n++) { const y = i * h + 6 + R() * (h - 12); g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + len - 2, y + (R() - 0.5) * 4); g.stroke(); }
        x += len;
      }
    }
  });

  const plaster = tex(256, (g, S) => {
    g.fillStyle = '#ebe7df'; g.fillRect(0, 0, S, S);
    const R = rng(5);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,115,105' : '255,255,255'},${0.03 + R() * 0.05})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  }, 0.5);

  const tiles = tex(512, (g, S) => {
    const R = rng(23), rows = 3, h = S / rows, cols = 5, w = S / cols;
    for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0), k = 0.78 + R() * 0.3;
      g.fillStyle = shade(150, 66, 48, k); g.fillRect(x, r * h, w, h);
      g.strokeStyle = 'rgba(30,12,8,0.7)'; g.lineWidth = 3; g.strokeRect(x, r * h, w, h);
      const grad = g.createLinearGradient(0, r * h, 0, (r + 1) * h);
      grad.addColorStop(0, 'rgba(0,0,0,0.0)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad; g.fillRect(x, r * h, w, h);
    }
  });

  const grass = tex(256, (g, S) => {
    g.fillStyle = '#5a7a3c'; g.fillRect(0, 0, S, S);
    const R = rng(3);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${40 + R() * 40},${80 + R() * 70},${30 + R() * 30},0.35)`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 2 + R() * 4); }
  }, 1);

  return { floor, plaster, tiles, grass };
}

// ---------------------------------------------------------------- scanned PBR textures (Poly Haven, CC0): public/textures/<slot>_{diff,nor,arm}.jpg
const pbrCache = new Map();

/** Material maps for a slot ('floor' | 'wall' | 'roof'); `repeat` = tiles per metre. Missing files just leave the map empty. */
export function pbr(slot, repeat) {
  const key = slot + repeat;
  if (pbrCache.has(key)) return pbrCache.get(key);
  const loader = new THREE.TextureLoader();
  const load = (suffix, srgb) => {
    const t = loader.load(`/textures/${slot}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  const maps = { map: load('diff', true), normalMap: load('nor', false), aoMap: arm, roughnessMap: arm, metalnessMap: arm };
  pbrCache.set(key, maps);
  return maps;
}
