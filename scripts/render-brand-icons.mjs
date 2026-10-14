// Renders the MoneyLens brand artwork (docs/brand) to the app icons, favicons and splash
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
  MINT = '#F0FDF4';
// App-icon artwork (kit app-icons/moneylens-app-icon.svg), centred on (55,53) in its own grid.
const appMark = `
  <path d="M18 86 V47 Q18 40 25 44 L43 55 Q47 58 52 54 L91 24" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M77 24 L93 20 L90 37" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 86 V60 L35 70 V86 Z" fill="#FFFFFF"/>
  <path d="M43 86 V66 L60 56 V86 Z" fill="${EMERALD}"/>
  <path d="M68 86 V49 L86 36 V86 Z" fill="${EMERALD}"/>`;
// Logo mark (kit logos/moneylens-mark.svg), for light backgrounds.
const colourMark = `
  <path d="M15 83 V48 Q15 41 22 45 L40 56 Q45 59 50 55 L87 26" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M73 26 L90 22 L87 39" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 83 V60 L31 69 V83 Z" fill="${EMERALD}"/>
  <path d="M39 83 V68 L55 58 V83 Z" fill="${TEAL}"/>
  <path d="M63 83 V51 L79 39 V83 Z" fill="${EMERALD}"/>`;

const svg = (body, w = 100, h = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
// Kit app icon: rounded square (transparent corners).
const roundedIcon = svg(
  `<rect width="100" height="100" rx="23" fill="${DARK}"/><g transform="translate(8,7) scale(0.84)">${appMark}</g>`,
);
// Full-bleed square, for iOS and Expo (the system applies its own mask).
const squareIcon = svg(
  `<rect width="100" height="100" fill="${DARK}"/><g transform="translate(8,7) scale(0.84)">${appMark}</g>`,
);
const circleIcon = svg(
  `<circle cx="50" cy="50" r="50" fill="${DARK}"/><g transform="translate(50,50) scale(0.68) translate(-55,-53)">${appMark}</g>`,
);
// Adaptive-icon foreground: art inside the 66/108 safe zone, transparent around it.
const foreground = svg(
  `<g transform="translate(50,50) scale(0.58) translate(-55,-53)">${appMark}</g>`,
);
const splashMark = svg(
  `<g transform="translate(50,50) scale(0.9) translate(-52,-54)">${colourMark}</g>`,
);
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.32;
  return svg(
    `<rect width="${w}" height="${h}" fill="${MINT}"/><g transform="translate(${w / 2},${h / 2}) scale(${s / 100}) translate(-52,-54)">${colourMark}</g>`,
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
add(`${mob}/splash-icon.png`, splashMark, 512);
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
writeFileSync(`${web}/favicon.svg`, roundedIcon.replace(/\n\s*/g, '') + '\n');
await browser.close();
console.log(`rendered ${jobs.length} images`);
