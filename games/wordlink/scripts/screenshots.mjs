// Usage: npm run preview -w games/wordlink, then
//   node games/wordlink/scripts/screenshots.mjs <preview url> games/wordlink/store/screenshots
// Each language uses its own word pack. Captures phone-size scenes, then composes captioned
// images at the store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const captions = {
  en: ['Swipe letters, make words', 'Crosswords that grow with you', 'Find bonus words, earn coins'],
  tr: ['Harfleri kaydır, kelime kur', 'Seninle büyüyen bulmacalar', 'Bonus kelime bul, jeton kazan'],
};
const scenes = [
  { name: '1-swipe', level: 24, solved: 2, swipeLongest: true },
  { name: '2-grid', level: 160, solved: 4 },
  { name: '3-bonus', level: 60, solved: 3, bonus: true },
];

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((l) => {
      localStorage.setItem('wordlink.settings', JSON.stringify({ sound: false, haptics: false, lang: l }));
      localStorage.setItem('wordlink.coins', '340');
      localStorage.setItem('wordlink.bonusMeter', '6');
    }, lang);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    await page.evaluate((n) => window.__wordlink.goto(n), sc.level);
    const lvl = await page.evaluate(() => window.__wordlink.level);
    const byLen = lvl.words.map((w) => w.w).sort((a, b) => a.length - b.length);
    for (const w of byLen.slice(0, sc.solved)) await page.evaluate((x) => window.__wordlink.submit(x), w);
    await page.waitForTimeout(700);
    if (sc.bonus && lvl.bonus.length) {
      await page.evaluate((x) => window.__wordlink.submit(x), lvl.bonus[0]);
      await page.waitForTimeout(250);
    }
    if (sc.swipeLongest) {
      const target = byLen[byLen.length - 1];
      const letters = await page.$$eval('.letter', (els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return { ch: el.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }));
      const used = new Set();
      const pts = [...target].slice(0, target.length - 1).map((ch) => {
        const i = letters.findIndex((l, j) => !used.has(j) && l.ch === ch.toLocaleUpperCase(lang));
        used.add(i);
        return letters[i];
      });
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.mouse.move(pts[pts.length - 1].x + 30, pts[pts.length - 1].y + 40, { steps: 2 });
      await page.waitForTimeout(200);
    }
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
        background:radial-gradient(120% 70% at 50% 0%,#ffcf6b,#ff9f43 60%,#e8743b);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#14323a;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(60,30,0,.35);border:${w * 0.012}px solid #14323a"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
