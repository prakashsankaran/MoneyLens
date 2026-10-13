/**
 * pdf.js for the app: the same legacy build the API uses, with its worker
 * bundled into the app so reading a PDF needs no network.
 */
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export * from 'pdfjs-dist/legacy/build/pdf.min.mjs';
