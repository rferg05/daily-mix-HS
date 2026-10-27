import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import manifest from '../manifest.json';
import DailyMix from '../src/index';
import type { Fetcher } from '../src/content';
import { makeHostDisplayCache } from './host-cache';

// Stand-in for the host: just enough SDK for the module to run.
(window as unknown as { React: typeof React }).React = React;
(window as unknown as { __HS_SDK__: unknown }).__HS_SDK__ = {
  displayCache: makeHostDisplayCache(),
  emit: (e: unknown) => console.info('[host emit]', e),
};

// The real module goes through the host proxy; here the preview server's
// proxy (dev/vite.config.ts) does the same job.
const devFetcher: Fetcher = async (req) => {
  const url = req.url
    .replace('https://icanhazdadjoke.com', '/src-joke')
    .replace('https://zenquotes.io', '/src-quote');
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep the text */ }
  return { status: res.status, body };
};

const params = new URLSearchParams(location.search);
const style = {
  fontSize: Number(params.get('fs') ?? manifest.defaultStyle.fontSize), fontFamily: 'inter', textColor: '#ffffff',
  backgroundColor: manifest.defaultStyle.backgroundColor, borderRadius: manifest.defaultStyle.borderRadius,
  padding: manifest.defaultStyle.padding, opacity: 1, backdropBlur: 0,
};
const config: Record<string, unknown> = {
  ...manifest.defaultConfig,
  rotateSeconds: 6,
  ...Object.fromEntries([...params].filter(([k]) => !['w', 'h', 'fs'].includes(k))),
};

/** The module at a size you can change, to check the layout refits live. */
function Harness() {
  const [w, setW] = useState(Number(params.get('w') ?? manifest.defaultSize.w));
  const [h, setH] = useState(Number(params.get('h') ?? manifest.defaultSize.h));
  useEffect(() => {
    (window as unknown as { setBox: unknown }).setBox = (nw: number, nh: number) => { setW(nw); setH(nh); };
  }, []);
  const btn = { font: 'inherit', padding: '4px 10px', borderRadius: 6, border: '1px solid #fff4', background: '#0006', color: '#fff', cursor: 'pointer' };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, color: '#fff', fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
        {[[960, 540], [1920, 1080], [540, 960], [600, 600], [1800, 360], [480, 300]].map(([bw, bh]) => (
          <button key={`${bw}x${bh}`} style={btn} onClick={() => { setW(bw); setH(bh); }}>{bw}×{bh}</button>
        ))}
        <span>{w}×{h} · every {String(config.rotateSeconds)} s · add ?quote=false, ?headings=false, ?rotateSeconds=20… to the URL</span>
      </div>
      <div id="module" style={{ width: w, height: h, resize: 'both', overflow: 'hidden' }}>
        <DailyMix config={config} style={style} fetcher={devFetcher} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
