import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { IconBtn } from './Icon.jsx';
import { techPrimitives, toDxf, toSheetSvg } from '../lib/techPlan.js';

const save = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** The chosen layout as a technical plan: preview, DXF for CAD and Revit, printable A3 sheet at 1:50. */
export default function PlanExport() {
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const layout = useSelector((s) => s.layout.plan);
  const name = useSelector((s) => s.projects?.currentName) || 'Usable Space';
  const drawing = useMemo(() => techPrimitives(room, layout, items, { project: name }), [room, layout, items, name]);
  const svg = useMemo(() => toSheetSvg(drawing), [drawing]);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="card planexport">
      <div className="cardhead">
        <h2>Technical plan <small>{layout ? `${layout.rooms.length} rooms` : 'pick a layout above, or export the empty roof storey'}</small></h2>
        <IconBtn icon="download" label="Download DXF (millimetres, German layers: Waende, Tueren, Fenster, Treppe, Moebel, Raumstempel, Bemassung)" cap="DXF" onClick={() => save(`grundriss-${stamp}.dxf`, toDxf(drawing), 'application/dxf')} />
        <IconBtn icon="download" label="Download the A3 sheet at 1:50 (SVG, opens in any browser or Inkscape, prints to PDF)" cap="A3 1:50" onClick={() => save(`grundriss-A3-${stamp}.svg`, svg, 'image/svg+xml')} />
      </div>
      <div className="sheetprev" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
