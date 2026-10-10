# Fener (Lamplight) — Oyun Kartı

| | |
|---|---|
| **Tür** | Tam örtü (exact-cover) yerleştirme puzzle'ı, seviye tabanlı |
| **Referanslar** | Light Up / Akari (Nikoli), Star Battle, Kakuro'nun "tam bir kez" kuralı |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, süre baskısı yok |
| **Oturum** | 1–3 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 + meta katmanı — mağazaya hazır (bkz. kontrol listesi) |

## Pazar ve özgünlük

- Mantık bulmacaları (Akari, Nonogram, Star Battle) sadık ama küçük bir kitleye sahip; çoğu
  uygulama kağıt-kalem görünümünde ve kuralları metinle anlatıyor.
- Fener aynı "tam bir kez" tatminini **sürükle-bırak** ve sıcak bir gece kasabası temasıyla
  sunuyor: kural ekranda görünür (lamba deseni taşın üstünde, fazla ışık anında kırmızı).
- Mekanik özgün: Akari'den farklı olarak her lambanın kendi deseni var (artı, yatay, dikey,
  çapraz) ve hedef bir **tam örtü** — pencereler tam bir kez aydınlanmalı.
- Diğer stüdyo oyunlarından ayrışma: koyu çivit + kehribar palet (Snapgrid/Pour Sort açık
  ve renkli), sakin tempo.

## Çekirdek döngü

Tepsiden lambayı sürükle → hayalet önizleme hangi pencerelerin yanacağını (kehribar) ve
hangilerinin fazla parlayacağını (kırmızı) gösterir → bırak → pencere yanar + çan sesi →
yerleştirilmiş lambaya dokun = tepsiye geri döner, sürükle = taşı → tüm pencereler tam bir kez
yanınca kasaba evden eve aydınlanır, yıldızlar parlar → yıldız puanı → sonraki seviye.

## Seviye üretimi

`generateLevel(n)` deterministik (tohumlu RNG), çözümden başlar: lambalar sokak hücrelerine
konur, desenleri hesaplanır; tam bir kez aydınlanan hücreler **pencere**, iki kez ve fazlası
sokak olur. Reddedilenler: lamba başına < 3 pencere, çok az boş sokak, lambaların çoğunun tek
makul yeri olması (aşırı zorunlu). Tepsi, çözümün karıştırılmış hâli. 20. seviyeden itibaren
ağaçlar (lamba konamaz) eklenir. Testler 200 seviyenin hepsini kontrol eder.

## Zorluk eğrisi

| Seviye | Izgara | Lamba | Desenler |
|---|---|---|---|
| 1–2 | 6×6 | 2 | artı (1. seviye öğretici el) |
| 3–6 | 6×6 | 3 | + yatay çubuk (4) |
| 7–15 | 6×6 | 4 | + dikey çubuk (8) |
| 16–30 | 6×6 | 5 | + çapraz (16); ağaçlar 20'den |
| 31–80 | 7×7 | 6–7 | 4 desen |
| 81–140 | 8×8 | 7–8 | 4 desen |
| 141–200 | 9×9 | 8–9 | 4 desen |

200'den sonra 9×9 / 9 lamba ile sonsuz devam eder.

## Yıldızlar

★★★ ipucu yok ve en fazla 3 geri alma · ★★ en fazla 1 ipucu · ★ diğer. Seviye başına en iyi
sonuç kit profilinde (`fener.profile` → `stars`, `unlocked`) saklanır. v1.0'ın `fener.stars` /
`fener.completed` anahtarları ilk açılışta profile taşınır ve silinir (profil yoksa bir kez).

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, slogan, kahraman çizimi (fener direği + pencereleri tek tek yanan ev sırası,
  takılı temanın renkleriyle), jeton, ayarlar, görev şeridi, "Seviye N" kartı; alt menü
  Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası:** 200 seviye, yıldızlı, kilitli. Harita/kart → `playLevel(n)`: aynı seviyenin
  yarım kalmış tahtası varsa devam eder, yoksa temiz başlar. 200'den sonra "Sonraki" ile 9×9
  seviyeler sürer (haritada gösterilmez).
- **Kazanma:** kasaba aydınlanma animasyonundan sonra `meta.showWin` (jeton 10 + yıldız×5,
  videoyla x2). Sayfa altta durur, aydınlanan kasaba üstte görünür kalır.
- **Duraklat:** HUD'daki duraklat düğmesi → `meta.showPause` (devam, baştan başla, ayarlar, menü).
  Eski ayarlar ve kazanma katmanları kaldırıldı; ayarlar yalnız meta'da.
- **İpucu:** her seviyede ilki bedava (yeniden başlatmak yenilemez, `fener.freeHints`);
  sonrası 40 jeton ya da ödüllü video (kit stilinde küçük seçim sayfası).
