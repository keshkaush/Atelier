import '@fontsource-variable/instrument-sans';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resolveHost } from './lib/host';

// Confirm the selected host is reachable before the user does any work.
// If VITE_HOST=local but the sidecar is down, this swaps the live `host`
// binding to the mock and notes it in the console — the app still opens.
void resolveHost();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
