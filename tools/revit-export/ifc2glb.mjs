// Convert the exported furniture IFC files to GLB (one material per colour) for the browser.
// Run from the client folder:  node ../tools/revit-export/ifc2glb.mjs  type1 type2 ...   (reads public/furniture/<type>.ifc)
import { pathToFileURL } from 'node:url';
const WebIFC = await import(pathToFileURL(process.cwd() + '/node_modules/web-ifc/web-ifc-api-node.js').href); // resolved from the client folder
import fs from 'node:fs';

const api = new WebIFC.IfcAPI();
api.SetWasmPath(process.cwd() + '/node_modules/web-ifc/', true);
await api.Init();

function convert(type) {
  const id = api.OpenModel(new Uint8Array(fs.readFileSync(`public/furniture/${type}.ifc`)));
  const prims = new Map(); // colour key -> { color, pos[], nor[], idx[] }
  api.StreamAllMeshes(id, (m) => {
    for (let i = 0; i < m.geometries.size(); i++) {
      const g = m.geometries.get(i), geo = api.GetGeometry(id, g.geometryExpressID);
      const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()), ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      const M = g.flatTransformation, c = g.color, key = [c.x, c.y, c.z, c.w].map((q) => q.toFixed(3)).join(',');
      if (!prims.has(key)) prims.set(key, { color: [c.x, c.y, c.z, c.w], pos: [], nor: [], idx: [] });
      const p = prims.get(key), base = p.pos.length / 3;
      for (let k = 0; k < v.length; k += 6) {
        const x = v[k], y = v[k + 1], z = v[k + 2], nx = v[k + 3], ny = v[k + 4], nz = v[k + 5];
        p.pos.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
        p.nor.push(M[0] * nx + M[4] * ny + M[8] * nz, M[1] * nx + M[5] * ny + M[9] * nz, M[2] * nx + M[6] * ny + M[10] * nz);
      }
      for (let k = 0; k < ix.length; k++) p.idx.push(base + ix[k]);
    }
  });
  api.CloseModel(id);

  const chunks = [], views = [], accessors = [], materials = [], primitives = [];
  let offset = 0;
  const push = (arr, Type, target, comp, count, extra = {}) => {
    const buf = Buffer.from(new Type(arr).buffer);
    const pad = (4 - (buf.length % 4)) % 4;
    chunks.push(buf, Buffer.alloc(pad));
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    accessors.push({ bufferView: views.length - 1, componentType: comp, count, ...extra });
    offset += buf.length + pad;
    return accessors.length - 1;
  };
  for (const p of prims.values()) {
    if (!p.idx.length) continue;
    const n = p.pos.length / 3, min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let k = 0; k < p.pos.length; k++) { min[k % 3] = Math.min(min[k % 3], p.pos[k]); max[k % 3] = Math.max(max[k % 3], p.pos[k]); }
    const a = push(p.pos, Float32Array, 34962, 5126, n, { type: 'VEC3', min, max });
    const b = push(p.nor, Float32Array, 34962, 5126, n, { type: 'VEC3' });
    const c = push(p.idx, Uint32Array, 34963, 5125, p.idx.length, { type: 'SCALAR' });
    materials.push({ pbrMetallicRoughness: { baseColorFactor: p.color, metallicFactor: 0, roughnessFactor: 0.7 }, doubleSided: true, alphaMode: p.color[3] < 0.99 ? 'BLEND' : 'OPAQUE' });
    primitives.push({ attributes: { POSITION: a, NORMAL: b }, indices: c, material: materials.length - 1 });
  }
  const json = { asset: { version: '2.0', generator: 'usable-space ifc2glb' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: type }], meshes: [{ primitives }], materials, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
  fs.writeFileSync(`public/furniture/${type}.glb`, Buffer.concat([head, jh, js, bh, bin]));
  console.log(type, 'materials', materials.length, 'KB', Math.round((12 + 16 + js.length + bin.length) / 1024));
}
for (const t of process.argv.slice(2)) convert(t);
