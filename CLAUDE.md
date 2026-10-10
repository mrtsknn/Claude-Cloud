# Mobil Oyun Stüdyosu — Çalışma Kuralları

Bu repo, Claude Code (bulut oturumları) ile hızlıca geliştirilip App Store / Google Play'e
çıkarılan basit, cilalı mobil oyunların evidir. Her yeni oturum bu dosyayı okuyarak başlar.

## Ana kurallar (değişmez)

1. **Basit olmalı.** Tek bir çekirdek mekanik, 3 saniyede anlaşılır. Tutorial metni yerine
   ilk hamlede öğreten tasarım. Menü katmanı en fazla 1 seviye.
2. **Bir günde mağazaya çıkabilmeli.** Kapsam bir oturumda bitecek kadar küçük tutulur.
   Bitmiş sayılması için `docs/STORE_CHECKLIST.md` maddelerinin tamamı karşılanmalı.
3. **Tasarım olarak güzel.** Yumuşak animasyonlar, haptik geri bildirim, ses, tutarlı palet,
   safe-area uyumu, 60 FPS. "Prototip gibi görünen" hiçbir şey yayınlanmaz.
4. **Analiz olmalı.** Her oyunun `games/<oyun>/GAME.md` dosyasında pazar/referans analizi,
   çekirdek döngü, KPI hedefleri ve ASO metni bulunur; kodda `@studio/kit` analytics
   olayları (`game_start`, `game_over`, `new_best` …) atılır.
5. **Herkese hitap etmeli.** Belirli bir yaş grubuna ya da cinsiyete yönelik tema, renk,
   karakter veya dil kullanılmaz. Nötr, temiz, "indie hacker" estetiği.
6. **Bir oyun tamamen bitmeden diğerine geçilmez.** "Bitti" = `docs/STORE_CHECKLIST.md`
   tamamen işaretli, tüm değerlendirmeler (oynanış testi, ekran görüntüsü incelemesi,
   rakip karşılaştırması) yapılmış ve eksik özellikler eklenmiş. Sonra `docs/IDEAS.md`'deki
   sıradaki oyuna geçilir.
7. **Meta katmanı zorunlu.** Oyun = oynanış + etrafındaki meta: ana menü, seviye haritası/modlar,
   görevler, günlük ödül, mağaza (görünümler, jeton, reklamsız), duraklat/kazan/kaybet ekranları,
   AdMob + uygulama içi satın alma. Ortak katman: `@studio/kit` meta, rehber: `docs/META.md`.
8. **Tür havuzu:** hyper-casual / hybrid-casual (Voodoo, Rollic tarzı), idle/tycoon,
   kelime oyunları, şekil yerleştirme / blok puzzle, sıralama/eşleştirme puzzle'ları.

## Teknik yığın

- **TypeScript + Vite + HTML5 Canvas/DOM** — oyun mantığı ve çizim; harici oyun motoru yok.
- **Capacitor 8** — aynı web build'ini iOS ve Android uygulamasına sarar.
- **`packages/kit`** (`@studio/kit`) — tüm oyunların ortak modülleri: kalıcı kayıt, haptik,
  sentezlenmiş ses efektleri (asset gerektirmez), analytics, i18n yardımcıları.
- Testler **Vitest** ile; oyun mantığı (`game.ts`) çizimden ayrı ve saf tutulur ki test
  edilebilsin.
- npm workspaces: `packages/*`, `games/*`.

## Yeni oyun ekleme akışı

1. `docs/IDEAS.md` içinden bir fikir seç (veya yeni fikri oraya analiziyle ekle).
2. `templates/GAME.md` dosyasını `games/<oyun>/GAME.md` olarak kopyalayıp doldur.
3. `games/snapgrid` klasörünü iskelet olarak kopyala; `package.json` adını,
   `capacitor.config.ts` içindeki `appId`/`appName` alanlarını ve ikonu değiştir.
4. Mantığı `src/game.ts` içine saf fonksiyonlar olarak yaz, `src/game.test.ts` ile test et.
5. `npm run dev -w games/<oyun>` ile tarayıcıda dene, `npm test` ve `npm run build` temiz geçmeli.
6. Uçtan uca test: `npm run preview -w games/<oyun>` açıkken `scripts/e2e.mjs` (bkz. snapgrid);
   çıkan ekran görüntülerini gözle incele.
7. İkon/splash: `node tools/render-assets.mjs games/<oyun>/public/icon.svg games/<oyun>/assets`
   ardından `tools/native-assets.sh <oyun> <arka plan rengi>` (doğrudan `capacitor-assets` çalıştırma:
   `public/icon.svg`yi siler).
8. Mağaza görselleri: `scripts/screenshots.mjs`, metinler `store/listing.md`, `PRIVACY.md`.
9. `docs/STORE_CHECKLIST.md` maddelerini işaretle.

## Komutlar

```bash
npm install                       # tüm workspace'ler
npm run dev -w games/snapgrid     # geliştirme sunucusu
npm test                          # tüm testler
npm run build                     # tüm oyunların web build'i + typecheck
```

Native build (yerel makinede veya CI'da):

```bash
cd games/snapgrid
npm run build && npx cap add android && npx cap sync   # ilk sefer
npx cap open android                                     # Android Studio
npx cap add ios && npx cap open ios                      # macOS + Xcode gerekir
```

Android APK/AAB bulutta: GitHub → Actions → **Android build** → oyun adını gir. (Bulut oturumunun
ağ politikası Android SDK indirmeyi engellediği için Gradle build'i oturum içinde çalışmaz.)

## Kod stili

- Dışa bağımlılık eklemeden önce iki kez düşün; her bağımlılık mağaza boyutunu ve bakım yükünü artırır.
- Görseller mümkünse kodla çizilir (canvas/SVG); ses efektleri WebAudio ile sentezlenir.
- UI metinleri her zaman `i18n.ts` üzerinden (en az `tr` ve `en`).
- Renkler ve tasarım belirteçleri CSS değişkenlerinde / tek bir `theme` nesnesinde tutulur.
