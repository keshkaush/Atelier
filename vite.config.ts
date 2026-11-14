import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* ============================================================
   Vite config for Atelier's two modes of work:

   · Pure demo — no sidecar. The workspace talks to MockHost and
     nothing here matters. This is the default.
   · Real host — `VITE_HOST=local`. The workspace calls `/api/...`,
     which this proxy forwards to the Node sidecar (server/index.mjs).
     The sidecar binds 127.0.0.1 and needs a token; we inject it here
     from the dev process env so the browser never has to hold it.

   Env the proxy reads (all optional):
     ATELIER_PORT   sidecar port         (default 5179)
     ATELIER_TOKEN  shared secret        (sidecar prints it on boot)
   ============================================================ */

const sidecarPort = process.env.ATELIER_PORT || '5179';
const sidecarToken = process.env.ATELIER_TOKEN;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${sidecarPort}`,
        changeOrigin: false,
        // Inject the sidecar token server-side. The SPA calls same-origin
        // /api, so the browser never sees the token — other local pages
        // and processes that hit 127.0.0.1:5179 directly are refused.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (sidecarToken) proxyReq.setHeader('x-atelier-token', sidecarToken);
          });
        },
      },
    },
  },
});
