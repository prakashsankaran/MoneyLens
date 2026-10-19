/// <reference types="vite/client" />

// The minified build has the same exports as the one the API imports.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist/legacy/build/pdf.mjs';
}

/** The app's versionName, e.g. "1.0.33" (set in vite.config.ts). */
declare const __APP_VERSION__: string;
