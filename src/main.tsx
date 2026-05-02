import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// When a new service worker skips waiting and claims this page, reload so the
// browser picks up the fresh JS bundle from the updated SW precache.
// (VitePWA's autoUpdate handles the SKIP_WAITING message; this handles the
// case where skipWaiting was set inside the SW itself via workbox config.)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
