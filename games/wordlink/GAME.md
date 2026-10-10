# Wordlink — Oyun Kartı

| | |
|---|---|
| **Tür** | Kelime bulmaca (harf çarkı + çengel bulmaca), seviye tabanlı |
| **Referanslar** | Wordscapes (PeopleFun), Word Connect, Kelime Gezmece |
| **Hedef kitle** | Herkes — TR ve EN kelime paketleri, uygun olmayan kelimeler elle ayıklandı |
| **Oturum** | 1–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- Kelime oyunları en geniş yaş bandına sahip mobil kategorilerden; Wordscapes yıllardır
  en çok kazanan puzzle oyunları arasında. Oyuncu kitlesi kadın/erkek dengeli, 25–65 ağırlıklı.
- Türkçe pazarda "Kelime Gezmece" gibi örneklerin başarısı yerel dilde güçlü talep olduğunu
  gösteriyor; çoğu global rakip Türkçe sunmuyor ya da makine çevirisi kelime listesi kullanıyor.
- Rakip yorumlarındaki başlıca şikâyetler: **anlamsız/garip kelimeler**, **uygunsuz kelimeler**,
  her seviyeden sonra reklam. Wordlink'in farkı bu üçü üzerine kurulu.

## Farklılaşma

1. **Elle gözden geçirilmiş cevaplar:** tabloda çıkan her kelime `scripts/reviewed-<dil>.txt`
   izin listesinden geliyor (EN 1.857, TR 1.282 kelime; hepsi tek tek okundu). Küfür, hakaret,
   alkol, şiddet, din, özel adlar ve kısaltmalar çıkarıldı; testler bunu her build'de doğruluyor.
2. **İki dil, ayrı ilerleme:** cihaz diline göre başlar; ayarlardan TR/EN değiştirilebilir.
3. **Bonus kelimeler:** tabloda olmayan geçerli kelimeler yıldız sayacını doldurur; her 10'da 25 jeton.
4. **Adil yardım:** ipucu en kısa bulunmamış kelimenin ilk gizli harfini açar.

## Çekirdek döngü

Ana menü → Oyna (ya da seviye haritasından seç) → çarktaki harfleri sürükleyerek birleştir →
kelime tabloya yerleşir → tüm kelimeler bulununca meta kazanma ekranı: yıldız (ipucusuz 3, 1–2 ipucu 2,
daha fazlası 1) ve `10 + yıldız×5` jeton (videoyla x2) → sonraki seviye. Jetonlar ipucuna harcanır (25);
jeton yetmezse mağazanın jeton sekmesi açılır (günde 5 ödüllü video, jeton paketleri).

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, kelime dilini izleyen mini harf çarkı + taş animasyonu (hero), jeton, ayarlar,
  görev şeridi, "Seviye N" kartı, alt menü Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası:** 400 seviye, yıldızlı/kilitli; **her kelime dilinin ayrı haritası** var.
- **Görevler:** standart `levels`, `stars`, `perfect` + oyuna özgü `words` (N kelime bul),
  `bonus` (N bonus kelime bul). **Günlük ödül:** 7 günlük takvim.
- **Mağaza:** 6 tahta/taş teması (`src/skins.ts`: Lagün, Kâğıt, Gece yarısı, Böğürtlen, Orman, Kor),
  videoyla ücretsiz jeton, başlangıç paketi, reklamsız, jeton paketleri, geri yükleme.
- **Oyun içi:** HUD'daki duraklat düğmesi → `meta.showPause` (devam, baştan, ayarlar, menü);
  kelime dili (TR/EN) meta ayarlarında `extraSettings` satırı. HUD jeton hapı mağazayı açar.
- **Dil başına ilerleme, ortak jeton:** tek kit profili (`wordlink.profile`) jeton, görev, günlük ödül
  ve temaları tutar; profilin `stars`/`unlocked` alanları her zaman aktif dili yansıtır. Her dilin
  haritası `wordlink.map.<dil>` anahtarında saklanır; dil değişince bu kopya profile yüklenir.
  Yarım kalan seviye durumu yine `wordlink.progress.<dil>`.
