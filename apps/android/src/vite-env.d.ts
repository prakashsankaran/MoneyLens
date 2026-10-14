/// <reference types="vite/client" />

// The minified build has the same exports as the one the API imports.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist/legacy/build/pdf.mjs';
}
