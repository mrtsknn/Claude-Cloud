# Devril (Topple) — Oyun Kartı

| | |
|---|---|
| **Tür** | Domino zinciri puzzle, seviye tabanlı |
| **Referanslar** | Domino Effect tarzı fizik oyunları, "rotate the arrows" puzzle'ları (Flow, Loop) |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30 sn – 2 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

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
- Yıldız: dokunuş ≤ par → 3, ≤ par+3 → 2, aksi 1.

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
- [x] Ayarlar: ses, titreşim, gizlilik bağlantısı, sürüm; TR/EN, `<html lang>`
- [x] Geçiş reklamı yalnızca 5. seviyeden sonra (`interstitialMoment`); 3 yıldızda değerlendirme isteği

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, tiles, par, resumed` | seviye hunisi |
| `push` | `level, fell, total` | deneme sayısı, zorluk |
| `level_complete` | `level, taps, par, stars, hints, pushes, duration_s` | zorluk ayarı |
| `level_restart` | `level, taps, pushes` | sinir bozucu seviyeler |
| `undo`, `hint` | `level` (`paid`) | yardım kullanımı |
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
- Seviye seçim ekranı (20'lik bölümler), günlük bulmaca + seri
- Taş temaları (kozmetik IAP), "reklamları kaldır" IAP

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 15 birim test (200 seviyenin tamamı: çözülebilir, karışık
hali çözülmüş değil, par çözücüyle eşit, ızgaraya sığıyor; küçük seviyelerde kaba kuvvet par
kontrolü), typecheck, build; `scripts/e2e.mjs` 28 kontrol (öğretici, 1–3. seviye gerçek
dokunuşla, başarısız itiş + tekrar diz, geri al, ipucu, yeniden başlat, pin, 150. seviye,
yeniden yüklemede ilerleme), konsol hatasız. İkon/splash, dikey kilit, mağaza görselleri hazır.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** (`devril`) ile APK'yı cihazda dene; keystore + imzalı AAB
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Mağaza konsolları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
