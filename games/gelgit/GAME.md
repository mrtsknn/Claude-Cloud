# Gelgit (Tide) — Oyun Kartı

| | |
|---|---|
| **Tür** | Sıra tabanlı savunma bulmacası, sonsuz skor |
| **Referanslar** | Sand castle / "hold back the tide" mini oyunları, Tower Defense'in labirent kurma kısmı, Into the Breach'in "ne olacağını önceden göster" ilkesi |
| **Hedef kitle** | Herkes — 4+, metinsiz öğretici, şiddet yok |
| **Oturum** | 2–5 dk/oyun |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 + meta katmanı — mağazaya hazır (bkz. kontrol listesi) |

## Pazar ve özgünlük

- Blok/sıralama bulmacaları kalabalık; "kum kalesini dalgadan koru" teması ise sevimli, evrensel
  ve mağazada az işlenmiş. Mevcut örnekler çoğunlukla gerçek zamanlı fizik oyunları — sıra tabanlı,
  düşünmeye dayalı bir versiyon yok.
- Fark yaratan "aha" anı: **canlı dalga önizlemesi**. Duvar koydukça dalganın bu tur nereye kadar
  geleceği (BFS + menzil) anında yeniden hesaplanıp kesik çizgiyle gösterilir. Duvar suyu tam
  kesmek zorunda değil; yolu menzilden uzun yapmak yeter.
- Rakiplerdeki şikâyetler (rastgele haksız kayıplar, anlaşılmayan kurallar) hedef alındı: her şey
  deterministik ve önceden görünür.

## Çekirdek döngü

İNŞA: kum hücresine dokun → duvar (1 kova); bu turda koyduğun duvara tekrar dokun → geri al (kova
iade). Önizleme anında güncellenir → **Dalga!** → su denizden BFS ile menzil kadar yayılır, ulaştığı
kaleleri yıkar, suya değen her duvar 1 dayanıklılık kaybeder (2 → kısa/çatlak → yok) → su çekilir,
ıslak kum kalır → skor += ayakta kalan kale (+2 kusursuz tur bonusu) → sonraki tur.

## Zorluk / ilerleme

| Tur | Dalga menzili | Tur sonu gelen kova | Dalga gücü (duvar hasarı) |
|---|---|---|---|
| 1 | 4 | +4 | 1 |
| 2 | 5 | +4 | 1 |
| 3–5 | 6–8 | +3 | 1 |
| 6–8 | 9–11 | +2 | 1 |
| 9+ | 12+ | +1 | 2 (17. turdan sonra 3) |

Başlangıç: 6 kova, 3 kale, 4–8 kaya. Harita tohumdan üretilir; 1. turda en az bir kale tehdit
altındadır ve açgözlü savunucu (`greedyDefend`) hepsini 5 kovayla kurtarabilmelidir, yoksa harita
deterministik olarak yeniden üretilir. Kalenin dört komşusu kaya olamaz (sonsuza kadar tek duvarla
tutulan cep olmasın diye). Ölçüm (40 tohum): hiçbir şey yapmayan oyuncu ~4 dalgada, açgözlü
savunucu ~9 dalgada kaybediyor. Test: idle < 5, açgözlü > 6 (20 tohum).

## Özellik listesi (v1.0)

- [x] Tohumlu harita üretimi (kıyı dalgalanması, kayalar, kaleler), 1. tur savunulabilirlik garantisi
- [x] Canlı dalga önizlemesi (renkli alan + kesik çizgi, tehdit altındaki kale kırmızı nabız)
- [x] Hücre hücre yayılan sel animasyonu + köpük kenarı, kale yıkılma, duvar aşınması, ıslak kum
- [x] Animasyonlu deniz (kayan dalga çizgileri, köpüklü kıyı), dalgalanan bayraklar, kum parçacıkları
- [x] Sentezlenmiş sesler: filtrelenmiş gürültüyle dalga uğultusu ve köpük, kum, yıkılma, kusursuz akor
- [x] Haptik: inşa, dalga, kale kaybı, kusursuz tur, oyun sonu, kova bitti
- [x] 3 adımlı metinsiz el öğreticisi (inşa et → önizlemeye bak → Dalga!)
- [x] **Meta katmanı (`@studio/kit` meta):** ana menü (logo, animasyonlu kale + dalga çizimi, jeton,
  ayarlar, görev şeridi, "Sonsuz sahil" kartı + rekor), 3 günlük görev, 7 günlük ödül, mağaza
  (6 sahil teması, video ile jeton, başlangıç paketi / reklamsız / jeton paketleri, geri yükleme)
