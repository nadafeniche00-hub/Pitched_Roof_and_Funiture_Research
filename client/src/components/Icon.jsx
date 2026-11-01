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
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
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
    <button type="button" className={`ib ${active ? 'primary on' : ''} ${className}`} title={keyHint ? `${label} (${keyHint})` : label} aria-label={label} aria-pressed={active ? true : undefined} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={size} />
      {cap && <span className="cap">{cap}</span>}
    </button>
  );
}
