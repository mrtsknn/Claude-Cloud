# Wordlink — Oyun Kartı

| | |
|---|---|
| **Tür** | Kelime bulmaca (harf çarkı + çengel bulmaca), seviye tabanlı |
| **Referanslar** | Wordscapes (PeopleFun), Word Connect, Kelime Gezmece |
| **Hedef kitle** | Herkes — TR ve EN kelime paketleri, uygun olmayan kelimeler elle ayıklandı |
| **Oturum** | 1–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.2.0 — tutma katmanı: okuma dünyası inşası, can, galibiyet serisi, testere dişi zorluk + süreli seviyeler, yeni mekanik ritmi, haftalık lig, kartpostal albümü (v1.1: günün bulmacası, manzaralı bölümler, EN 930 / TR 620 seviye) |

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
5. **Günün bulmacası + seri:** herkes için aynı günlük bulmaca, seri sayacı, ay takvimi ve seri ödülleri
   (Wordscapes'in en güçlü geri getirme döngüsü). Takvim ve "seri 4" paylaşım metni viral kanca.
6. **Manzaralı bölümler:** her 10 seviye bir bölüm; 12 manzara × 4 gün saati = 48 farklı, kodla çizilmiş
   sahne (asset yok). Bölüm sonu kutlaması ve ödülü, oyuncuya kısa vadeli bir hedef verir.

## Çekirdek döngü

Ana menü → Oyna (ya da seviye haritasından seç) → çarktaki harfleri sürükleyerek birleştir →
kelime tabloya yerleşir → tüm kelimeler bulununca meta kazanma ekranı: yıldız (ipucusuz 3, 1–2 ipucu 2,
daha fazlası 1) ve `10 + yıldız×5` jeton (videoyla x2), bölüm ilerlemesi (10 nokta) ve Paylaş → sonraki seviye.
Bölümün 10. seviyesi ilk kez bitince önce **bölüm kutlaması** (konfeti, sıradaki manzaranın önizlemesi,
`100 + 5×bölüm` jeton, en çok 200), sonra kazanma ekranı. Jetonlar ipucuna harcanır (25); jeton yetmezse
mağazanın jeton sekmesi açılır (günde 5 ödüllü video, jeton paketleri).

**Günlük döngü:** ana menüde "Günün Bulmacası" kartı (takvim ikonunda bugünün tarihi, "Bugün · seri 4" /
"Çözüldü · seri 4", alev rozetiyle seri). Bulmaca çözülünce sonuç ekranı: süre, ipucu, seri; 30 jeton
(+10 ipucusuz), seri ödülü (3 gün 50, 7 gün 150, 30 gün ve her 30'un katı 500), ay takvimi (çözülen günler
işaretli), sıradaki bonusa kalan gün ve yeni bulmacaya kalan süre, Paylaş. Gün kaçırılınca seri sıfırlanır;
bugün henüz oynanmadıysa dünkü seri görünür kalır.

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, **inşa önizlemesi** (hero: inşa edilen bölge + "Sıradaki: Çiçek tarhı · ★ 1/2"
  düğmesi; kısa ekranlarda logo/slogan gizlenir), jeton, **can hapı** (kitin `topExtra` yuvası), ayarlar,
  **Lig** ve **Albüm** düğmeleri (kitin `homeButtons` yuvası), görev şeridi, "Seviye N" kartı, **"Günün Bulmacası" kartı** (kitin `endless`
  yuvası; ikon, alt yazı ve seri rozeti oyun tarafından boyanır), alt menü Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası:** EN 930 / TR 620 seviye, yıldızlı/kilitli; **her kelime dilinin ayrı haritası** var.
  Her 10 seviyenin başında bölüm başlığı (bölümün gökyüzü renkleri, ad, ★ x/30) kitin `levels.section`
  yuvasıyla; zor (turuncu) / çok zor (mor) seviyeler `levels.tag` ile rozetli. Haritanın uzunluğu
  `levels.count` alanı dil değişince güncellenerek ayarlanır.
- **Görevler:** standart `levels`, `stars`, `perfect` + oyuna özgü `words` (N kelime bul),
  `bonus` (N bonus kelime bul). **Günlük ödül:** 7 günlük takvim.
- **Mağaza:** 6 tahta/taş teması (`src/skins.ts`: Lagün, Kâğıt, Gece yarısı, Böğürtlen, Orman, Kor),
  videoyla ücretsiz jeton, başlangıç paketi, reklamsız, jeton paketleri, geri yükleme.
- **Bölümler ve manzara (`src/chapters.ts`):** sahne tam ekran SVG (gökyüzü gradyanı, güneş/ay, gece
  yıldızları, kutup ışığı şeritleri, 2–3 kat siluet: kıyı + deniz feneri, zirveler, şehir silueti + ışıklı
  pencereler, kumullar, çam ormanı, tepeler, adalar, buzul, kanyon, göl yansıması, vadi + nehir). Bölüm
  değişince çapraz geçiş. HUD'da "Kıyı · Akşam · 3/10"; kazanma ekranında bölüm satırı. Çark ve boş
  hücreler koyu cam: harfler her manzarada okunur.
- **Günün bulmacası (`src/daily.ts`):** yerel takvim tarihi → 2026-01-01'den gün sayısı → paketteki
  bulmaca (`dayNumber mod 366`; yıl boyunca tekrar yok). Herkes aynı gün aynı bulmacayı alır. Paket
  `src/levels/daily-<dil>.json` (366 bulmaca, 6–7 harf, 5–8 kelime; aynı harfli ana seviyenin kullanmadığı
  kelimeler tercih edilir), ilk açılışta tembel yüklenir. Süre yalnızca tahta görünür ve oynanabilirken
  işler (duraklat, arka plan, sayfalar durdurur). Yarım kalan günlük `wordlink.dailyRun.<dil>`, geçmiş
  `wordlink.daily` (400 güne budanır; seri iki dilde ortak).
- **Geri getirme:** ilk kazanmadan sonra (native) yumuşak soru "Günlük bulmaca hatırlatıcısı" → evet
  derse işletim sistemi izni ve `scheduleReminders` ile önümüzdeki 7 akşam 19.00 "Günün bulmacası seni
  bekliyor" (bugün çözüldüyse ya da saat geçtiyse yarından başlar; her açılışta ve günlük çözülünce
  yenilenir). Web'de sorulmaz.
