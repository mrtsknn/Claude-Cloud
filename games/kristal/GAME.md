# Kristal (Snowflake) — Oyun Kartı

| | |
|---|---|
| **Tür** | Simetri / "Lights Out" türevi mantık bulmacası, seviye tabanlı |
| **Referanslar** | Lights Out, Flow Free, Infinity Loop, simetri boyama uygulamaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, sakin tempo |
| **Oturum** | 30 sn – 2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

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
4. **Dürüst ipucu:** çözücüden gelen gerçek hamle; ilki ücretsiz, sonrası ödüllü reklam.

## Çekirdek döngü

Hedef kar tanesine bak → hücreye dokun (6/12 kopyada değişir, komşular dalgalanır) →
kar tanesi hedefle aynı → parıltı, dönerek düşüş, akor → yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Halka (hücre) | Kural | Rastgele dokunuş |
|---|---|---|---|
| 1–6 | 3 (6) | aç/kapa | 2–4 |
| 7–14 | 4 (10) | aç/kapa | 3–6 |
| 15–24 | 3 (6) | + komşular | 1–3 |
| 25–39 | 4 (10) | + komşular | 2–5 |
| 40–54 | 4 (10) | + komşular + ayna | 2–4 |
| 55–89 | 5 (15) | + komşular | 3–7 |
| 90–119 | 5 (15) | + komşular + ayna | 3–6 |
| 120–150 | 6 (21) | + komşular + ayna | 4–8 |

Yıldız: dokunuş ≤ par → 3, ≤ par + max(2, ⌈par/2⌉) → 2, aksi 1.

## Özellik listesi (v1.0)

- [x] 150 deterministik seviye, GF(2) çözücü, her seviye par dokunuşla doğrulanmış
- [x] Kristal hücreler (parıltı, faset), dokunuşta dalga halkaları, arka planda kar yağışı
- [x] Kazanınca parıltılar, kar tanesi dönerek ekrandan düşer; akor sesi
- [x] Köşede hedef önizleme + "Taslak" düğmesiyle hedef çerçeve katmanı
- [x] Geri al (sınırsız), ipucu (ilki ücretsiz, sonrası ödüllü), yeniden başlat
- [x] 1. seviyede el animasyonlu öğretici; 15 ve 40'ta yeni kural bildirimi
- [x] Her dokunuşta kayıt; kazanma anında ilerleme kaydı; devam etme
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm; TR / EN (`<html lang>`); Android geri tuşu
- [x] 5. seviyeden sonra geçiş reklamı anı, 8. seviyeden sonra değerlendirme isteği

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, resumed` | seviye hunisi |
| `level_complete` | `level, taps, par, stars, hints, duration_s` | zorluk ayarı |
| `hint` | `level, hints` | yardım kullanımı |
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
- Renkli kristal temaları (kozmetik IAP), "reklamları kaldır" IAP
- Bitmiş kar tanelerinden koleksiyon galerisi

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 12 birim test (simetri eşlemesi, aç/kapa kuralları, GF(2)
çözücü ve kaba kuvvet karşılaştırması, 150 seviyenin par ile çözülmesi, determinizm),
typecheck, build ve `scripts/e2e.mjs` ile 20 kontrol (öğretici, 1–3. seviye gerçek dokunuşla,
komşu kuralı seviyesi 15, ayna seviyesi 40, kazanma, geri al, ipucu, taslak, yeniden yüklemede
ilerleme), konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
