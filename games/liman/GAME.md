# Liman (Harbor Load) — Oyun Kartı

| | |
|---|---|
| **Tür** | Konteyner yükleme / istifleme puzzle, seviye tabanlı |
| **Referanslar** | Parking Jam, Ball Sort, "cargo/stack" mantık bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, renk + şekil ile renk körlüğü uyumu |
| **Oturum** | 30 sn – 2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1 — meta katmanı (ana menü, harita, görevler, günlük ödül, mağaza), AdMob + IAP |

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
2. **Her seviye çözülebilir ama düşündürür:** önce geçerli bir yükleme kurulur, sonra rıhtım
   karıştırılır; testler 150 seviyenin hepsini çözücüyle ve tam "par" hamlede doğrular.
   6\. seviyeden itibaren "açgözlü" yükleme (rıhtımı soldan sağa al, her kutuyu sırayı bozmayan ve
   dengeyi en iyi düzelten sütuna koy) gemiyi yola çıkarabiliyorsa rıhtım yeniden karıştırılır
   (`greedySolves`, `GREEDY_FROM`).
3. **Erişilebilirlik:** her limanın rengi + şekli var (daire, üçgen, kare, yıldız).
4. **Ödüllendirici final:** "Yola çık" ile gemi rotayı izler, her limanda vinçler o limanın
   kutularını indirir.

## Çekirdek döngü

Rıhtımdaki kutuya dokun → gemide sütuna dokun → vinç bırakır (gemi denge değişimini gösterir)
→ tüm kutular yüklendi → Yola çık → kurallar tutuyorsa sefer animasyonu + yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Liman | Kutu | İstif yüksekliği | Sütun | Ağırlık | Tolerans |
|---|---|---|---|---|---|---|
| 1–6 | 2 | 4–5 | 3 | 3–4 | 1–2 | ±2 (öğretici) |
| 7–30 | 2–3 | 5–7 | 3–4 | 3–4 | 1–2 | ±2 → ±1 |
| 31–80 | 3–4 | 7–10 | 3–5 | 3–5 | 1–3 | ±1 |
| 81–150 | 4 | 10–14 | 3–5 (çoğu 4–5) | 4–5 | 1–3 | ±1 / 0 |

İstif yüksekliği zorlukla birlikte 3'ten 5'e çıkar (katman başına desen, `HEIGHT_PATTERN`);
sütun sayısı kapasiteyi (kutu + boşluk) karşılayacak kadar seçilir, boşluk ilerledikçe daralır.
v1.0'da yükseklik neredeyse her zaman 3'tü. Oyun 150 seviyede biter (sonrası ana menü).

## Özellik listesi (v1.0)

- [x] Tohumlu seviye üretimi + çözücü (testte 150 seviye doğrulanır), par = kutu sayısı
- [x] Dokun-seç / dokun-yerleştir; üstteki kutu başka sütuna ya da rıhtıma geri taşınabilir
- [x] Canlı kural gösterimi: kırmızı çerçeve, yatan gemi, kırmızı denge göstergesi
- [x] Vinç animasyonu, sefer animasyonu (limanlarda boşaltma), korna ve "clank" sesleri, titreşim
- [x] Geri al (sınırsız, yıldız düşürür), ipucu (her seviyede ilki ücretsiz, sonrası 40 jeton ya da ödüllü video), yeniden başlat (ücretsiz ipucu yeniden açılmaz)
- [x] Yıldız: temiz ve par hamlede 3; geri al/ipucu −1, fazla hamle −1
- [x] 1. seviyede el animasyonlu öğretici
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] TR/EN (`<html lang>`), değerlendirme isteği 8. seviyeden sonra

## Meta katmanı (v1.1, `@studio/kit` meta)

- **Ana menü:** "Liman / Harbor Load" logosu, istifli konteynerleriyle dalgada sallanan küçük gemi
  (seçili temada çizilir), jeton, ayarlar, görev şeridi, Seviye kartı; alt menü Seviyeler · Görevler · Günlük · Mağaza
- **Seviye haritası:** 150 seviye, yıldızlı/kilitli
- **Görevler (günde 3):** `levels`, `stars`, `perfect` (kit) + `containers` (N konteyner yükle; başarılı seferde
  yüklenen kutu sayısı kadar) ve `voyages` (N kez yola çık)
- **Mağaza:** 7 gemi + konteyner teması (`src/skins.ts`: Klasik, Mercan, Rıhtım, Kutup, Gece, Yük gemisi, Neon);
  gövde, güverte şeridi ve 4 liman rengi değişir, liman şekilleri ve kırmızı hata renkleri sabit kalır.
  Video ile jeton, başlangıç paketi, reklamsız, jeton paketleri, geri yükleme
- **Oyun içi:** HUD duraklat → `meta.showPause` (devam, yeniden başla, ayarlar, menü);
  kazanınca `meta.showWin` (yıldız, 10 + yıldız×5 jeton, videoyla x2, hamle/par satırı); geçiş reklamı kitte
- **v1.0 ilerlemesi:** `liman.stars` ve `liman.save` bir kez profile taşınır (yıldızlar, açılan seviye);
  eski üreticiyle kaydedilmiş yarım gemi yeni seviyeyle uyuşmazsa seviye yeniden dağıtılır
- **Native:** `@capacitor-community/admob`, `@capgo/native-purchases`; AdMob TEST kimlikleri
  AndroidManifest ve Info.plist'te (+ `NSUserTrackingUsageDescription`) — yayın öncesi gerçekleriyle değiştir

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, boxes, resumed` | seviye hunisi |
| `level_complete` | `level, moves, stars, hints, duration_s` | zorluk ayarı |
| `sail_fail` | `level, rule` (`order` / `balance` / `both`) | hangi kural zorluyor |
| `restart`, `undo`, `hint`, `hint_coins` | `level` (+ `moves` / `n`) | yardım kullanımı |
| `progress_migrated` | `completed, unlocked` | v1.0 → v1.1 geçişi |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | — | meta (kit) |
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

## Kontrol listesi durumu

Kodla yapılabilen maddeler tamam: 13 birim test (sıra kuralı, denge, hamleler, açgözlü kontrol,
6–150 arası hiçbir rıhtımın açgözlü yüklenemediği, 3–5 istif yüksekliği, 150 seviyenin
çözülebilirliği, determinizm), typecheck, build ve `scripts/e2e.mjs` ile headless tarayıcıda
45–47 kontrol (görev kontrolleri günün görevlerine bağlı; ana menü + kahraman çizimi, günlük ödül, mağazada tema alıp kuşanma, görevler, harita,
1. seviyeyi gerçek dokunuşlarla çözme, sefer, kit kazanma ekranı ve jeton, sonraki seviye, duraklat,
ücretsiz + 40 jetonluk ipucu, kırmızı yanlış istif, yeniden yüklemede ilerleme, v1.0 geçişi), konsol hatasız.
Mağaza görselleri: `scripts/screenshots.mjs` (4 sahne × TR/EN × 3 boyut, ana menü dahil; "kurallar"
sahnesi artık kırmızı yanlış-istif çerçevesini gösterir).

Hesap sahibinin yapacakları:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ve imzalı AAB
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
- [ ] AdMob: gerçek uygulama/birim kimlikleri (`initAds({ units, testing: false })`, manifest, Info.plist)
- [ ] IAP ürünleri (kit `PRODUCTS` kimlikleriyle) Play Console / App Store Connect'te