- **Paylaşım:** kazanma ekranında ve günlük sonucunda `shareResult` ("Bugünün Wordlink bulmacasını
  ipucusuz çözdüm. Süre 1:42, seri 4 gün." + mağaza bağlantısı; `STORE_URL` yayın sonrası güncellenir).
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
| 401+ (v1.1) | 5 → 6 → 7 her bölümde | 4–6 / 5–8 / 6–9 |

`npm run levels -w games/wordlink` ile deterministik üretilir. **İlk 400 seviye bayt bayt aynı kalır**
(kayıtlı ilerleme bunlara işaret eder; test sha256 ile doğrular). 401 ve sonrası izin listesinde kalan
**her kullanılmamış harf kümesini** kullanır (hiçbir çark tekrar etmez): 7 harfli kümeler büyük ölçüde
bittiği için 5/6/7 harfli çarklar eşit oranda karıştırılır ve her bölüm içinde küçükten büyüğe dizilir.
Sonuç: **EN 930** (401+: 231×5, 155×6, 144×7), **TR 620** (148×5, 62×6, 10×7) seviye. TR'de 800 hedefi
izin listesi (1.282 kelime) yüzünden mümkün değil; daha fazlası için izin listesinin elle genişletilmesi
gerekir. Paketler dile göre ayrı yüklenir (gzip: EN 95 KB, TR 38 KB; günlük paket EN 43 KB, TR 26 KB).

## v1.2 — tutma katmanı (`docs/RETENTION.md`, kit `packages/kit/src/retention/`)

- **Kurma meta'sı — okuma dünyası (`src/garden.ts`):** 4 yer × 6 görev, her görev kodla çizilmiş bir SVG
  katmanı (özgün çizim, 320×200): Okuma Bahçesi (taş yol, bank, gölge ağacı, çiçek tarhı, sokak lambası,
  kitap kutusu), Kütüphane Salonu (kitaplık, halı, kemerli pencere, okuma masası, koltuk, avize), Çatı
  Terası (ahşap zemin, saksılar, ışık zinciri, minder + kitaplar, teleskop, okuma çadırı), Göl Kulübesi
  (iskele, saz/nilüfer, kulübe, kayık, kamp ateşi, ağaç salıncağı). Yerler 4 mevsim paletiyle döner, sonra
  romen rakamıyla tekrar: **64 bölge ≈ 1000 seviye**. Görev 1–3 yıldız (ilk bölge 1-1-2-2-2-3: ilk görev
  1. seviyeden sonra; sonra 17 yıldız ≈ 15 seviye/bölge). Bölge ödülü 150 + 25×bölge (en çok 400) jeton +
  1 kart paketi (her 4. bölge 2). İnşa yıldızı **yalnızca ilk geçişte**: normal/zor 1, çok zor 2.
- **Testere dişi zorluk (`src/difficulty.ts`):** yeni kelime eklenmez; her 10'luk bölümde denetlenmiş
  seviyelerin sırası değişir: bölümün en zoru 10. ("çok zor", mor rozet, 2× jeton, +2 inşa yıldızı,
  +1 kart paketi), ikinci en zoru 5. ("zor", turuncu, 1,5× jeton), kalan 8 seviye kendi sırasında; 1–3.
  öğretici seviyeler yerinde. Zorluk = harf sayısı×100 + cevap harfleri. Eski kayıt: yarım kalan seviye
  başka bir seviyeye denk gelirse sıfırdan başlar.
- **Kaybetme durumu = süre:** 20. seviyeden itibaren zor ve çok zor seviyeler saate karşı (zor 60 + 12×kelime
  sn, çok zor 45 + 10×kelime sn; HUD'da ⏱, son 15 sn kırmızı, son 5 sn tık sesi; duraklat/arka plan saati
  durdurur). Süre biterse kitin `showFail`'i: **ilk devam ödüllü video veya 100 jeton, sonra 200 / 400
  jeton** (+30 sn; `continueOffer`), serin varsa "vazgeçersen N galibiyetlik serin biter" uyarısı. Tekrar
  dene / Menü = **1 can gider + seri sıfırlanır**, deneme sayısı artar. Süreli seviyelerde "Baştan başla" yok.
- **Can:** 5 can, 30 dk'da 1 dolar (zaman damgasıyla, uygulama kapalıyken de), yalnızca ana seviyelerde;
  günün bulmacası her zaman ücretsiz. Can bitince Oyna → can sayfası: videoyla +1, 150 jetonla hepsi,
  "Günün Bulmacası (ücretsiz)". Başlangıç paketi (IAP) + **24 saat sınırsız can** (`onPurchase`).
- **Galibiyet serisi:** art arda kazanılan seviyeler 1/2/3 kademe → sonraki seviyeye 1/2/3 **bedava ipucu**
  (ipucu düğmesinde "×N"; kullanılmayan biter). Süreli seviyede vazgeçince sıfırlanır.
- **Yeni mekanik ritmi (`src/twists.ts`, ilk görüldüğü seviyede bir kez ipucu kartı):**

  | Seviye | Öğe | Kural |
  |---|---|---|
  | 20 | Saate karşı | zor/çok zor seviyelerde süre (yukarıda) |
  | 41 | Jetonlu taş | 2 taş; bir kelimeyle açılınca taş başına 5 jeton (ipucuyla açılan saymaz) |
  | 61 | Gizemli taş | "?" taşı, ipucu asla açmaz; yalnızca kelimeyle açılır |
  | 81 | Kilitli kelime | asma kilitli kelime 2 (6+ kelimelik seviyede 3) başka kelime bulununca açılır |

  Tanıtımdan sonra normal seviyelerin ~%40'ında bu üç tahta öğesinden biri (seviye numarasından
  deterministik); zor seviyelerde yalnızca süre. Sonraki adaylar: süreli bonus kelime, buzlu taş.
