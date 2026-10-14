import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as WEBIFC from 'web-ifc';
import { useT, useLang } from '../lib/i18n.js';
import { uiActions } from '../store/uiSlice.js';
import { fetchFacets, searchProducts } from '../store/thunks.js';
import { guessType } from '@shared/furnitureTypes.js';

const FURNISHING = /^IFC(FURNISHINGELEMENT|FURNITURE|SYSTEMFURNITUREELEMENT|SANITARYTERMINAL)$/i;
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);

export default function IfcViewer() {
  const t = useT();
  const lang = useLang();
  const dispatch = useDispatch();
  const mount = useRef(null);
  const S = useRef({}); // three + web-ifc handles
  const [status, setStatus] = useState('');
  const [types, setTypes] = useState([]); // [{name, count, visible}]
  const [sel, setSel] = useState(null); // {id, type, name, globalId, psets}
  const [fileName, setFileName] = useState('');
  const [furn, setFurn] = useState([]);

  // ---- three scene
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    camera.position.set(12, 10, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(10, 20, 8);
    scene.add(sun);
    const root = new THREE.Group();
    // web-ifc already delivers Y-up coordinates (x, height, -plan y): no rotation needed
    scene.add(root);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    S.current = { renderer, scene, camera, controls, root, render, el };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      S.current.api?.CloseModel?.(S.current.modelID);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const clearModel = () => {
    const { root } = S.current;
    [...root.children].forEach((c) => {
      root.remove(c);
      c.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    });
  };

  const load = async (file) => {
    const s = S.current;
    setStatus(lang === 'de' ? 'Lade IFC…' : 'Loading IFC…');
    setSel(null); setTypes([]); setFurn([]); setFileName(file.name);
    try {
      if (!s.api) {
        s.api = new WEBIFC.IfcAPI();
        s.api.SetWasmPath('/', true);
        await s.api.Init(undefined, true);
      }
      const { api } = s;
      if (s.modelID != null) { api.CloseModel(s.modelID); s.modelID = null; }
      clearModel();
      const data = new Uint8Array(await file.arrayBuffer());
      const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
      s.modelID = modelID;

      const byType = new Map(); // type name -> THREE.Group
      const elemBox = new Map(); // expressID -> { type, name, box }
      api.StreamAllMeshes(modelID, (mesh) => {
        const id = mesh.expressID;
        const typeName = api.GetNameFromTypeCode(api.GetLineType(modelID, id));
        let grp = byType.get(typeName);
        if (!grp) { grp = new THREE.Group(); grp.userData.type = typeName; byType.set(typeName, grp); s.root.add(grp); }
        for (let i = 0; i < mesh.geometries.size(); i++) {
          const pg = mesh.geometries.get(i);
          const g = api.GetGeometry(modelID, pg.geometryExpressID);
          const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()).slice();
          const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize()).slice();
          g.delete();
          const geo = new THREE.BufferGeometry();
          const buf = new THREE.InterleavedBuffer(verts, 6);
          geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
          geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(buf, 3, 3));
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
          const c = pg.color;
          const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.x, c.y, c.z), opacity: c.w, transparent: c.w < 1, side: THREE.DoubleSide });
          const m = new THREE.Mesh(geo, mat);
          m.matrixAutoUpdate = false;
          m.matrix.fromArray(pg.flatTransformation);
          m.userData = { expressID: id, type: typeName };
          grp.add(m);
          geo.computeBoundingBox();
          const bb = geo.boundingBox.clone().applyMatrix4(m.matrix);
          const e = elemBox.get(id) || { type: typeName, box: new THREE.Box3() };
          e.box.union(bb);
          elemBox.set(id, e);
        }
        mesh.delete?.();
      });

      // frame the model
      const box = new THREE.Box3();
      elemBox.forEach((e) => box.union(e.box));
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        s.controls.target.copy(ctr);
        s.camera.position.copy(ctr).add(new THREE.Vector3(r * 0.9, r * 0.7, r * 0.9));
        s.camera.near = r / 500; s.camera.far = r * 20; s.camera.updateProjectionMatrix();
        s.controls.update();
      }
      s.byType = byType;
      setTypes([...byType.entries()].map(([name, g]) => ({ name, count: g.children.length, visible: true })).sort((a, b) => b.count - a.count));

      // furnishing candidates: bounding box of every furnishing element (IFC units applied -> metres)
      const groups = new Map();
      for (const [id, e] of elemBox) {
        if (!FURNISHING.test(e.type)) continue;
        const line = api.GetLine(modelID, id, false);
        const name = String(val(line?.Name) || e.type).trim();
        const sz = e.box.getSize(new THREE.Vector3());
        const dims = [sz.x, sz.z, sz.y].map((v) => +v.toFixed(3)); // width, depth, height
        if (dims.some((v) => !(v > 0.05 && v < 6))) continue;
        const key = `${name}|${dims.join('x')}`;
        const cur = groups.get(key) || { name, w: dims[0], d: dims[1], h: dims[2], n: 0, type: e.type };
        cur.n++;
        groups.set(key, cur);
      }
      setFurn([...groups.values()]);
      s.render();
      setStatus(`${file.name}: ${elemBox.size} ${lang === 'de' ? 'Bauteile' : 'elements'}, ${byType.size} ${lang === 'de' ? 'Arten' : 'types'}`);
    } catch (e) {
      console.error(e);
      setStatus(`${lang === 'de' ? 'Fehler' : 'Error'}: ${e.message || e}`);
    }
  };

  const toggleType = (name) => {
    const g = S.current.byType?.get(name);
    if (!g) return;
    g.visible = !g.visible;
    setTypes((ts) => ts.map((x) => (x.name === name ? { ...x, visible: g.visible } : x)));
    S.current.render();
  };

  // ---- picking
  const onClick = async (e) => {
    const s = S.current;
    if (!s.api || s.modelID == null) return;
    const r = s.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, s.camera);
    const hits = ray.intersectObjects(s.root.children.filter((g) => g.visible), true);
    if (!hits.length) return setSel(null);
    const { expressID, type } = hits[0].object.userData;
    const line = s.api.GetLine(s.modelID, expressID, false);
    let psets = [];
    try {
      const sets = await s.api.properties.getPropertySets(s.modelID, expressID, true);
      psets = sets.map((ps) => ({
        name: val(ps.Name) || 'Pset',
        props: (ps.HasProperties || ps.Quantities || []).map((p) => [val(p.Name), val(p.NominalValue) ?? val(p.LengthValue) ?? val(p.AreaValue) ?? val(p.VolumeValue) ?? '']),
      }));
    } catch { /* element without psets */ }
    setSel({ id: expressID, type, name: val(line?.Name), globalId: val(line?.GlobalId), objectType: val(line?.ObjectType), psets });
  };

  const addToLibrary = async () => {
    const products = furn.map((f) => ({
      name: f.name, source: `ifc:${fileName.slice(0, 30)}`, source_key: `${f.name}|${f.w}x${f.d}x${f.h}`, project: fileName.replace(/\.ifc$/i, ''),
      category: f.type, type: guessType(f.name), w: f.w, d: f.d, h: f.h, occurrences: f.n,
    }));
    const r = await fetch('/api/products/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ products }) });
    const j = await r.json();
    dispatch(uiActions.setToast(`${j.imported} → ${lang === 'de' ? 'Bibliothek' : 'library'}`));
    dispatch(fetchFacets());
    dispatch(searchProducts());
  };

  return (
    <div className="ifcview">
      <div className="card ifcmain">
        <div className="cardhead">
          <h2>{t('tab_ifc')} <small>{status}</small></h2>
          <button className="mini" onClick={async () => { const r = await fetch('/samples/sample-furnishings.ifc'); load(new File([await r.blob()], 'sample-furnishings.ifc')); }}>{lang === 'de' ? 'Beispiel laden' : 'load sample'}</button>
          <label className="filebtn">
            {t('ifc_open')}
            <input type="file" accept=".ifc" hidden onChange={(e) => e.target.files[0] && load(e.target.files[0])} />
          </label>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>{t('ifc_hint')}</p>
        <div ref={mount} className="ifcscene" onClick={onClick} />
      </div>

      <aside className="card ifcside">
        <h3>{t('ifc_types')}</h3>
        <ul className="ifctypes">
          {types.map((x) => (
            <li key={x.name}>
              <label><input type="checkbox" checked={x.visible} onChange={() => toggleType(x.name)} /> {x.name.replace(/^IFC/i, '')}</label>
              <span>{x.count}</span>
            </li>
          ))}
          {!types.length && <li className="hint">—</li>}
        </ul>

        {furn.length > 0 && (
          <>
            <h3>{lang === 'de' ? 'Ausstattung' : 'Furnishings'} ({furn.reduce((a, f) => a + f.n, 0)})</h3>
            <ul className="ifctypes">
              {furn.slice(0, 12).map((f, i) => <li key={i}><span>{f.name}</span><span>{Math.round(f.w * 1000)}×{Math.round(f.d * 1000)}×{Math.round(f.h * 1000)} ×{f.n}</span></li>)}
            </ul>
            <button className="mini primary" onClick={addToLibrary}>{t('ifc_to_lib')}</button>
          </>
        )}

        {sel && (
          <>
            <h3>{t('ifc_props')}</h3>
            <div className="facts">
              <div><b>{sel.name || '—'}</b></div>
              <div>{sel.type}</div>
              {sel.objectType && <div>{sel.objectType}</div>}
              {sel.globalId && <small>{sel.globalId}</small>}
            </div>
            {sel.psets.map((ps, i) => (
              <details key={i} open={i < 2}>
                <summary>{ps.name}</summary>
                <table className="psets"><tbody>{ps.props.map(([k, v], j) => <tr key={j}><td>{String(k)}</td><td>{String(v)}</td></tr>)}</tbody></table>
              </details>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
