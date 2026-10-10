// Usage: npm run preview -w games/liman -- --port 4189, then
//   node games/liman/scripts/screenshots.mjs http://localhost:4189/ games/liman/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// Each scene: level + how many solution moves to play (+ optional extras).
const scenes = [
  { name: '1-load', level: 24, play: 4 },
  { name: '2-rules', level: 44, play: 3, wrong: true },
  { name: '3-sail', level: 120, play: 99, sail: 1500 },
];
const captions = {
  en: ['Load the ship, port by port', 'Stack right, keep her level', 'Sail the route, unload in order'],
  tr: ['Gemiyi liman liman yükle', 'Doğru istifle, dengede tut', 'Rotayı izle, sırayla boşalt'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('liman.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.evaluate(async ({ level, play, wrong }) => {
      const g = window.__liman;
      g.goto(level);
      const plan = g.solve();
      const tapMove = async (m) => {
        const id = m.id;
        const to = m.to;
        const ev = (p) => new PointerEvent('pointerdown', { clientX: p.x + document.getElementById('stage').getBoundingClientRect().left, clientY: p.y + document.getElementById('stage').getBoundingClientRect().top });
        document.getElementById('stage').dispatchEvent(ev(g.point({ id })));
        document.getElementById('stage').dispatchEvent(ev(to === -1 ? g.point('dock') : g.point({ col: to })));
        while (g.busy()) await new Promise((r) => setTimeout(r, 30));
      };
      for (const m of plan.slice(0, play)) await tapMove(m);
      if (wrong) {
        const s = g.state.ship;
        const late = s.dock.reduce((a, b) => (b.port > a.port ? b : a));
        const col = s.cols.findIndex((c) => c.length && c.at(-1).port < late.port && c.length < g.lv.height);
        await tapMove({ id: late.id, to: col < 0 ? 0 : col });
      }
    }, sc);
    if (sc.sail) {
      await page.click('#sail-btn', { force: true });
      await page.waitForTimeout(sc.sail);
      await page.evaluate(() => window.__liman.freeze(0));
    }
    await page.waitForTimeout(500);
    const file = `${outDir}/raw-${lang}-${sc.name}.png`;
    await page.screenshot({ path: file });
    raw[`${lang}-${sc.name}`] = file;
    await ctx.close();
  }
}

const sizes = { 'ios-6.9': [1290, 2796], 'ios-6.5': [1242, 2688], android: [1080, 1920] };
for (const [lang, caps] of Object.entries(captions)) {
  for (const [i, sc] of scenes.entries()) {
    const img = readFileSync(raw[`${lang}-${sc.name}`]).toString('base64');
    for (const [label, [w, h]] of Object.entries(sizes)) {
      mkdirSync(`${outDir}/${lang}/${label}`, { recursive: true });
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const shotH = h * 0.78;
      const shotW = (shotH * 430) / 932;
      await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
        background:linear-gradient(170deg,#2cc1c4,#0f8b8d 50%,#0b5f78);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(5,40,60,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
