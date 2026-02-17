import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// HARD BOOT MARKERS (remove later)
window.__BOOT_TS__ = Date.now();

// Show something even if React never mounts
const rootEl = document.getElementById('root');
if (rootEl) {
  rootEl.innerHTML = `
    <div style="font:14px/1.4 system-ui; padding:16px;">
      <div style="font-weight:800;">BOOT: JS ran (index.js)</div>
      <div style="margin-top:6px; color:#6b7280;">If this stays, React failed to mount or crashed early.</div>
    </div>
  `;
}

// Surface real runtime errors clearly
window.addEventListener('error', (e) => {
  console.error('WINDOW ERROR', e?.error || e);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('UNHANDLED REJECTION', e?.reason || e);
});

const root = ReactDOM.createRoot(rootEl);
root.render(<App />);

