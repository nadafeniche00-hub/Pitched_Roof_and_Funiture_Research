// Which rooms belong next to each other, measured on real flats instead of written by hand. The numbers come from the Modified Swiss Dwellings (shared/msdPriors.js, written by
// pipeline/oracle/msd/distill.py over 16,744 flats): two rooms SHARE A WALL when the boundary of one lies within 0.45 m of the other's for at least 0.9 m (a door fits); a DOOR is an edge of
// the access graph. They are different questions: in 71 % of the flats that have both, a bath shares a wall with a bedroom, but a door between them exists for only 5 % of the baths.
import { MSD_PRIORS } from './msdPriors.js';

// the room types of the app in the words of the data: MSD has no child room, study or WC (a child room and a study are bedrooms there, a WC a small bath)
const MSD = { bedroom: 'bedroom', child: 'bedroom', study: 'bedroom', living: 'living', kitchen: 'kitchen', bath: 'bath', wc: 'bath', storage: 'storeroom', hall: 'corridor' };
const A = MSD_PRIORS.adjacency;

/** Of the real flats that have both kinds of room: { share, flats } that share a wall of 0.9 m between them, or null when the data has too few flats. */
export function wallShare(typeA, typeB) {
  const [a, b] = [MSD[typeA], MSD[typeB]].sort();
  return a && b ? A.flats_with_both_that_share_a_wall[`${a}-${b}`] || null : null;
}

/** Of the real rooms of the first kind: the share that have a door to a room of the second kind. */
export function doorShare(typeA, typeB) {
  const [a, b] = [MSD[typeA], MSD[typeB]];
  return a && b ? A.door_to[a]?.[b] ?? 0 : null;
}

/** Of the real rooms of the first kind: the share that have a door or an open passage to a room of the second kind. */
export function connectedShare(typeA, typeB) {
  const [a, b] = [MSD[typeA], MSD[typeB]];
  return a && b ? A.connected_to[a]?.[b] ?? 0 : null;
}

/** Of the real rooms of the first kind: the share that share a wall of 0.9 m with a room of the second kind (the corridor is the hall of the flat). */
export function roomWallShare(typeA, typeB) {
  const [a, b] = [MSD[typeA], MSD[typeB]];
  return a && b ? A.shares_wall_09[a]?.[b] ?? 0 : null;
}

export const pct = (x) => `${Math.round(x * 100)} %`;
export const FLATS = MSD_PRIORS.flats_used;

/** A wish counts as supported when at least this share of the real flats that have both rooms do it. */
export const SUPPORTED = 0.5;

/**
 * The wishes a brief starts with when the person has not drawn or written any: the neighbours that most real flats have, and no others. A bath next to the first sleeping room and the kitchen next
 * to the living room, each only when the data supports it (the measured share is at least SUPPORTED). Returns links [idA, idB, 'near'] for scorePlan; the person's own links always replace these.
 */
export function defaultLinks(rooms) {
  const first = (...types) => rooms.find((r) => types.includes(r.type));
  const out = [];
  const bath = first('bath'), sleep = first('bedroom', 'child');
  if (bath && sleep && (wallShare('bath', 'bedroom')?.share ?? 0) >= SUPPORTED) out.push([sleep.id, bath.id, 'near']);
  const kitchen = first('kitchen'), living = first('living');
  if (kitchen && living && (wallShare('kitchen', 'living')?.share ?? 0) >= SUPPORTED) out.push([kitchen.id, living.id, 'near']);
  return out;
}
