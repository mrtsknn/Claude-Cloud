// Usage: npm run preview -w games/yorunge -- --port 4185, then
//   node games/yorunge/scripts/screenshots.mjs <preview url> games/yorunge/store/screenshots
// Captures the home menu and gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-home', home: true },
  { name: '2-orbit', warp: 9 },
  { name: '3-hop', warp: 16, hop: true },
  { name: '4-level', level: 7, warp: 13 },
  { name: '5-shop', shop: true },
];
const captions = {
  en: ['Relaxing space hops', 'One tap. Leave the orbit.', 'Hop from planet to planet', '100 levels to master', 'Unlock satellite trails'],
  tr: ['Rahatlatıcı uzay yolculuğu', 'Tek dokunuş. Yörüngeden çık.', 'Gezegenden gezegene atla', 'Ustalaşacak 100 seviye', 'Parlayan uydu izlerini aç'],
};

// A player a few days in: some coins, a best score, a couple of levels with stars, one extra skin.
const profile = {
  coins: 1250,
  best: 42,
  unlocked: 7,
  stars: [3, 3, 2, 3, 2, 1, ...Array(94).fill(0)],
  owned: ['moon', 'comet'],
  skin: 'comet',
  firstRun: true,
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((p) => {
      localStorage.setItem('yorunge.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('yorunge.profile', JSON.stringify(p));
    }, profile);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (sc.shop) {
      await page.click('.m-nav [data-act="shop"]');
      await page.waitForTimeout(500);
    } else if (!sc.home) {
      if (sc.level) {
        await page.click('.m-nav [data-act="map"]');
        await page.locator('.m-lvl').nth(sc.level - 1).click();
      } else {
        await page.click('[data-act="play-endless"]');
      }
      await page.waitForTimeout(300);
      await page.evaluate((n) => window.__orbit.warp(n), sc.warp);
      await page.waitForTimeout(900);
      if (sc.hop) {
        await page.waitForFunction(() => window.__orbit.aligned(), null, { polling: 'raf' });
        await page.mouse.click(215, 700);
        await page.waitForTimeout(200);
        await page.evaluate(() => window.__orbit.freeze(true));
      }
    } else {
      await page.waitForTimeout(1200); // hero satellite mid-orbit
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
        background:radial-gradient(120% 70% at 50% 0%,#3a3f8f,#161a44 55%,#0b0f24);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 0 ${w * 0.08}px rgba(160,170,255,.35);border:${w * 0.012}px solid #c9d0ff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
