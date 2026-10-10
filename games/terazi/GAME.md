# Terazi (Balance) — Oyun Kartı

| | |
|---|---|
| **Tür** | Tork/denge puzzle, seviye tabanlı |
| **Referanslar** | Balance puzzle'ları (Libra, "Weigh"), Tetrobot denge bölümleri, mobil sayı/terazi bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, nötr taş-pirinç estetik |
| **Oturum** | 30 sn–2 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 + meta katmanı — mağazaya hazır (bkz. kontrol listesi) |

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
- [x] Su terazisi kabarcığı (rengi doğrudan torktan: bir şey asılı ve tork 0 → yeşil), sol/sağ tork göstergesi, kazanınca halka + çan
- [x] Tahta her yarı açıklıkta (±3…±6) ekran genişliğini kullanır; ağırlık rakamları en az 14 px
- [x] Geri al, ipucu (seviyede ilki ücretsiz, sonra 40 jeton ya da ödüllü video; kilitli), yeniden başlat
- [x] 1. seviyede kayan parmak öğretici + kısa ipucu metni; 30. seviyede yığma bildirimi
- [x] Her hamlede kayıt, yeniden açılışta devam; kazanma anında ilerleme kaydedilir
- [x] TR/EN (`<html lang>`); açık zemin status bar
- [x] Değerlendirme isteği 8. seviyeden sonra

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, jeton, ayarlar (ses, titreşim, satın alımları geri yükle, gizlilik, sürüm),
  görev şeridi, "Seviye N" kartı, alt menü Seviyeler · Görevler · Günlük · Mağaza.
  Kahraman görseli: sallanıp dengeye oturan küçük terazi (sol 3×2 = sağ 2×3), kabarcık yeşile döner;
  seçili malzemenin renkleriyle çizilir.
- **Seviye haritası:** 150 seviye, yıldızlı, kilitli. **Günlük ödül:** 7 günlük takvim.
- **Görevler (günde 3):** standart `levels`, `stars`, `perfect` + oyuna özgü `weights` (N ağırlık as)
  ve `balanced` (ipucusuz N seviye dengele).
- **Mağaza — malzemeler (`src/skins.ts`):** Pirinç (varsayılan), Ahşap 300, Mermer 500, Şeker 500,
  Taş 800, Yeşim 1200 — tahta, ayak, ağırlık, çivi renkleri; sabit ağırlıklar her temada koyu arduvaz.
  Jeton sekmesi: günde 5 video, başlangıç paketi, reklamsız, jeton paketleri.
- **Oyun içi:** HUD'daki duraklat → `meta.showPause` (devam, yeniden başlat, ayarlar, menü);
  kazanınca `meta.showWin` (yıldız, 10 + yıldız×5 jeton, videoyla x2, sonraki/menü; geçiş reklamı
  kit tarafından 5. seviyeden sonra sınırlı).
- **Reklam/IAP:** `initAds()` + `initStore()` açılışta (test kimlikleri); AdMob test uygulama kimliği
  AndroidManifest ve Info.plist'te (`NSUserTrackingUsageDescription` dahil).
- **Kayıt göçü:** v1.0'ın `terazi.stars` / `terazi.completed` anahtarları ilk açılışta profile
  (`terazi.profile`) aktarılır; devam eden seviye (`terazi.save`) aynen korunur.

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, weights, resumed` | seviye hunisi |
| `level_complete` | `level, moves, stars, hints, duration_s` | zorluk ayarı |
| `restart` | `level, moves` | zor seviyeleri bulma |
| `hint` | `level, n, paid (free/coins/video)` | yardım kullanımı, ipucu ekonomisi |
| `undo` | `level` | yardım kullanımı |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | — | meta hunisi (kit) |
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

## Kontrol listesi durumu

Kodla yapılabilen maddeler tamam: birim testler (150 seviyenin kurgu + çözücü doğrulaması dahil),
typecheck, build ve `scripts/e2e.mjs` ile 46 kontrol: ana menü → günlük ödül → mağaza (malzeme
al + kullan) → görevler → harita → 1. seviyeyi gerçek sürüklemeyle çözme → meta kazanma ekranı
(3 yıldız, +25 jeton) → sonraki → dokunarak geri alma, geri al, ücretsiz ve 40 jetonluk ipucu →
duraklat → yeniden yüklemede ilerleme → 120. seviye (±6, yığma) → torktan türeyen kabarcık →
v1.0 kayıt göçü; konsol hatasız. Mağaza görselleri ana menü dahil 4 sahne × 2 dil × 3 boyut.

Hesap sahibine kalanlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive
- [ ] Mağaza: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
- [ ] AdMob: gerçek uygulama/birim kimlikleri (`initAds({ units, testing: false })`, Manifest, Info.plist)
- [ ] IAP ürünleri Play Console / App Store Connect'te kit kimlikleriyle (`starter_pack`, `remove_ads`, `coins_small`, `coins_large`)
