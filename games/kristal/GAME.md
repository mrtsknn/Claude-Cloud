# Kristal (Snowflake) — Oyun Kartı

| | |
|---|---|
| **Tür** | Simetri / "Lights Out" türevi mantık bulmacası, seviye tabanlı |
| **Referanslar** | Lights Out, Flow Free, Infinity Loop, simetri boyama uygulamaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, sakin tempo |
| **Oturum** | 30 sn – 2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — meta katmanıyla mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- "Relaxing puzzle" ve simetri/mandala uygulamaları istikrarlı indirme alıyor; Infinity Loop
  gibi tek dokunuşlu sakin bulmacalar 50M+ indirmeye ulaştı.
- Lights Out mekaniği bilinen, derinliği kanıtlanmış bir bulmaca; mobilde cilalı bir sürümü az.
- Yorumlardaki şikâyetler: agresif reklam, çözülemeyen/şans bazlı seviyeler, karanlık ekranda
  göz yoran renkler. Kristal: her seviye matematiksel olarak çözülebilir, ilk ipucu ücretsiz,
  koyu gece mavisi paleti.

## Farklılaşma

1. **Tek dokunuş, 6 (veya 12) yansıma:** her dokunuş anında simetrik kopyalarda belirir.
2. **Kanıtlanmış par:** hedefler boş kamadan rastgele dokunuşlarla üretilir; par, GF(2) üzerinde
   Gauss eliminasyonu + sıfır uzayı taramasıyla bulunan en az dokunuş sayısıdır.
3. **Kademeli kural:** 1–14 saf aç/kapa (öğretici), 15'ten itibaren komşu kuralı, 40'tan
   itibaren ayna simetrisi.
4. **Dürüst ipucu:** çözücüden gelen gerçek hamle; her seviyede ilki ücretsiz, sonrası 40 jeton
   ya da ödüllü video. Geri al her zaman ücretsiz.

## Çekirdek döngü

Hedef kar tanesine bak → hücreye dokun (6/12 kopyada değişir, komşular dalgalanır) →
kar tanesi hedefle aynı → parıltı, dönerek düşüş, akor → yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Halka (hücre) | Kural | Rastgele dokunuş |
|---|---|---|---|
| 1–6 | 3 (6) | aç/kapa | 2–4 |
| 7–14 | 4 (10) | aç/kapa | 3–6 |
| 15–24 | 3 (6) | + komşular (seyrek hedef, ≤ 3 yanık hücre) | 2–3 |
| 25–39 | 4 (10) | + komşular | 2–5 |
| 40–54 | 4 (10) | + komşular + ayna | 2–4 |
| 55–89 | 5 (15) | + komşular | 3–7 |
| 90–119 | 5 (15) | + komşular + ayna | 3–6 |
| 120–150 | 6 (21) | + komşular + ayna | 4–8 |

Yıldız: dokunuş ≤ par → 3, ≤ par + max(2, ⌈par/2⌉) → 2, aksi 1.

Komşu kuralının ilk seviyeleri (15–24) bilinçli olarak yumuşak: par 2–3 ve kamada en fazla 3 yanık
hücre (eskiden 15. seviye par 1 ve neredeyse dolu bir hedefti; kural hissedilmeden geçiliyordu).
Testler 15–24 için par 2–3 + seyrek hedef, 15'ten sonra par ≥ 2 olduğunu doğrular.

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, yavaşça dönen kar tanesi (seçili kristal temasında), jeton, ayarlar, görev
  şeridi, "Seviye N" kartı (kaldığın tahtadan devam eder), alt menü: Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası:** 150 seviye, yıldızlı, kilitli.
- **Kazanınca:** kit `showWin` — yıldızlar, 10 + yıldız × 5 jeton, videoyla x2, Sonraki / Menü.
  Kazanma anında sonraki seviye kaydedilir; sonuç ekranı görünmeden uygulama kapanırsa sonuç bir
  sonraki açılışta profile işlenir.
