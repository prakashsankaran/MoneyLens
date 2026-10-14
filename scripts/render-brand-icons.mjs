// Renders the MoneyLens brand artwork to the app icons, favicons and splash
// images for web, the Expo app and the Android app.
// Usage: node scripts/render-brand-icons.mjs
// Uses Playwright's Chromium; set CHROMIUM_PATH to use a specific browser binary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DARK = '#063B3A',
  TEAL = '#0F766E',
  EMERALD = '#10B981',
  LIGHT_EMERALD = '#34D399',
  MINT = '#F0FDF4';

// The mark (same shapes as brandMark in packages/ui/src/brand.ts): an "M" whose right
// stroke rises into a trend arrow, over two rising bars. Centre of its box: (54.4, 51.9).
const mark = (line, bar) => `
  <path d="M41 88 V76.6 L56 61.6 V88 Z M62 88 V55.6 L77 40.6 V88 Z" fill="${bar}"/>
  <path d="M29 88 V38 L47 56 L74.9 28.1" fill="none" stroke="${line}" stroke-width="15" stroke-linejoin="round"/>
  <path d="M87.3 15.7 L83.8 39 L64 19.2 Z" fill="${line}" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>`;
const centred = (scale, body, cx = 50, cy = 50) =>
  `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-54.4 -51.9)">${body}</g>`;

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${DARK}"/></linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIGHT_EMERALD}"/><stop offset="1" stop-color="${EMERALD}"/></linearGradient>
  <linearGradient id="shade" gradientUnits="userSpaceOnUse" x1="20" y1="90" x2="90" y2="15"><stop offset="0" stop-color="${EMERALD}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient>
</defs>`;
// On the dark tile: white "M" and arrow, emerald bars.
const appMark = mark('#FFFFFF', 'url(#bar)');
// On light backgrounds: the whole mark shaded from emerald to teal.
const colourMark = mark('url(#shade)', 'url(#shade)');

const svg = (body, w = 100, h = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;
// App icon: rounded square (transparent corners).
const roundedIcon = svg(
  `<rect width="100" height="100" rx="23" fill="url(#bg)"/>${centred(0.86, appMark)}`,
);
// Full-bleed square, for iOS and Expo (the system applies its own mask).
const squareIcon = svg(`<rect width="100" height="100" fill="url(#bg)"/>${centred(0.86, appMark)}`);
const circleIcon = svg(`<circle cx="50" cy="50" r="50" fill="url(#bg)"/>${centred(0.74, appMark)}`);
// Adaptive-icon foreground: art inside the 66/108 safe zone, transparent around it.
// The launcher draws it over the flat dark-teal ic_launcher_background colour.
const foreground = svg(centred(0.6, appMark));
const markOnly = svg(centred(1.15, colourMark));
const splash = (w, h) => {
  const s = (Math.min(w, h) * 0.3) / 100;
  return svg(
    `<rect width="${w}" height="${h}" fill="${MINT}"/>${centred(s, colourMark, w / 2, h / 2)}`,
    w,
    h,
  );
};

const jobs = [];
const add = (path, art, w, h = w, opaque = false) => jobs.push({ path, art, w, h, opaque });

const web = `${repo}/apps/web/public`;
add(`${web}/apple-touch-icon.png`, squareIcon, 180, 180, true);
add(`${web}/icon-192.png`, roundedIcon, 192);
add(`${web}/icon-512.png`, roundedIcon, 512);

const mob = `${repo}/apps/mobile/assets`;
add(`${mob}/icon.png`, squareIcon, 1024, 1024, true);
add(`${mob}/adaptive-icon.png`, foreground, 1024);
add(`${mob}/splash-icon.png`, markOnly, 512);
add(`${mob}/favicon.png`, roundedIcon, 64);

const res = `${repo}/apps/android/android/app/src/main/res`;
for (const [d, n] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  add(`${res}/mipmap-${d}/ic_launcher.png`, roundedIcon, n);
  add(`${res}/mipmap-${d}/ic_launcher_round.png`, circleIcon, n);
  add(`${res}/mipmap-${d}/ic_launcher_foreground.png`, foreground, Math.round(n * 2.25));
}
const splashes = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [d, [w, h]] of Object.entries(splashes))
  add(`${res}/${d}/splash.png`, splash(w, h), w, h, true);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const j of jobs) {
  await page.setViewportSize({ width: j.w, height: j.h });
  const sized = j.art.replace(/width="[\d.]+" height="[\d.]+"/, `width="${j.w}" height="${j.h}"`);
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  const buf = await page.screenshot({
    omitBackground: !j.opaque,
    clip: { x: 0, y: 0, width: j.w, height: j.h },
  });
  mkdirSync(dirname(j.path), { recursive: true });
  writeFileSync(j.path, buf);
}
const oneLine = (art) => art.replace(/\n\s*/g, '') + '\n';
writeFileSync(`${web}/favicon.svg`, oneLine(roundedIcon));
writeFileSync(`${repo}/docs/brand/moneylens-app-icon.svg`, oneLine(roundedIcon));
writeFileSync(`${repo}/docs/brand/moneylens-mark.svg`, oneLine(markOnly));
await browser.close();
console.log(`rendered ${jobs.length} images`);