- **Görevler:** standart `levels`, `stars`, `perfect` + `windows` (N pencere aydınlat) ve `lamps`
  (çözülen kasabalara N fener) — ikisi de seviye kazanılınca ilerler (hamle tekrarıyla şişirilemez).
- **Görünümler (`src/skins.ts`, 6):** Kehribar (ücretsiz), Ay ışığı 300, Ateş böceği 500,
  Lavanta 500, Liman 800, Köz 1200. Her biri fener ışığı + gece göğü; tahta, ev, karo renkleri
  gökten türetilir; hiçbiri kırmızı değil (fazla ışık uyarısı hep okunur). Uygulayınca tuval,
  CSS (`--bg-*`, `--amber`, meta `--m-bg`/`--m-accent`) ve `theme-color` değişir.
- **Reklam/IAP:** `initAds()` + `initStore()` (test kimlikleri), AdMob test uygulama kimliği
  AndroidManifest/Info.plist'te, `@capacitor-community/admob` + `@capgo/native-purchases`.

## Özellikler (v1.0)

- [x] Sürükle-bırak, parmak üstünde kaldırma, hayalet önizleme (yanacak / fazla parlayacak)
- [x] Dokun = tepsiye geri al, sürükle = taşı; ipucu lambaları kilitli
- [x] Sıcak ışık halesi + pentatonik çan; çift ışıkta kırmızı titreme + uyumsuz vızıltı + haptik
- [x] Kazanınca kasaba merkezden dışa evden eve aydınlanır, yıldızlar parlar
- [x] Geri al (sınırsız, yıldızı etkiler), ipucu (ilki ücretsiz, sonrası ödüllü), yeniden başlat
- [x] 1. seviyede metinsiz el öğreticisi
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa da ilerleme korunur
- [x] Ayarlar (meta): ses, titreşim, satın alımları geri yükle, gizlilik, sürüm; TR/EN, `<html lang>`
- [x] Geçiş reklamı yalnız 5. seviyeden sonra (meta `showWin`), 3 yıldızda değerlendirme isteği
- [x] Meta: ana menü, harita, görevler, günlük ödül, mağaza (6 tema), duraklat, kazanma, ipucu jetonu
- [x] Yeni ikon: ışık saçan sokak feneri ve pencereleri yanan iki ev (eski ikon oyun kolu yön tuşuna benziyordu)

## Analytics olayları

| Olay | Parametreler |
|---|---|
| `level_start` | `level, size, lamps, resumed` |
| `level_complete` | `level, moves, hints, undos, stars, duration_s` |
| `level_restart` | `level, moves` |
| `hint` | `level, n` |
| `undo` | `level` |
| `hint` → `paid` | `free` / `coins` / `video` |
| `pause`, `progress_migrated` | `level` / `levels, reached` |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | kit meta tarafından |
| `ad_*`, `review_prompt`, `session_start`, `first_open` | kit tarafından |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 / D7 retention | ≥ %40 / ≥ %15 |
| Seviye 30'a ulaşma | ≥ %30 |
| 3 yıldız oranı | %50–70 |

## v1.1 fikirleri

- Bölüm seçimi (20'lik bölümler, yıldız ilerlemesi)
- Yeni desenler (L / at hamlesi, 2×2 köşe), günlük bulmaca
- Çözücü tabanlı zorluk sıralaması

## Kontrol listesi durumu

Kodla yapılabilen maddeler tamam: 13 birim testi (200 seviyenin tamamı tam örtü + tepsi eşleşmesi
dahil), typecheck, build; `scripts/e2e.mjs` gerçek sürüklemelerle 48 kontrol (ana menü, günlük
ödül, mağazada tema alma/takma ve paletin değişmesi, görevler, 200 seviyelik harita, 1. seviye
çift ışık + taşıma + meta kazanma sayfası ve jeton, sonraki, dokunarak geri alma, bedava ipucu,
jetonlu ipucu sayfası, duraklat, yeniden başlatınca bedava ipucunun dönmemesi, yeniden yüklemede
ilerleme ve tahta, v1.0 kaydının taşınması, 360×640'ta 150/200. seviye), konsol hatasız.
Mağaza görselleri 4 sahne (ana menü dahil) × 2 dil × 3 boyut. Android/iOS projeleri dikey
kilitli, sürüm 1.0.0, `npx cap sync` ile AdMob + satın alma eklentileri eklendi.

Hesap sahibine kalanlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**, cihazda dene; release keystore ile AAB imzala
- [ ] iOS: Xcode'da Team seç, Archive → App Store Connect
- [ ] Mağaza formları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği (AdMob)
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, manifest/plist) ve IAP ürünleri