- **Duraklat:** HUD'daki duraklat düğmesi → `showPause` (devam, baştan, ayarlar, menü).
- **Görevler:** `levels`, `stars`, `perfect` + oyuna özgü `taps` (N kristale dokun) ve
  `flakes` (N kar tanesi bitir).
- **Mağaza – kristal temaları (`src/skins.ts`):** Buz (ücretsiz), Kutup ışığı 300, Pembe kuvars 500,
  Kehribar 500, Zümrüt 800, Gece yarısı 1200 — parlak hücre gradyanı, ışıma, faset, merkez ve
  hedef önizleme rengi.
- **Günlük ödül, video ile jeton, IAP** (başlangıç paketi, reklamsız, jeton paketleri, geri yükleme)
  kit tarafından; `initAds()` + `initStore()` açılışta test kimlikleriyle.
- **Göç:** v1.0 kayıtlarındaki `kristal.stars` ve mevcut seviye ilk açılışta profile taşınır.

## Özellik listesi (v1.0)

- [x] 150 deterministik seviye, GF(2) çözücü, her seviye par dokunuşla doğrulanmış
- [x] Kristal hücreler (parıltı, faset), dokunuşta dalga halkaları, arka planda kar yağışı
- [x] Kazanınca parıltılar, kar tanesi dönerek ekrandan düşer; akor sesi
- [x] Köşede hedef önizleme (kar tanesinin boş sağ üst köşesine oturur; uzun ekranlarda büyür)
  + "Taslak" düğmesiyle hedef çerçeve katmanı
- [x] Geri al (sınırsız, ücretsiz), ipucu (ilki ücretsiz, sonrası 40 jeton veya video), yeniden başlat
- [x] 1. seviyede el animasyonlu öğretici (el canvas'ta çizilir; emoji bazı cihazlarda soluk
  görünüyordu); 15 ve 40'ta yeni kural bildirimi
- [x] Meta: ana menü, harita, görevler, günlük ödül, mağaza (6 kristal teması), duraklat, kazanma
- [x] Her dokunuşta kayıt; kazanma anında ilerleme kaydı; devam etme
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm; TR / EN (`<html lang>`); Android geri tuşu
- [x] 5. seviyeden sonra geçiş reklamı anı (kit `showWin`), 8. seviyeden sonra değerlendirme isteği
- [x] AdMob + uygulama içi satın alma eklentileri, test uygulama kimlikleri (Android/iOS)

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, resumed` | seviye hunisi |
| `level_complete` | `level, taps, par, stars, hints, duration_s` | zorluk ayarı |
| `hint` | `level, hints, paid` (`free`/`coins`/`video`) | yardım kullanımı |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | — | meta (kit) |
| `restart` | `level, taps` | sinir bozucu seviyeler |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| Seviye 15'i (komşu kuralı) geçme | ≥ %70 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 5 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük kar tanesi + seri sayacı
- Bitmiş kar tanelerinden koleksiyon galerisi

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 14 birim test (simetri eşlemesi, aç/kapa kuralları, GF(2)
çözücü ve kaba kuvvet karşılaştırması, 150 seviyenin par ile çözülmesi, yumuşak komşu girişi,
determinizm), typecheck, build ve `scripts/e2e.mjs` ile 42 kontrol (ana menü + kahraman görseli,
günlük ödül, mağazada tema alma/giyme, görevler, harita, 1. seviye gerçek dokunuşla → kit kazanma
ekranı → sonraki, geri al, ücretsiz ve jetonlu ipucu, taslak, duraklat → menü, yeniden yüklemede
ilerleme + tahta + tema, komşu seviyesi 15, ayna seviyesi 40), konsol hatasız.
Mağaza görselleri (`scripts/screenshots.mjs`) ana menü dahil 4 sahne × 2 dil × 3 boyut.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Gerçek AdMob kimlikleri: `initAds({ units, testing: false })`, AndroidManifest / Info.plist
  uygulama kimlikleri; IAP ürünleri Play Console / App Store Connect'te aynı kimliklerle
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
