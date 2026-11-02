// Furniture catalogue. All lengths in metres. The headroom values come from shared/knowledge.js (Neufert).
import { NEUFERT } from './knowledge.js';

//   w, d      footprint at rotation 0 (the "front" faces +y, i.e. down on the plan)
//   h         real height of the object (used for window blocking)
//   bodyH     roof height that must exist over the whole footprint
//   useH      roof height that must exist over the clearance zones (a person stands/sits there)
//   clear     clearance depths: front, back, side (sideRule: 'any' = one side is enough, 'both')
//   headH     (beds) roof height that must exist over the head end, the first headLen metres of the piece from its back: sitting up in bed
export const CATALOG = {
  bed_double: { de: 'Doppelbett', groupDe: 'Schlafen', label: 'Double bed', group: 'Sleeping', w: 1.6, d: 2.0, h: 0.5, bodyH: NEUFERT.bedFoot, useH: NEUFERT.standing, headH: NEUFERT.headSit, headLen: NEUFERT.headZone, clear: { front: NEUFERT.footOfBed, side: NEUFERT.sideOfBed, sideRule: 'any' }, color: '#1f4e8c' },
  bed_single: { de: 'Einzelbett', groupDe: 'Schlafen', label: 'Single bed', group: 'Sleeping', w: 0.9, d: 2.0, h: 0.5, bodyH: NEUFERT.bedFoot, useH: NEUFERT.standing, headH: NEUFERT.headSit, headLen: NEUFERT.headZone, clear: { front: NEUFERT.footOfBed, side: NEUFERT.sideOfBed, sideRule: 'any' }, color: '#2b63a8' },
  wardrobe: { de: 'Kleiderschrank', groupDe: 'Stauraum', label: 'Wardrobe', group: 'Storage', w: 1.2, d: 0.6, h: 2.0, bodyH: 2.0, useH: NEUFERT.standing, clear: { front: NEUFERT.wardrobeFront }, color: '#6b4a2b' },
  chest: { de: 'Kommode', groupDe: 'Stauraum', label: 'Chest of drawers', group: 'Storage', w: 1.0, d: 0.5, h: 0.9, bodyH: 0.9, useH: 1.5, clear: { front: 0.7 }, color: '#8a6038' },
  shelf: { de: 'Hohes Regal', groupDe: 'Stauraum', label: 'Tall shelf', group: 'Storage', w: 0.8, d: 0.3, h: 1.8, bodyH: 1.8, useH: 1.5, clear: { front: 0.6 }, color: '#5a3d22' },
  desk: { de: 'Schreibtisch mit Stuhl', groupDe: 'Wohnen', label: 'Desk + chair', group: 'Living', w: 1.4, d: 0.7, h: 0.75, bodyH: 0.9, useH: 1.3, clear: { front: 0.9 }, color: '#1f6b45' },
  sofa: { de: 'Sofa', groupDe: 'Wohnen', label: 'Sofa', group: 'Living', w: 2.0, d: 0.9, h: 0.85, bodyH: 0.9, useH: 1.1, clear: { front: 0.7 }, color: '#7a2f6b' },
  armchair: { de: 'Sessel', groupDe: 'Wohnen', label: 'Armchair', group: 'Living', w: 0.85, d: 0.85, h: 0.85, bodyH: 0.9, useH: 1.1, clear: { front: 0.6 }, color: '#93407f' },
  toilet: { de: 'WC', groupDe: 'Bad', label: 'WC', group: 'Bathroom', w: 0.4, d: 0.7, h: 0.8, bodyH: 0.8, useH: NEUFERT.standing, clear: { front: NEUFERT.wcFront }, color: '#1d5c70' },
  basin: { de: 'Waschbecken', groupDe: 'Bad', label: 'Basin', group: 'Bathroom', w: 0.6, d: 0.45, h: 0.85, bodyH: 1.0, useH: NEUFERT.basinStanding, clear: { front: NEUFERT.basinFront }, color: '#2a7a92' },
  shower: { de: 'Dusche', groupDe: 'Bad', label: 'Shower', group: 'Bathroom', w: 0.9, d: 0.9, h: 2.0, bodyH: 2.0, useH: NEUFERT.showerStanding, clear: { front: 0.5 }, color: '#144a5c' },
};

export const PROGRAMS = {
  bedroom: { de: 'Schlafzimmer', label: 'Bedroom', types: ['bed_double', 'wardrobe', 'chest', 'desk'] },
  bedroom_large: { de: 'Schlafzimmer + Arbeiten', label: 'Bedroom + study', types: ['bed_double', 'wardrobe', 'wardrobe', 'chest', 'desk', 'shelf'] },
  studio: { de: 'Studio', label: 'Studio', types: ['bed_single', 'wardrobe', 'sofa', 'desk', 'shelf'] },
  bathroom: { de: 'Bad', label: 'Bathroom', types: ['toilet', 'basin', 'shower'] },
};
