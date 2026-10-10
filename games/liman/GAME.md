# Liman (Harbor Load) — Oyun Kartı

| | |
|---|---|
| **Tür** | Konteyner yükleme / istifleme puzzle, seviye tabanlı |
| **Referanslar** | Parking Jam, Ball Sort, "cargo/stack" mantık bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, renk + şekil ile renk körlüğü uyumu |
| **Oturum** | 30 sn – 2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- Sıralama/istifleme puzzle'ları (sort, jam, stack) puzzle kategorisinin en çok indirilenleri
  arasında; kural basit, oturum kısa, yaş/cinsiyet dağılımı dengeli.
- Türün çoğu "renkleri grupla" üzerine kurulu; **iki kurallı istif** (boşaltma sırası +
  denge) mağazada az bulunan, "zeka" konumlanmasına uygun bir açı.
- Yorumlardaki başlıca şikâyetler: çözülemeyen seviyeler, her seviyede reklam, belirsiz
  kurallar. Liman: her seviye çözücüyle doğrulanır, kurallar canlı görsel geri bildirimle öğretilir.

## Farklılaşma

1. **Metinsiz öğreten kurallar:** yanlış istiflenen kutu anında kırmızı çerçeve alır, gemi
   ağır tarafa yatar, denge göstergesi kırmızıya döner.
2. **Her seviye çözülebilir:** önce geçerli bir yükleme kurulur, sonra rıhtım karıştırılır;
   testler 150 seviyenin hepsini çözücüyle ve tam "par" hamlede doğrular.
3. **Erişilebilirlik:** her limanın rengi + şekli var (daire, üçgen, kare, yıldız).
4. **Ödüllendirici final:** "Yola çık" ile gemi rotayı izler, her limanda vinçler o limanın
   kutularını indirir.

## Çekirdek döngü

Rıhtımdaki kutuya dokun → gemide sütuna dokun → vinç bırakır (gemi denge değişimini gösterir)
→ tüm kutular yüklendi → Yola çık → kurallar tutuyorsa sefer animasyonu + yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Liman | Kutu | Sütun | Ağırlık | Tolerans |
|---|---|---|---|---|---|
| 1 | 2 | 4 | 3 | 1 | ±2 (öğretici) |
| 2–8 | 2 | 5 | 3–4 | 1–2 | ±2 |
| 9–40 | 3 | 6–8 | 4–5 | 1–3 | ±2 → ±1 |
| 41–90 | 4 | 7–10 | 5 | 1–3 | ±1 / 0 |
| 91–150 | 4 | 10–14 | 6 | 1–3 | ±1 / 0 |

Sütun yüksekliği (3–5) ile boş kapasite seviye ilerledikçe daralır. 150'den sonra seviyeler döngüye girer.

## Özellik listesi (v1.0)

- [x] Tohumlu seviye üretimi + çözücü (testte 150 seviye doğrulanır), par = kutu sayısı
- [x] Dokun-seç / dokun-yerleştir; üstteki kutu başka sütuna ya da rıhtıma geri taşınabilir
- [x] Canlı kural gösterimi: kırmızı çerçeve, yatan gemi, kırmızı denge göstergesi
- [x] Vinç animasyonu, sefer animasyonu (limanlarda boşaltma), korna ve "clank" sesleri, titreşim
- [x] Geri al (sınırsız, yıldız düşürür), ipucu (ilki ücretsiz, sonrası ödüllü), yeniden başlat
- [x] Yıldız: temiz ve par hamlede 3; geri al/ipucu −1, fazla hamle −1
- [x] 1. seviyede el animasyonlu öğretici
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ayarlar: ses, titreşim, gizlilik bağlantısı, sürüm; TR/EN (`<html lang>`)
- [x] Geçiş reklamı 5. seviyeden sonra (kit frekans sınırı), değerlendirme isteği 8. seviyeden sonra

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, boxes, resumed` | seviye hunisi |
| `level_complete` | `level, moves, stars, hints, duration_s` | zorluk ayarı |
| `sail_fail` | `level, rule` (`order` / `balance` / `both`) | hangi kural zorluyor |
| `restart`, `undo`, `hint` | `level` (+ `moves` / `n`) | yardım kullanımı |
| `ad_*`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 5 |
| `sail_fail` / seviye (ilk 20) | ≤ 0,5 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük sefer + seri sayacı
- Soğutmalı / tehlikeli yük gibi ek kurallar (yalnız belirli sütunlara)
- Gemi temaları (kozmetik IAP), "reklamları kaldır" IAP

## Kontrol listesi durumu

Kodla yapılabilen maddeler tamam: 10 birim test (sıra kuralı, denge, hamleler, 150 seviyenin
çözülebilirliği, determinizm), typecheck, build ve `scripts/e2e.mjs` ile headless tarayıcıda
19 kontrol (öğretici, 1–3. seviyeleri gerçek dokunuşlarla çözme, kırmızı ihlal gösterimi,
sefer + kazanma, geri al, ipucu, geçersiz gemi yola çıkmaz, yeniden yüklemede ilerleme), konsol hatasız.

Hesap sahibinin yapacakları:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ve imzalı AAB
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
