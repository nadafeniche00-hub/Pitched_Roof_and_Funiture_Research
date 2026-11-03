// A small stroke icon set (24 x 24), drawn by hand so nothing is downloaded. The meaning lives in the picture; the words live in the tooltip.
const P = {
  plan: 'M3 3h18v18H3zM3 10h8M11 3v18M11 15h10',
  rooms: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  walk: 'M13 4a1.6 1.6 0 1 0 0 .01M11 21l1.5-6-2.5-2.5 1-5 3 1.5 2.5 2M9 12l-2 3',
  section: 'M3 20h18M4 20V9l8-5 8 5v11M12 4v16',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8a2.5 2.5 0 1 1-2.5 2.5',
  roof: 'M2 13L12 4l10 9M5 11v9h14v-9M9 20v-5h6v5',
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  // sub-objects
  vertex: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 3l4 4M21 3l-4 4M3 21l4-4M21 21l-4-4',
  edge: 'M5 19L19 5M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  polygon: 'M4 18l3-12 11-2 2 13zM4 18l4 2M20 17l-3 3',
  element: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  // tools
  cut: 'M3 20L21 4M3 4l6 6M15 14l6 6',
  extrude: 'M5 20h14M8 20V10h8v10M12 3v7M9 6l3-3 3 3',
  inset: 'M3 3h18v18H3zM8 8h8v8H8z',
  weld: 'M3 12h6M21 12h-6M9 12l3-3M9 12l3 3M15 12l-3-3M15 12l-3 3',
  remove: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  splitEdge: 'M3 12h18M12 8v8M12 12a2 2 0 1 0 0 .01',
  selectAll: 'M4 4h4M10 4h4M16 4h4M4 20h4M10 20h4M16 20h4M4 8v4M4 14v4M20 8v4M20 14v4',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  done: 'M4 12l5 5L20 6',
  magnet: 'M5 3v8a7 7 0 0 0 14 0V3h-4v8a3 3 0 0 1-6 0V3zM5 7h4M15 7h4',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  axisX: 'M4 12h16M16 8l4 4-4 4',
  axisY: 'M12 20V4M8 8l4-4 4 4',
  axisZ: 'M5 19L19 5M10 5h9v9',
  free: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  ruler: 'M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2',
  splitH: 'M3 3h18v18H3zM12 3v18',
  splitV: 'M3 3h18v18H3zM3 12h18',
  enter: 'M4 21V4h9v17M13 12h8M18 8l4 4-4 4M9 12h.01',
  mouse: 'M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM12 3v7',
  jump: 'M12 20V8M8 12l4-4 4 4M6 20h12',
  crouch: 'M12 4a1.6 1.6 0 1 0 0 .01M8 20l2-6-2-3 4-3 4 3-1 3M12 11v3',
  orbit: 'M12 5a7 3 0 1 0 0 .01M18 8a2 2 0 1 0 0 .01M3 12a9 9 0 0 0 18 0',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 6l4 1-3 13-4-1z',
  gabled: 'M3 19V11l9-6 9 6v8zM3 11h18',
  hipped: 'M3 19l4-11h10l4 11zM7 8l5 4 5-4',
  'half-hipped': 'M3 19v-6l3-2 2-5h8l2 5 3 2v6zM6 11h12',
  mansard: 'M3 19v-5l3-5 6-3 6 3 3 5v5zM6 9h12',
  pyramidal: 'M3 19L12 5l9 14zM12 5v14M3 19l9-4 9 4',
  skillion: 'M3 19V8l18 6v5z',
  flat: 'M3 9h18v10H3zM3 9l3-3h12l3 3',
  custom: 'M4 20l4-9 4 4 4-8 4 13z',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  wand: 'M4 20L16 8M14 3l1.5 3.5L19 8l-3.5 1.5L14 13l-1.5-3.5L9 8l3.5-1.5zM19 14l.8 1.7 1.7.8-1.7.8L19 19l-.8-1.7-1.7-.8 1.7-.8z',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  stream: 'M3 5h18v11H3zM9 8.5v4.5l4-2.25zM8 20h8M12 16v4',
  house: 'M3 12L12 4l9 8M5 10v10h14V10M10 20v-6h4v6',
  book: 'M12 6c-2-2-5-2-8-1v14c3-1 6-1 8 1 2-2 5-2 8-1V5c-3-1-6-1-8 1zM12 6v14',
  clipboard: 'M8 4h8v3H8zM6 6h2M16 6h2v15H6V6M9 13l2 2 4-4M9 19h6',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  folder: 'M3 6h6l2 2h10v11H3z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  width: 'M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4',
  depth: 'M12 4v16M8 7l4-4 4 4M8 17l4 4 4-4',
  kneewall: 'M3 20h18M6 20v-6M6 14l12-8',
  pitch: 'M3 20h18M3 20L17 8M9 20a6 6 0 0 0-1.5-4',
  heightRuler: 'M12 3v18M8 3h8M8 21h8M8 8h4M8 13h4',
  dormer: 'M2 20L12 9l10 11M8 20v-6l4-4 4 4v6',
  stair: 'M4 20h4v-4h4v-4h4V8h4',
  window: 'M5 4h14v16H5zM12 4v16M5 12h14',
  door: 'M6 21V4h12v17M6 21h12M15 12.5h.01',
  sofa: 'M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2',
  bubbles: 'M10 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM18 12a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  tree: 'M10 3h4v4h-4zM12 7v4M6 11h12M6 11v4M18 11v4M4 15h4v4H4zM16 15h4v4h-4z',
  puzzle: 'M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H5z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  heatmap: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  clearance: 'M4 4h16v16H4zM8 8h8v8H8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  bed: 'M3 18V7M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3M7 11.5a1.6 1.6 0 1 0 0 .01',
  wardrobe: 'M5 3h14v18H5zM12 3v18M9.5 12h.01M14.5 12h.01',
  basin: 'M3 11h18c0 4-3 6-9 6s-9-2-9-6zM12 17v3M8 20h8M9 7V4h6',
  desk: 'M3 8h18M5 8v12M19 8v12M8 8v6h8V8',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.cube} />
    </svg>
  );
}

/** A button that shows only an icon (the label is its tooltip and its accessible name); `cap` shows a short caption beside the icon. */
export function IconBtn({ icon, label, cap, active, onClick, disabled, className = '', size = 20, keyHint }) {
  return (
    <button type="button" className={`ib ${active ? 'primary on' : ''} ${className}`} data-tip={keyHint ? `${label} (${keyHint})` : label} aria-label={label} aria-pressed={active ? true : undefined} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={size} />
      {cap && <span className="cap">{cap}</span>}
    </button>
  );
}
