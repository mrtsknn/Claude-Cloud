// Renders assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png from an icon SVG.
// Usage: node tools/render-assets.mjs games/<game>/public/icon.svg games/<game>/assets
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [svgPath, outDir] = process.argv.slice(2);
const svg = readFileSync(svgPath, 'utf8');
const blocks = svg.match(/<g [\s\S]*<\/g>/)[0];
const browser = await chromium.launch();
async function render(name, size, html, transparent = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#10142a'}">${html}</body></html>`);
  await page.screenshot({ path: `${outDir}/${name}`, omitBackground: transparent });
  await page.close();
}
const full = (s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
await render('icon-only.png', 1024, full(1024));
// Android adaptive icon: blocks scaled into the 66% safe zone on a transparent layer.
await render(
  'icon-foreground.png',
  1024,
  `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><g transform="translate(512 512) scale(0.62) translate(-512 -512)">${blocks}</g></svg>`,
  true,
);
await render('icon-background.png', 1024, `<div style="width:1024px;height:1024px;background:radial-gradient(120% 120% at 50% 0%,#2a3570,#10142a)"></div>`);
const splash = (s) =>
  `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:radial-gradient(120% 80% at 50% 0%,#1d2550,#10142a)"><svg width="${s * 0.22}" height="${s * 0.22}" viewBox="0 0 1024 1024">${blocks}</svg></div>`;
await render('splash.png', 2732, splash(2732));
await render('splash-dark.png', 2732, splash(2732));
await browser.close();
