import { useEffect, useRef, useState } from 'react';
import { IconBtn } from './Icon.jsx';

// Describe the flat in words, or read a sketch: both go to the app server, which uses the team's language and vision model when a key is set
// (server/.env) and the built-in rules otherwise. The engine that answered is always shown.
export const shrink = (file, max = 1600) => new Promise((resolve, reject) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => reject(new Error('That file is not an image.'));
  img.src = url;
});

export default function AiAssist({ onBrief, onPlan }) {
  const [status, setStatus] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const file = useRef(null);
  useEffect(() => { fetch('/api/ai/status').then((r) => r.json()).then(setStatus).catch(() => setStatus({ llm: false })); }, []);

  const describe = async () => {
    setBusy('brief'); setMsg(null);
    try {
      const r = await fetch('/api/ai/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onBrief(j.brief);
      setMsg({ ok: true, text: `${j.engine === 'llm' ? `Read by ${j.model} on the server` : 'Read by the built-in rules'} in ${(j.ms / 1000).toFixed(1)} s: ${j.understood.join(', ')}.${j.ignored?.length ? ` Not understood: ${j.ignored.join(', ')}.` : ''}${j.note ? ' ' + j.note : ''}` });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const sketch = async (f) => {
    if (!f) return;
    setBusy('sketch'); setMsg(null);
    try {
      const image = await shrink(f);
      const r = await fetch('/api/ai/sketch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onPlan(j.plan, f.name);
      setMsg({ ok: true, text: `Sketch read by ${j.model} on the server in ${(j.ms / 1000).toFixed(1)} s: ${j.plan.rooms.length} rooms. Check the types and sizes.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  };

  return (
    <div className="aiassist">
      <input className="aitext" value={text} placeholder="Describe it: 2 bedrooms, a bath next to them, a study of 6 m²  (or in German)" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && describe()} aria-label="Describe the flat" />
      <IconBtn icon="wand" label="Turn the description into rooms" cap={busy === 'brief' ? '…' : 'Describe'} disabled={!text.trim() || !!busy} onClick={describe} />
      <IconBtn icon="camera" label="Read a floor-plan sketch or photo (needs the model server)" cap={busy === 'sketch' ? 'Reading…' : 'Sketch'} disabled={!!busy} onClick={() => file.current?.click()} />
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => sketch(e.target.files[0])} />
      <span className={`aipill ${status?.llm ? 'on' : ''}`} title={status?.llm ? `Models on the server: ${(status.served || []).join(', ') || 'unknown'}` : status?.hint || status?.error || ''}>
        {status === null ? '…' : (status.llm ? `${status.model} · server` : 'built-in rules') + (status.clip ? ' · CLIP' : '')}
      </span>
      {msg && <p className={msg.ok ? 'hint aimsg' : 'hint bad aimsg'}>{msg.text}</p>}
    </div>
  );
}
