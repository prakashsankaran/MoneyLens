import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const shim = (name: string) => here(`./src/backend/shims/${name}.ts`);

/**
 * Builds the web app (apps/web, unchanged) for the Android app, with the
 * API's code bundled in and running on the phone (src/main.ts). Server-only
 * packages are swapped for small on-device equivalents in src/backend/shims.
 */
const CSP = [
  "default-src 'self'",
  // The only outside address: Gemini, used by the assistant once the person
  // adds their own key in Settings (src/backend/device-ai.ts).
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function androidEntry(): Plugin {
  return {
    name: 'moneylens-android-entry',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/src/main.tsx' && importer?.endsWith('index.html')) return here('./src/main.ts');
      return undefined;
    },
    transformIndexHtml(html) {
      // The font is bundled, so loading the app makes no request to Google. The
      // page may only talk to itself and Gemini (see CSP), so even a bug cannot
      // send data anywhere else.
      return html
        .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
        .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '')
        .replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
    },
  };
}

export default defineConfig({
  root: here('../web'),
  publicDir: here('../web/public'),
  plugins: [androidEntry(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: here('./src/backend/prisma/index.ts') },
      { find: /^express$/, replacement: shim('express') },
      { find: /^multer$/, replacement: shim('multer') },
      { find: /^(helmet|cors|express-rate-limit|pino-http)$/, replacement: shim('middleware') },
      { find: /^cookie-parser$/, replacement: shim('cookie-parser') },
      { find: /^pino$/, replacement: shim('pino') },
      { find: /^node:crypto$/, replacement: shim('node-crypto') },
      { find: /^@node-rs\/argon2$/, replacement: shim('argon2') },
      { find: /^jsonwebtoken$/, replacement: shim('jsonwebtoken') },
      { find: /^read-excel-file\/node$/, replacement: shim('read-excel-file') },
      { find: /^pdfjs-dist\/legacy\/build\/pdf\.mjs$/, replacement: shim('pdfjs') },
    ],
  },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
