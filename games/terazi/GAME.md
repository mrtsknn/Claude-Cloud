# Terazi (Balance) — Oyun Kartı

| | |
|---|---|
| **Tür** | Tork/denge puzzle, seviye tabanlı |
| **Referanslar** | Balance puzzle'ları (Libra, "Weigh"), Tetrobot denge bölümleri, mobil sayı/terazi bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, nötr taş-pirinç estetik |
| **Oturum** | 30 sn–2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- "Sakin mantık" puzzle'ları (sort, block, nonogram) geniş ve dengeli bir kitleye sahip; kaldıraç/tork
  mekaniği okulda herkesin gördüğü, bir bakışta anlaşılan bir fizik kuralı.
- Mağazada denge oyunları çoğunlukla fizik-kaos (üst üste yığma) türünde; **kesin çözümlü, sakin
  tork bulmacası** boşluğu var.
- Şikâyetler: çözülemeyen seviyeler, agresif reklam, "tahmin et" hissi. Terazi her seviyeyi
  kurgu gereği çözülebilir üretir ve sağ/sol torkunu açıkça gösterir.

## Farklılaşma

1. **Kanıtlı çözüm:** seviye önce sıfır torklu bir çözümden kurulur, sonra ağırlıklar karıştırılıp
   tepsiye verilir; testlerde 150 seviyenin hepsi çözücüyle de doğrulanır.
2. **Bariz ayna çözümü elenir:** sabit torku 0 olup ağırlıkları eş çiftlere ayrılan seviyeler reddedilir.
3. **Okunur matematik:** tahtada mesafeler yazılı, iki uçta sol/sağ tork toplamı, su terazisi kabarcığı.
4. **Adil ipucu:** ilki ücretsiz, doğru ağırlığı doğru çiviye takıp kilitler.

## Çekirdek döngü

Tepsiden ağırlığı sürükle (kalkar, hayalet önizleme) → çiviye bırak (tok tahta sesi, tahta yaylanarak
eğilir) → yanlışsa ağırlığa dokunup geri al → tüm ağırlıklar asılı ve tork 0 → kabarcık yeşil, çan
sesi → yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Çivi (±N) | Ağırlık | Sabit | Kapalı çivi | Yığma |
|---|---|---|---|---|---|
| 1 | 3 | 2 (öğretici) | 0 | 0 | — |
| 2–10 | 3 | 3–4 | 0–1 | 0 | — |
| 11–29 | 4 | 4–5 | 1 | 0 | — |
| 30–60 | 5 | 4–6 | 1–2 | 1 | ✓ |
| 61–100 | 6 | 5–6 | 1–2 | 1–2 | ✓ |
| 101–150 | 6 | 6–7 | 2 | 2 | ✓ |

Yıldız: hamle (yerleştirme + geri alma) ≤ par (ağırlık sayısı) → 3, ≤ par+2 → 2, diğer → 1.

## Özellik listesi (v1.0)

- [x] Tohumlu, deterministik 150 seviye; kurgu + çözücü doğrulaması
- [x] Sürükle-bırak (parmağın üstüne kaldırma, hayalet önizleme, çiviye mıknatıs), yay animasyonlu eğilme
- [x] Yerleşen ağırlık sallanır; dokununca tepsiye döner; sabit (taş) ağırlıklar, kapalı çiviler, yığma
- [x] Su terazisi kabarcığı, sol/sağ tork göstergesi, seviyede yeşil + halka + çan
- [x] Geri al, ipucu (ilki ücretsiz, sonra ödüllü reklam; kilitli), yeniden başlat
- [x] 1. seviyede kayan parmak öğretici + kısa ipucu metni; 30. seviyede yığma bildirimi
- [x] Her hamlede kayıt, yeniden açılışta devam; kazanma anında ilerleme kaydedilir
- [x] Ayarlar: ses, titreşim, gizlilik, sürüm; TR/EN (`<html lang>`); açık zemin status bar
- [x] Geçiş reklamı 5. seviyeden sonra (kit sınırlı), değerlendirme isteği 8. seviyeden sonra

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, weights, resumed` | seviye hunisi |
| `level_complete` | `level, moves, stars, hints, duration_s` | zorluk ayarı |
| `restart` | `level, moves` | zor seviyeleri bulma |
| `hint`, `undo` | `level` | yardım kullanımı |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 5 |
| Seviye 30'a ulaşma | ≥ %30 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük terazi + seri sayacı; 150 sonrası sonsuz mod
- Çift kollu / iki pivotlu tahtalar; negatif (balon) ağırlıklar
- "Reklamları kaldır" IAP, tahta temaları

## Kontrol listesi durumu

Kodla yapılabilen maddeler tamam: 13 birim test (150 seviyenin kurgu + çözücü doğrulaması dahil),
typecheck, build ve `scripts/e2e.mjs` ile 18 kontrol (öğretici, 1–3. seviyeleri gerçek
sürüklemeyle çözme, kazanma, yıldız, dokunarak geri alma, geri al, ipucu, 120. seviye yığma,
yeniden yüklemede ilerleme), konsol hatasız.

Hesap sahibine kalanlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive
- [ ] Mağaza: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