- **v1.0'dan geçiş:** eski `wordlink.coins` profile aktarılır; her dilde ulaşılan seviyeye kadar
  harita açılır (geçilen seviyeler 1 yıldız).
- **Reklam/IAP:** `initAds()` + `initStore()` (test kimlikleri), AdMob test uygulama kimliği
  AndroidManifest ve Info.plist'te.

## Zorluk eğrisi

| Seviye | Harf | Tablodaki kelime |
|---|---|---|
| 1–3 | 4 | 2–3 (öğretici) |
| 4–10 | 4 | 3–4 |
| 11–35 | 5 | 4–6 |
| 36–110 | 6 | 5–8 |
| 111–400 | 7 | 6–9 |

Her dil için 400 seviye, `npm run levels -w games/wordlink` ile deterministik üretilir.
Seviye paketleri dile göre ayrı yüklenir (gzip: TR 28 KB, EN 48 KB).

## Özellik listesi (v1.0)

- [x] Harf çarkında kaydırarak kelime kurma; geri kaydırınca son harf silinir; iz çizgisi
- [x] Çengel bulmaca tablosu; bulunan kelimeler sırayla açılır, tekrar bulunan kelime parlar
- [x] Geçersiz kelimede önizleme sallanır; bonus/tekrar/doğru için ayrı renk ve ses
- [x] Bonus kelimeler + yıldız sayacı + bulunan bonus kelimeler listesi
- [x] Jeton ekonomisi (profil jetonu): seviye 10 + yıldız×5, bonus 10'luk +25, ipucu −25, mağazada video/paket
- [x] Karıştır, ipucu (en kısa kelimenin ilk gizli harfi; harflerle tamamlanan kelime bulunmuş sayılır)
- [x] 1–2. seviyelerde oyuncu duraksarsa el animasyonu en kısa kelimeyi çizer
- [x] TR/EN kelime paketi seçimi, dile göre ayrı ilerleme; Türkçe büyük harf (İ/ı) doğru
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm, sözlük atıfları (lisans gereği)
- [x] Android geri tuşu, status bar, splash, dikey yön kilidi, safe-area
- [x] Mağaza değerlendirme isteği (6. seviyeden sonra), geçiş reklamı 5. seviyeden sonra (meta "Sonraki")
- [x] Meta katmanı: ana menü, harita, görevler, günlük ödül, mağaza (6 tema), duraklat, kazanma ekranı

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start`, `level_complete` | `level, lang, bonus, hints, stars, duration_s` | seviye hunisi, zorluk |
| `level_restart` | `level, lang` | zor seviyeler |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | — | meta etkileşimi, monetizasyon |
| `word_found`, `bonus_word` | `level, len` | etkileşim |
| `hint` | `level` | takılınan seviyeler |
| `language` | `lang` | dil tercihi |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %45 (kelime oyunları kategorinin üstünde tutar) |
| D7 retention | ≥ %20 |
| Oturum başına seviye | ≥ 4 |
| Seviye başına ipucu | ≤ 0,5 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük bulmaca ve seri sayacı
- Kelime anlamı gösterme (TDK/Wiktionary tanımları, çevrimdışı paket)
- Daha fazla dil (DE, ES) — aynı build scripti, yeni izin listesi gerekir

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı: 11 birim/veri testi (her iki dilde 400 seviyenin
tamamı için: cevaplar izin listesinde, harflerden kurulabilir, tablo çakışmasız ve tek parça,
bonus kelimeler cevapları tekrar etmiyor), typecheck, build ve `scripts/e2e.mjs` ile 40 kontrol
(ana menü → günlük → mağaza → görevler → harita → 1. seviyeyi gerçek kaydırmayla çöz → kazanma →
sonraki → ipucu profil jetonu harcar → dil değişimi ayrı ilerleme → duraklat → yeniden yükleme), konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.wordlink`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, Manifest/Info.plist) ve IAP ürünleri
      (`starter_pack`, `remove_ads`, `coins_small`, `coins_large`) mağaza konsollarında
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
