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

Çarktaki harfleri sürükleyerek birleştir → kelime tabloya yerleşir → tüm kelimeler bulununca
seviye biter (+10 jeton) → sonraki seviye. Jetonlar ipucuna harcanır (25), jeton bitince ödüllü
video +40 verir.

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
- [x] Jeton ekonomisi: seviye +10, bonus 10'luk +25, ipucu −25, ödüllü video +40
- [x] Karıştır, ipucu (en kısa kelimenin ilk gizli harfi; harflerle tamamlanan kelime bulunmuş sayılır)
- [x] 1–2. seviyelerde oyuncu duraksarsa el animasyonu en kısa kelimeyi çizer
- [x] TR/EN kelime paketi seçimi, dile göre ayrı ilerleme; Türkçe büyük harf (İ/ı) doğru
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm, sözlük atıfları (lisans gereği)
- [x] Android geri tuşu, status bar, splash, dikey yön kilidi, safe-area
- [x] Mağaza değerlendirme isteği (6. seviyeden sonra), geçiş reklamı 7. seviyeden sonra

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start`, `level_complete` | `level, lang, bonus, hints, duration_s` | seviye hunisi, zorluk |
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

- Günlük bulmaca, seri sayacı ve tema arka planları
- Kelime anlamı gösterme (TDK/Wiktionary tanımları, çevrimdışı paket)
- Daha fazla dil (DE, ES) — aynı build scripti, yeni izin listesi gerekir

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı: 11 birim/veri testi (her iki dilde 400 seviyenin
tamamı için: cevaplar izin listesinde, harflerden kurulabilir, tablo çakışmasız ve tek parça,
bonus kelimeler cevapları tekrar etmiyor), typecheck, build ve `scripts/e2e.mjs` ile gerçek
kaydırma hareketleriyle 15 kontrol, konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.wordlink`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