- **Haftalık lig:** 30 kişilik grup (deterministik botlar, gerçek zamana bağlı puan eğrisi), puan = bu hafta
  ilk kez geçilen seviye + günün bulmacası. Pazartesi 00.00'da sonuç: ilk 5 yükselir, son 5 düşer
  (Bronz → Gümüş → Altın → Safir → Yakut → Elmas), ödül sıraya göre (1.: 200 jeton + 2 paket …, lig
  kademesiyle artar). Sonuç sayfası yeni haftanın ilk ana menü açılışında kendiliğinden çıkar.
- **Albüm — kartpostallar:** 12 set = bölümlerin 12 manzarası; bir setin 9 kartı aynı manzaranın gün
  saatleri ("Kıyı · Akşam II"; çizim `sceneSvg`, asset yok). Paket = 3 kart (ilk kart yeni garantili,
  pakette tekrar yok); tekrar → toz (5/15/40), tozla seçilen kart (40/100/250). Set ödülü 150 + 25×set
  jeton. Paket kaynakları: çok zor seviye, bölüm sonu, günün bulmacası, bölge ödülü, lig.
- **Reklam değeri:** devam (video), can (+1 video), jetonsuz ipucu → "Bedava ipucu (video)" ya da
  jeton mağazası, kazanma ekranında 2× (kit). Geçiş reklamı politikası: 3. seviyeden sonra, en sık 2
  kazanmada bir, kaybettikten hemen sonra ve kaybın ardından ilk kazanmada asla (`createInterstitialPolicy`).
