// A small decision tree for the rooms of a roof storey: a few questions end in a brief (rooms and wanted areas).
// Pure data and functions (browser, Node, tests). The areas are rules of thumb for exploration.
import { defaultLinks } from './links.js';

export const TREE = {
  who: { q: 'Who lives here?', options: [
    { id: 'single', label: 'One person', next: 'wfh' },
    { id: 'couple', label: 'A couple', next: 'wfh' },
    { id: 'kid1', label: 'Couple + 1 child', next: 'wfh' },
    { id: 'kid2', label: 'Couple + 2 children', next: 'wfh' },
  ] },
  wfh: { q: 'Works from home?', options: [{ id: 'yes', label: 'Yes', next: 'bath' }, { id: 'no', label: 'No', next: 'bath' }] },
  bath: { q: 'Bathroom?', options: [{ id: 'one', label: 'Bathroom', next: 'living' }, { id: 'two', label: 'Bathroom + WC', next: 'living' }] },
  living: { q: 'A living space up here?', options: [{ id: 'yes', label: 'Yes', next: null }, { id: 'no', label: 'No, sleeping floor', next: null }] },
};
export const ROOT = 'who';

/** Follow a path of option ids. Returns the chosen options, the next question node (or null) and whether the path is valid. */
export function walkTree(path) {
  let node = ROOT;
  const chosen = [];
  for (const id of path) {
    const o = node && TREE[node].options.find((x) => x.id === id);
    if (!o) return { chosen, node, valid: false };
    chosen.push({ node, ...o });
    node = o.next;
  }
  return { chosen, node, valid: true };
}

/** The brief for a complete path, or null. Areas are counted (usable) m2. */
export function briefFromPath(path) {
  const { node, valid } = walkTree(path);
  if (!valid || node !== null || path.length !== 4) return null;
  const [who, wfh, bath, living] = path;
  const rooms = [{ id: 'bed', type: 'bedroom', area: who === 'single' ? 8 : 10 }];
  if (who === 'kid1' || who === 'kid2') rooms.push({ id: 'kid1', type: 'child', area: 7 });
  if (who === 'kid2') rooms.push({ id: 'kid2', type: 'child', area: 7 });
  if (wfh === 'yes') rooms.push({ id: 'study', type: 'study', area: 5 });
  rooms.push({ id: 'bath', type: 'bath', area: bath === 'two' ? 4.5 : 4 });
  if (bath === 'two') rooms.push({ id: 'wc', type: 'wc', area: 2 });
  if (living === 'yes') rooms.push({ id: 'liv', type: 'living', area: 12 });
  return { rooms, links: defaultLinks(rooms) }; // the wishes that most real flats have (shared/links.js)
}

/** Scale the wanted areas so the brief fits the usable area of the roof (hall included), never below 2 m2. */
export function fitBrief(brief, have, hall = 4) {
  const need = brief.rooms.reduce((s, r) => s + r.area, 0);
  const room = Math.max(1, have * 0.92 - hall);
  if (need <= room) return brief;
  const k = room / need;
  return { ...brief, rooms: brief.rooms.map((r) => ({ ...r, area: Math.max(2, +(r.area * k).toFixed(1)) })) };
}
