# Devril (Topple) — Oyun Kartı

| | |
|---|---|
| **Tür** | Domino zinciri puzzle, seviye tabanlı |
| **Referanslar** | Domino Effect tarzı fizik oyunları, "rotate the arrows" puzzle'ları (Flow, Loop) |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30 sn – 2 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1 — meta katmanı (ana menü, harita, görevler, günlük, mağaza) entegre; mağazaya hazır |

## Pazar ve özgünlük

- Domino devirme videoları ve "satisfying" içerik geniş kitleye hitap ediyor; mağazadaki domino
  oyunları ya klasik masa dominosu ya da fizik tabanlı (rastgele, adaletsiz) yerleştirme oyunları.
- Devril'in mekaniği özgün: fizik yok, kurallar deterministik. Her taş 4 yöne bakar, dokununca
  90° döner; tek "Devir!" ile zincir taştan taşa ilerler. Amaç tüm taşları tek itişte devirmek.
- "Ok çevirme" puzzle'larının (Loop, Flow) tatmin edici çözüm anını, domino zincirinin görsel
  ödülüyle birleştirir. Dokunuş sayısı + hedef (par) + yıldız, tekrar oynanabilirlik verir.

## Çekirdek döngü

Taşa dokun (90° saat yönü döner) → zinciri kafada kur → **Devir!** → taşlar sırayla devrilir,
her devrilişte yükselen pentatonik tık + hafif titreşim → hepsi düştüyse konfeti + yıldız;
ayakta kalan varsa kırmızı çerçeveyle gösterilir, tek dokunuşla tekrar dizilir (ceza yok,
yalnızca dokunuş sayısı işler).

## Seviye üretimi

- Seviye numarasından tohumlanan RNG (mulberry32) → herkesin 87. seviyesi aynıdır.
- Önce **çözüm**: ızgarada rastgele, kendini kesmeyen yol (Warnsdorff ağırlıklı); her taş bir
  sonrakini gösterir. Sonra sabit (pin) taşlar seçilir, kalan taşlar döndürülerek karıştırılır.
- **Par** = gerçek minimum dokunuş: dal-sınır DFS ile tüm Hamilton yolları üzerinde en ucuz
  çözüm (bağlantılılık + çıkmaz uç budaması). Testte küçük seviyelerde kaba kuvvetle doğrulanır.
