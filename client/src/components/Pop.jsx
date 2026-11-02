import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A hover card. The trigger stays small and visual; the detail opens beside it on hover or keyboard focus and stays open while the pointer or the focus is inside
 * (so the forms in it can be used). The card is drawn into the page body at a fixed position, so neither the scrolling side panels nor an animated (transformed)
 * ancestor clip it or move it.
 *   side  'left' opens to the left of the trigger (for the right panel), 'right' to its right (for the left panel), 'below' under it
 *   wide  a roomier card for tables and forms
 */
export default function Pop({ trigger, children, side = 'left', wide = false, block = false, className = '' }) {
  const ref = useRef(null);
  const card = useRef(null);
  const timer = useRef(0);
  const [pos, setPos] = useState(null);

  const show = () => {
    clearTimeout(timer.current);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight, top = Math.min(Math.max(8, r.top - 8), vh - 120);
    const base = { top, maxHeight: vh - top - 12 };
    setPos(side === 'right' ? { ...base, left: Math.min(r.right + 2, vw - 200) }
      : side === 'below' ? { top: Math.min(r.bottom + 4, vh - 120), left: Math.max(8, Math.min(r.left, vw - 460)), maxHeight: vh - r.bottom - 16 }
        : { ...base, right: Math.max(8, vw - r.left + 2) });
  };
  const hide = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setPos(null), 140); };
  const keep = () => clearTimeout(timer.current);
  const leaves = (e) => !ref.current?.contains(e.relatedTarget) && !card.current?.contains(e.relatedTarget);

  useEffect(() => {
    if (!pos) return undefined;
    const off = (e) => { if (!card.current?.contains(e.target)) setPos(null); }; // scrolling the page under the card closes it; scrolling inside it does not
    window.addEventListener('scroll', off, true);
    window.addEventListener('resize', off);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off); };
  }, [pos]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span ref={ref} className={`pop ${block ? 'block' : ''} ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={(e) => { if (leaves(e)) hide(); }}>
      <span className="poptrig" tabIndex={0}>{trigger}</span>
      {pos && createPortal(
        <div ref={card} className={`popcard ${wide ? 'wide' : ''}`} style={pos} role="group" onMouseEnter={keep} onMouseLeave={hide} onFocus={keep} onBlur={(e) => { if (leaves(e)) hide(); }}>{children}</div>,
        document.body,
      )}
    </span>
  );
}
