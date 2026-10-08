// Furniture catalogue. All lengths in metres.
//   w, d      footprint at rotation 0 (the "front" faces +y, i.e. down on the plan)
//   h         real height of the object (used for window blocking)
//   bodyH     roof height that must exist over the whole footprint
//   useH      roof height that must exist over the clearance zones (a person stands/sits there)
//   clear     clearance depths: front, back, side (sideRule: 'any' = one side is enough, 'both')
export const CATALOG = {
  bed_double: { label: 'Double bed', group: 'Sleeping', w: 1.6, d: 2.0, h: 0.5, bodyH: 0.9, useH: 1.0, clear: { front: 0.5, side: 0.6, sideRule: 'any' }, color: '#7aa2d6' },
  bed_single: { label: 'Single bed', group: 'Sleeping', w: 0.9, d: 2.0, h: 0.5, bodyH: 0.9, useH: 1.0, clear: { front: 0.5, side: 0.6, sideRule: 'any' }, color: '#8fb6e0' },
  wardrobe: { label: 'Wardrobe', group: 'Storage', w: 1.2, d: 0.6, h: 2.0, bodyH: 2.0, useH: 1.8, clear: { front: 0.8 }, color: '#b58f6a' },
  chest: { label: 'Chest of drawers', group: 'Storage', w: 1.0, d: 0.5, h: 0.9, bodyH: 0.9, useH: 1.5, clear: { front: 0.7 }, color: '#c7a37f' },
  shelf: { label: 'Tall shelf', group: 'Storage', w: 0.8, d: 0.3, h: 1.8, bodyH: 1.8, useH: 1.5, clear: { front: 0.6 }, color: '#a98763' },
  desk: { label: 'Desk + chair', group: 'Living', w: 1.4, d: 0.7, h: 0.75, bodyH: 0.9, useH: 1.3, clear: { front: 0.9 }, color: '#8fbf9a' },
  sofa: { label: 'Sofa', group: 'Living', w: 2.0, d: 0.9, h: 0.85, bodyH: 0.9, useH: 1.1, clear: { front: 0.7 }, color: '#c28fb5' },
  armchair: { label: 'Armchair', group: 'Living', w: 0.85, d: 0.85, h: 0.85, bodyH: 0.9, useH: 1.1, clear: { front: 0.6 }, color: '#d49fc7' },
  toilet: { label: 'WC', group: 'Bathroom', w: 0.4, d: 0.7, h: 0.8, bodyH: 0.8, useH: 1.8, clear: { front: 0.6 }, color: '#9ec9d6' },
  basin: { label: 'Basin', group: 'Bathroom', w: 0.6, d: 0.45, h: 0.85, bodyH: 1.0, useH: 1.7, clear: { front: 0.6 }, color: '#b3dae4' },
  shower: { label: 'Shower', group: 'Bathroom', w: 0.9, d: 0.9, h: 2.0, bodyH: 2.0, useH: 2.0, clear: { front: 0.5 }, color: '#86bccb' },
};

export const PROGRAMS = {
  bedroom: { label: 'Bedroom', types: ['bed_double', 'wardrobe', 'chest', 'desk'] },
  bedroom_large: { label: 'Bedroom + study', types: ['bed_double', 'wardrobe', 'wardrobe', 'chest', 'desk', 'shelf'] },
  studio: { label: 'Studio', types: ['bed_single', 'wardrobe', 'sofa', 'desk', 'shelf'] },
  bathroom: { label: 'Bathroom', types: ['toilet', 'basin', 'shower'] },
};
