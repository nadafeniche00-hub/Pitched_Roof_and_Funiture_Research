import { useDispatch, useSelector } from 'react-redux';
import { resolveItem, ITEM_FIELDS, LAYER } from '@shared/params.js';
import { CATALOG } from '@shared/catalog.js';
import { itemsActions } from '../store/itemsSlice.js';
import { useLang } from '../lib/i18n.js';

const NAMES = {
  w: ['width', 'Breite'], d: ['depth', 'Tiefe'], h: ['height', 'Höhe'],
  bodyH: ['headroom over body', 'Höhe über Möbel'], useH: ['headroom for use', 'Höhe zur Benutzung'],
  front: ['front clearance', 'Bewegungsfläche vorn'], back: ['back clearance', 'Bewegungsfläche hinten'], side: ['side clearance', 'Bewegungsfläche seitlich'],
};

/** Shows where every parameter of the selected piece comes from: category -> product -> this piece. */
export default function ItemInspector() {
  const dispatch = useDispatch();
  const lang = useLang();
  const de = lang === 'de';
  const item = useSelector((s) => s.items.find((i) => i.id === s.ui.selectedId));
  if (!item) return null;
  const { def, source } = resolveItem(item);
  const values = { w: def.w, d: def.d, h: def.h, bodyH: def.bodyH, useH: def.useH, front: def.clear.front, back: def.clear.back, side: def.clear.side };

  return (
    <section className="inspector">
      <h3>{de ? 'Parameter' : 'Parameters'} · {de ? def.labelDe : def.label}</h3>
      <label className="inline" style={{ margin: '0 0 6px' }}>{de ? 'Basistyp' : 'Base type'}
        <select value={item.type} onChange={(e) => dispatch(itemsActions.setType({ id: item.id, type: e.target.value }))}>
          {Object.entries(CATALOG).map(([k, v]) => <option key={k} value={k}>{de ? v.de : v.label}</option>)}
        </select>
      </label>
      <table className="params">
        <tbody>
          {ITEM_FIELDS.map((k) => {
            const own = source[k] === LAYER.instance;
            return (
              <tr key={k} className={own ? 'own' : ''}>
                <td>{NAMES[k][de ? 1 : 0]}</td>
                <td>
                  <input type="number" step="0.05" min="0" value={(values[k] ?? 0).toFixed(2)}
                    onChange={(e) => Number.isFinite(+e.target.value) && dispatch(itemsActions.setOverride({ id: item.id, key: k, value: +e.target.value }))} />
                </td>
                <td className="layer">{source[k] || '—'}</td>
                <td>{own && <button className="mini ghost" title={de ? 'Zurück zum geerbten Wert' : 'Back to inherited value'} onClick={() => dispatch(itemsActions.resetOverride({ id: item.id, key: k }))}>↺</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
