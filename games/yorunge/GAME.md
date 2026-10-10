# Yörünge (Orbit Hop) — Oyun Kartı

| | |
|---|---|
| **Tür** | Tek dokunuşlu sonsuz arcade (hyper-casual) |
| **Referanslar** | Orbit (Voodoo tarzı yörünge oyunları), Planet Hop, Rocket Orbit |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış |
| **Oturum** | 30 sn – 3 dk / tur |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- "Tek dokunuş + zamanlama" oyunları hyper-casual'ın en kalıcı alt türü; öğrenme maliyeti sıfır,
  "bir tur daha" döngüsü güçlü, reklam tabanlı gelir modeline uygun.
- Uzay/yörünge teması cinsiyet ve yaş açısından nötr; sakin pastel görünüm benzer oyunların
  neon/agresif estetiğinden ayrışıyor.
- Rakip yorumlarındaki şikâyetler: **haksız/ulaşılamaz seviye**, **her ölümde reklam**,
  ani zorluk sıçramaları. Yörünge bu üçünü hedef alıyor.

## Farklılaşma

1. **Her gezegen ulaşılabilir:** üretici aralıkları, testte çok sayıda tohum için gerçek fizik
   simülasyonuyla doğrulanır (en az 6° bırakma penceresi).
2. **Yumuşak zorluk:** halka boyutu, aralık ve dönüş hızı 70. gezegene kadar yavaşça artar.
3. **Ustalık ödülü:** merkeze yakın yakalama "Kusursuz" + kombo parıltısı; yıldızlar +1.
4. **Saygılı reklam:** ölümde zorunlu reklam yok; geçiş reklamı yalnızca "Tekrar oyna"da,
   frekans sınırlı (kit). Devam etmek isteğe bağlı ödüllü reklam (tur başına 1).

## Çekirdek döngü

Uydu gezegen etrafında döner → dokun → teğet boyunca düz uçar → sonraki gezegenin halkasına
girerse yakalanır (yön yaklaşma tarafına göre) → +1, kamera yukarı kayar → ıskalarsa ekrandan
çıkar, oyun biter → devam et / tekrar oyna.

## Zorluk eğrisi

| Gezegen | Halka yarıçapı | Dikey aralık (halkalar arası boşluk) | Dönüş hızı |
|---|---|---|---|
| 0–10 | ~70 | 55–100 | 1,7–2,3 rad/sn |
| 10–40 | ~64 | 60–120 | 1,9–2,7 rad/sn |
| 70+ | ~54 | 100–145 | 2,9–3,3 rad/sn |

## Özellik listesi (v1.0)

- [x] Sabit adımlı deterministik fizik (`game.ts`), tohumlu sonsuz gezegen üretimi
- [x] Teğet bırakma, halka yakalama, yaklaşma yönüne göre dönüş yönü
- [x] Kusursuz yakalama + kombo parıltısı, yıldız toplama (+1)
- [x] Yumuşak kayan kamera, paralaks yıldız alanı, iz, noktalı halkalar, parlayan pastel gezegenler
- [x] Rekor kaydı, tur başına 1 devam (ödüllü), oyun sonu ekranı
- [x] Ses (kit `tone`), titreşim (yakalama/kaybetme), ayarlar: ses, titreşim, gizlilik, sürüm
- [x] TR / EN, `<html lang>`; Android geri tuşu ayarları kapatır; arka plana alınınca duraklar
- [x] Yeni rekorda mağaza değerlendirme isteği (kit, 30 günde bir)

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `game_start` | — | tur hunisi |
| `game_over` | `score, duration, continued` | zorluk ayarı, oturum süresi |
| `continue` | `score` | ödüllü reklam kabulü |
| `new_best` | `score` | ilerleme hissi |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| İlk turda ≥ 3 skor | ≥ %80 |
| D1 retention | ≥ %35 |
| D7 retention | ≥ %10 |
| Oturum başına tur | ≥ 5 |
| Devam teklifini kabul | ≥ %25 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük tohum (herkes aynı gezegen dizisi) + skor paylaşımı
- Uydu/iz kozmetikleri, "reklamları kaldır" IAP
- Ters dönen / hareket eden gezegenler (ileri seviye)

## Kontrol listesi durumu

Doğrulandı: 11 birim test (teğet bırakma, yakalama ve yön, kusursuz/kombo, yıldız, kaybetme +
tek devam, determinizm, 200 tohumda halka aralığı, 30 tohum × 11 seviyede ulaşılabilirlik,
25 gezegenlik otomatik tur), typecheck, build ve `scripts/e2e.mjs` ile 14 kontrol (başlama,
zamanlanmış dokunuşla 3 yakalama, oyun sonu, devam, tek devam sınırı, tekrar oyna, ayarlar,
yeniden yüklemede rekor), konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
