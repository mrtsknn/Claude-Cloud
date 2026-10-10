// Usage: npm run preview -w games/gelgit -- --port 4183, then
//   node games/gelgit/scripts/screenshots.mjs http://localhost:4183/ games/gelgit/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const SEED = 20261010;
const scenes = [
  { name: '0-home', home: true },
  { name: '1-wave', rounds: 1, walls: 'all', freeze: 520 },
  { name: '2-preview', rounds: 0, walls: 1 },
  { name: '3-later', rounds: 4, walls: 'all', skin: 'sunset' },
];
const captions = {
  en: ['Build sand castles, beat the tide', 'Hold back the tide', 'See exactly where the wave will reach', 'Every round, the sea reaches further'],
  tr: ['Kum kaleni kur, dalgayı yen', 'Denizi geri tut', 'Dalganın nereye ulaşacağını gör', 'Her turda deniz daha ileri gelir'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      localStorage.setItem('gelgit.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('gelgit.tutorialDone', 'true');
      localStorage.setItem('gelgit.profile', JSON.stringify({ coins: 1250, best: 64, owned: ['classic', skin], skin, firstRun: true }));
    }, sc.skin ?? 'classic');
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(sc.home ? 1200 : 300);
    if (sc.home) {
      const file = `${outDir}/raw-${lang}-${sc.name}.png`;
      await page.screenshot({ path: file });
      raw[`${lang}-${sc.name}`] = file;
      await ctx.close();
      continue;
    }
    await page.click('[data-act="play-endless"]');
    await page.waitForTimeout(300);
    await page.evaluate((s) => window.__gelgit.beach(s), SEED);
    const build = async (n) => {
      const plan = await page.evaluate(() => window.__gelgit.plan());
      for (const i of n === 'all' ? plan : plan.slice(0, n)) await page.evaluate((i) => window.__gelgit.tap(i), i);
    };
    for (let r = 0; r < sc.rounds - (sc.freeze ? 1 : 0); r++) {
      await build('all');
      await page.evaluate(() => window.__gelgit.wave());
      await page.waitForFunction(() => !window.__gelgit.busy());
    }
    await build(sc.walls);
    if (sc.freeze) {
      await page.evaluate(() => window.__gelgit.wave());
      await page.evaluate((ms) => window.__gelgit.freeze(ms), sc.freeze);
    }
    await page.waitForTimeout(sc.freeze ? 400 : 2200);
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
        background:linear-gradient(175deg,#1c9fb0,#3cc9cf 50%,#f3dcab);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em;text-shadow:0 3px 0 rgba(10,80,90,.3)">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(10,60,70,.4);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
for (const f of Object.values(raw)) rmSync(f);
await browser.close();
console.log('done');