- **Kazanma ekranı (kit `extra` + `buttons` yuvaları):** bölüm satırı (zor/çok zor noktalar renkli),
  kazanımlar (+N ★ inşa, +1 kart paketi, N galibiyet serisi), Paylaş · **İnşa et** (yapılabilir görev
  varsa; ana menüde inşa ekranını açar) · Menü.

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

## v1.1

- [x] Günün bulmacası: tarihe bağlı, herkese aynı; süre, seri, ay takvimi, seri ödülleri (3/7/30), çözülmüş kart
- [x] Bölümler: 10'ar seviye, 48 kodla çizilmiş manzara, HUD + kazanma ekranında bölüm, haritada bölüm başlıkları,
      bölüm sonu kutlaması + ödül
- [x] İçerik: EN 400 → 930, TR 400 → 620 seviye (ilk 400 değişmedi)
- [x] Akşam 19.00 hatırlatıcısı (ilk kazanmadan sonra yumuşak soru, native), paylaşım (kazanma + günlük)
- [x] Cila: sürüklerken harf isabet yarıçapı daraltıldı (7 harfli çarkta düz çizgi aradaki harfi kapmıyordu),
      koyu cam çark/boş hücreler, 360×640'ta ana menü sığıyor (hero küçülür), günlük sonuç ekranı 360×640'a sığıyor

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start`, `level_win` (v1.1'de `level_complete`) | `level, lang, attempt, tier, bonus, hints, stars, continues, duration_s` | seviye hunisi, zorluk |
| `level_fail` | `level, attempt` | süreli seviyede kaybetme oranı (hedef zor %35–50) |
| `continue_offer`, `continue_accept` | `kind` (`ad` / `coins`), `level`, `price` | en değerli reklam noktası |
| `lives_empty` | — | can duvarı |
| `build_task`, `build_area` | `area, task` | kurma meta'sı ilerlemesi |
| `league_end` | `rank, tier, score` | lig katılımı |
| `album_set` | `set` | koleksiyon |
| `twist_intro` | `twist, level` | yeni mekanik hunisi |
| `level_restart` | `level, lang` | zor seviyeler |
| `home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap` | — | meta etkileşimi, monetizasyon |
| `word_found`, `bonus_word` | `level, len` | etkileşim |
| `hint` | `level, how` (`coins` / `ad` / `streak`) | takılınan seviyeler |
| `language` | `lang` | dil tercihi |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |
| `daily_start`, `daily_complete` | `lang, resumed` / `streak, time_s, hints, bonus` | günlük bulmaca hunisi, seri |
| `chapter_complete` | `chapter, lang` | bölüm hunisi |
| `share_tap`, `share` | `placement` (`level_win`, `daily`) | viral döngü |
| `reminder_opt_in`, `reminder_opt_out`, `reminders_scheduled` | — | bildirim izni oranı |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %45 (kelime oyunları kategorinin üstünde tutar) |
| D7 retention | ≥ %20 |
| Oturum başına seviye | ≥ 4 |
| Seviye başına ipucu | ≤ 0,5 |
| Günlük bulmaca katılımı (DAU içinde) | ≥ %35 |
| Hatırlatıcıya evet | ≥ %50 (yumuşak sorudan sonra) |
| D30 retention | ≥ %8 (seri ödülleri) |

## Sonraki sürüm fikirleri (v1.1+)

- Seri koruyucu (jetonla kaçırılan günü kurtarma), günlük bulmaca liderlik tablosu
- TR izin listesini genişletip 800+ seviyeye çıkmak
- Kelime anlamı gösterme (TDK/Wiktionary tanımları, çevrimdışı paket)
- Daha fazla dil (DE, ES) — aynı build scripti, yeni izin listesi gerekir

## Kontrol listesi durumu

**v1.2:** kit tutma katmanı 18 birim testi (can yenilenmesi/saat geri alma, seri, inşa, lig haftası/botlar/
yükselme/düşme/sunucu sağlayıcı, albüm paketleri/toz/set, devam fiyatı, geçiş reklamı politikası) + Wordlink
9 test (oynanış sırası her bölümde permütasyon, 10. en zor / 5. ikinci; saat 20'den; öğeler deterministik ve
geçerli, ipucu gizemli/kilitli taşı atlar; 64 bölge × 6 görev, her görevin çizimi ve TR/EN adı). `scripts/e2e.mjs`
127 kontrol (v1.1 akışı + inşa önizlemesi ve ekranı, lig tablosu, paket açma, harita rozetleri, seri bedava
ipucu, jetonsuz ipucu → video/mağaza, 20. seviye: ipucu kartı, saat, video devam +30 sn → 200 jetonlu devam →
tekrar dene = −1 can ve seri sıfır, can bitince Oyna → can sayfası, jetonlu/gizemli taş, kilitli kelime,
hafta sonu lig sonucu + Gümüş'e yükselme, analytics olayları), konsol hatasız. 360×640 ve 430×932'de ana menü,
inşa, lig, albüm/paket, can, süreli seviye/kaybetme, öğeler, kazanma ekranı ve harita gözle incelendi.

Kodla yapılabilen her madde tamam ve doğrulandı (v1.1): 38 birim/veri testi — her dört pakette (EN/TR
ana + günlük) her seviye için cevaplar izin listesinde, harflerden kurulabilir, tablo çakışmasız ve tek parça,
bonus kelimeler cevapları tekrar etmiyor; ilk 400 seviyenin sha256'sı v1.0 ile aynı; çark tekrar etmiyor;
bölüm içi zorluk sırası; günlük tohum determinizmi (DST, ay/yıl sonu, epoch öncesi), seri mantığı, seri
ödülleri, takvim, bölüm gruplama/adları/sahne. Typecheck, build ve `scripts/e2e.mjs` ile 73 kontrol
(v1.0 akışı + harita bölüm başlıkları, HUD bölüm satırı, kazanma ekranında Paylaş + bölüm ilerlemesi,
hatırlatıcı sorusu bir kez, günlük bulmaca: kart → gerçek kaydırmayla çöz, süre işler / duraklatınca durur,
yarım kalan devam eder, 3 günlük seri + 50 bonus, takvim, Paylaş, çözülmüş kart; 10. seviyede bölüm kutlaması
+ 100 jeton → kazanma ekranı → 2. bölüm), konsol hatasız. 1–20. seviyeler 360×640 ve 430×932'de gerçek
kaydırmayla oynandı (tahta/çark ekranda, HUD metni taşmıyor, kazanma ekranı son kelimeden ~1,15 sn sonra).

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.wordlink`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore ile AAB imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, Manifest/Info.plist) ve IAP ürünleri
      (`starter_pack`, `remove_ads`, `coins_small`, `coins_large`) mağaza konsollarında
- [ ] Play Console / App Store Connect: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