- Yıldız: dokunuş ≤ par → 3, ≤ par+3 → 2, aksi 1. İpucu dönüşleri dokunuş sayılmaz; bu yüzden
  ipucu kullanılan seviye **en çok 2 yıldız** verir (HUD'da "en çok 2★" etiketi).

## Zorluk eğrisi (200 seviye)

| Seviye | Izgara | Taş | Pin | Not |
|---|---|---|---|---|
| 1 | 4×4 | 4 | 0 | öğretici, 1 dokunuş |
| 2–12 | 4×4 | 5–10 | 0 | taş başına 1–2 dokunuş |
| 13–35 | 5×5 | 9–15 | 0–1 | pin 20'de başlar |
| 36–75 | 6×6 | 13–22 | 1–2 | |
| 76–130 | 7×7 | 18–29 | 2–4 | |
| 131–200 | 8×8 | 23–38 | 3–6 | |

Boş hücreler doğal "tuzak"tır: yanlış yön zinciri boşlukta bitirir. 200 seviyenin üretimi + doğrulaması ~1 sn.

## Özellik listesi (v1.0)

- [x] Simülatör, üretici, min-dokunuş çözücü; 200 seviye testte doğrulanıyor
- [x] Dönme animasyonu (easeOutBack) + tık sesi; devrilme animasyonu (yassılaşma + gölge)
- [x] Zincir boyunca yükselen pentatonik ses, her düşüşte hafif haptik; kazanınca konfeti + yıldız
- [x] Pinli taşlar (dönmez, sallanır), başlangıç taşı (turuncu + el rozeti)
- [x] Geri al (dokunuşu iade eder), ipucu (ilki ücretsiz, sonra ödüllü), yeniden başlat
- [x] 1. seviyede el animasyonlu öğretici: önce taşa dokun, sonra Devir!
- [x] Her eylemde kayıt; kazanma ekranında kapatılsa bile ilerleme korunur; seviye başına en iyi yıldız
- [x] Ayarlar (meta): ses, titreşim, satın alımları geri yükle, gizlilik bağlantısı, sürüm; TR/EN, `<html lang>`
- [x] Geçiş reklamı yalnızca 5. seviyeden sonra (meta `showWin` → Sonraki); 3 yıldızda değerlendirme isteği
- [x] İtiş sırasında Devir! düğmesi soluk değil, "basılı" görünür; Geri al / İpucu yalnızca gri ikon

## Meta katmanı (`@studio/kit` meta)

- **Ana menü** açılışta: logo, devrilen 5 domino animasyonu (görünüm renklerinde), jeton, ayarlar,
  görev şeridi, "Seviye N" kartı; alt menü Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası** (200 seviye, yıldızlı, kilitli) — oyunun kendi seviye gezinmesinin yerini aldı.
  Haritadan/karttan açılan seviye, kayıtlı tahta o seviyeye aitse kaldığı yerden devam eder.
- **Kazanınca** `meta.showWin`: yıldız + `10 + yıldız×5` jeton, videoyla x2, Sonraki / Menü.
- **Duraklat** (HUD sol üst) → `meta.showPause`: devam, baştan başla, ayarlar, menü. Eski ayarlar ve
  kazanma katmanları kaldırıldı.
- **İpucu**: her seviyede ilki ücretsiz; sonrası 40 jeton ya da ödüllü video (küçük seçim penceresi).
- **Görevler**: standart `levels`, `stars`, `perfect` + oyuna özgü `topples` (N domino devir) ve
  `pushes` (Devir!'e N kez bas).
- **Görünümler** (`src/skins.ts`, 6 adet): Meşe (ücretsiz), Ceviz 300, Mermer 500, Yeşim 500,
  Şeker 800, Gece 1200. Her biri taş malzemesi + masa/arka plan temasıdır; tuval paleti, sayfa
  arka planı, HUD rengi ve ana menü arka planı birlikte değişir.
- **Kayıt göçü**: v1.0'ın `devril.stars` ve `devril.save` kayıtları ilk açılışta profile taşınır
  (yıldızlar + açık seviye), sonra eski anahtarlar silinir.
- **Native**: `@capacitor-community/admob` + `@capgo/native-purchases` bağımlılık; AdMob TEST
  uygulama kimliği AndroidManifest ve Info.plist'te (`GADApplicationIdentifier`,
  `NSUserTrackingUsageDescription`). `initAds()` / `initStore()` açılışta.

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, tiles, par, resumed` | seviye hunisi |
| `push` | `level, fell, total` | deneme sayısı, zorluk |
| `level_complete` | `level, taps, par, stars, hints, pushes, duration_s` | zorluk ayarı |
| `level_restart` | `level, taps, pushes` | sinir bozucu seviyeler |
| `undo`, `hint` | `level` (`paid`: free/coins/video) | yardım kullanımı |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | (kit meta) | meta hunisi |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 / D7 retention | ≥ %40 / ≥ %15 |
| Oturum başına seviye | ≥ 5 |
| 3 yıldız oranı | %40–60 |

## v1.1 fikirleri

- Çatal (T) taşlar: iki yöne iten taş, zincir ağaca dönüşür
- Günlük bulmaca + seri

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 16 birim test (200 seviyenin tamamı: çözülebilir, karışık
hali çözülmüş değil, par çözücüyle eşit, ızgaraya sığıyor; küçük seviyelerde kaba kuvvet par
kontrolü; ipucuyla en çok 2 yıldız), typecheck, build; `scripts/e2e.mjs` 48 kontrol (ana menü →
günlük ödül → mağazada görünüm al + kullan → görevler → harita → 1. seviye öğretici + gerçek
dokunuş → meta kazanma → sonraki → başarısız itiş + tekrar diz → ücretsiz/jetonlu ipucu, 2 yıldız
sınırı → geri al → duraklat + baştan başla → yeniden yüklemede ilerleme → pin → v1.0 kayıt göçü),
konsol hatasız. İkon/splash, dikey kilit, mağaza görselleri (ana menü dahil 4 sahne) hazır.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, manifest/plist) ve
      Play Console / App Store Connect'te aynı kimlikli IAP ürünleri
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** (`devril`) ile APK'yı cihazda dene; keystore + imzalı AAB
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Mağaza konsolları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