- [x] Görevler: `games` (N oyun), `castles` (dalgalardan N kale kurtar — dalga sonrası ayakta kalan
  her kale), `rounds` (N tur hayatta kal), `walls` (N kum duvarı ör — dalgaya giren duvarlar)
- [x] Temalar (`src/skins.ts`): Altın sahil, Tropik (300), Gün batımı (500), Mercan (600), Kutup (800),
  Ay ışığı (1200) — kum, deniz, köpük, önizleme, duvar, kale, bayrak ve menü arka planının tamamı değişir
- [x] Oyun sonu → `meta.showLose`: skor, rekor, jeton = skor/2; devam (bir kez: 100 jeton ya da video)
  son dalganın yıktığı kaleleri yeniden kurar + 5 kova; tekrar dene (geçiş reklamı anı) / menü
- [x] HUD duraklat → `meta.showPause` (devam, baştan başla, ayarlar, menü); Android geri tuşu da duraklatır
- [x] Ses ayarı dalga sentezini de kapsar (ayrı AudioContext: kapatınca çıkış kazancı 0 + context askıya alınır)
- [x] v1.0 rekoru profile taşınır; her dokunuşta kayıt, tur ortasında bile devam
- [x] AdMob + uygulama içi satın alma: `initAds()` / `initStore()` (test kimlikleri), native eklentiler bağımlılıklarda
- [x] TR / EN, `<html lang>`; 360×640 – 430×932 düzen; safe-area; dikey kilit; açık status bar

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `game_start` | `mode, resumed` | huni |
| `round_end` | `round, castles, lost, buckets, reach, walls_built` | zorluk ayarı |
| `game_over` | `score, rounds, duration_s, continued, best` | oturum uzunluğu |
| `continue` | `round, score` | ödüllü reklam değeri |
| `new_best`, `tutorial_complete`, `game_abandon` | `score` / – / `score, rounds` | |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon (kit) |
| `home`, `daily_claim`, `mission_claim`, `skin_buy`, `iap` | – / `day` / `mission` / `skin` / `product` | meta (kit) |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| İlk dalgayı kusursuz geçme | ≥ %70 |
| D1 / D7 retention | ≥ %38 / ≥ %12 |
| Ortalama tur/oyun | 7–10 |
| Oyun başına süre | 3–5 dk |
| Ödüllü devam kullanımı | ≥ %25 |

## v1.1 fikirleri

- Günün Sahili (tarih tohumlu, herkese aynı harita, ayrı rekor)
- Fırtına turları (bir tur önceden bulut ikonuyla duyurulur, menzil +2)
- Oyun ortasında yeni kale çıkması; hasarlı duvarı onarma

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 13 birim test (flood/menzil, duvar/kaya engeli, aşınma, kale
kaybı, kova ekonomisi, tohum determinizmi, 50 tohumda 1. tur savunulabilirlik, idle vs. açgözlü),
typecheck, build ve `scripts/e2e.mjs` ile gerçek dokunuşlarla 45 kontrol konsol hatasız (ana menü →
günlük → mağaza satın al/kullan → görevler → oyun → dalga → meta kaybet → jetonla devam → duraklat /
ses → yeniden yükleyince devam → 360×640). Mağaza görüntüleri ana menü dahil 4 sahne × 2 dil × 3 boyut.
Android/iOS projeleri, ikon/splash, dikey kilit, `versionName 1.0.0` hazır.

Hesap sahibinin yapacakları:

- [ ] `appId`'yi kendi alan adınla değiştir, `npx cap sync`
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, AndroidManifest, Info.plist) ve
  Play Console / App Store Connect'te aynı kimlikli ürünler (`starter_pack`, `remove_ads`, `coins_small`, `coins_large`)
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: Xcode'da Team seç, Archive → App Store Connect
- [ ] Mağaza formları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği
