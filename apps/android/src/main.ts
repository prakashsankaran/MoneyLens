/**
 * Entry point of the Android app: the MoneyLens web app with the API running
 * inside it, so everything stays on the phone.
 */
import './backend/polyfills';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import { deviceAI } from './backend/device-ai';
import { installLocalApi } from './backend/local-api';

window.moneylensDevice = { ai: deviceAI };
installLocalApi();
await import('../../web/src/main');
