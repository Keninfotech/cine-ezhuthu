import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled (not loaded from a CDN) so Malayalam/Tamil render offline and in exports.
import '@fontsource/noto-sans-malayalam/malayalam-400.css';
import '@fontsource/noto-sans-malayalam/malayalam-700.css';
import '@fontsource/noto-sans-tamil/tamil-400.css';
import '@fontsource/noto-sans-tamil/tamil-700.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: cache the app shell so it opens with no network.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}));
}
