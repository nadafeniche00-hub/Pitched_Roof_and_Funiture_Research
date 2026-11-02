// Parameter inheritance.
//
// A parameter is resolved through ordered layers, lowest priority first; the last layer that defines a value
// wins and we remember which layer it came from (provenance), so the UI can show "inherited from ...".
// This mirrors how BIM types work (IfcTypeObject -> IfcRelDefinesByType -> occurrence overrides):
//
//   furniture:  Category (catalogue type)  <  Product (scraped / IFC dimensions)  <  This piece (overrides)
//   dormers:    Built-in defaults          <  Room default                        <  This dormer
import { CATALOG } from './catalog.js';

/** layers: [{ name, values }] low -> high priority. Returns { values, source } where source[key] = layer name. */
export function resolveParams(layers) {
  const values = {};
  const source = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer.values || {})) {
      if (v === undefined || v === null || Number.isNaN(v)) continue;
      values[k] = v;
      source[k] = layer.name;
    }
  }
  return { values, source };
}

// ---------------------------------------------------------------- furniture

export const ITEM_FIELDS = ['w', 'd', 'h', 'bodyH', 'useH', 'front', 'back', 'side'];
export const LAYER = { category: 'Category', product: 'Product', instance: 'This piece' };

export function itemLayers(item) {
  const base = CATALOG[item.type] || {};
  const c = base.clear || {};
  const category = { w: base.w, d: base.d, h: base.h, bodyH: base.bodyH, useH: base.useH, headH: base.headH, headLen: base.headLen, front: c.front, back: c.back, side: c.side };
  const product = {};
  const p = item.product;
  if (p) {
    for (const k of ['w', 'd', 'h']) if (p[k] > 0) product[k] = p[k];
    // a type whose headroom requirement is its own height (wardrobe, shelf, shower) keeps following the product height
    if (product.h && base.bodyH >= base.h - 1e-9) product.bodyH = product.h;
  }
  return [
    { name: LAYER.category, values: category },
    { name: LAYER.product, values: product },
    { name: LAYER.instance, values: item.overrides || {} },
  ];
}

/** Effective definition of a placed piece + where each value came from. */
export function resolveItem(item) {
  const base = CATALOG[item.type] || {};
  const { values: v, source } = resolveParams(itemLayers(item));
  const def = {
    label: item.product?.name_en || item.product?.name || base.label || item.type,
    labelDe: item.product?.name_de || item.product?.name || base.de || base.label || item.type,
    group: base.group,
    color: base.color,
    w: v.w, d: v.d, h: v.h, bodyH: v.bodyH, useH: v.useH, headH: v.headH || 0, headLen: v.headLen || 0,
    clear: { front: v.front || 0, back: v.back || 0, side: v.side || 0, sideRule: base.clear?.sideRule },
  };
  return { def, source };
}

export const defOf = (item) => resolveItem(item).def;

// ---------------------------------------------------------------- dormers

export const DORMER_DEFAULTS = { width: 2.0, depth: 1.4, height: 2.4 };
export const DORMER_FIELDS = ['width', 'depth', 'height'];

export function resolveDormer(room, d) {
  const own = {};
  for (const k of DORMER_FIELDS) if (d[k] !== undefined) own[k] = d[k];
  const { values, source } = resolveParams([
    { name: 'Built-in', values: DORMER_DEFAULTS },
    { name: 'Room default', values: room.dormerDefaults },
    { name: 'This dormer', values: own },
  ]);
  return { side: d.side, center: d.center, ...values, source };
}
