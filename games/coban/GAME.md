# Çoban (EN: Herd) — Oyun Kartı

| | |
|---|---|
| **Tür** | Gerçek zamanlı sürü yönetimi, hybrid-casual, seviye tabanlı + sonsuz mod |
| **Referanslar** | Sheepdog / "Herding" hyper-casual oyunları, Flock!, Shepherd's Crossing mini oyunları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, şiddet yok (kurtlar yalnızca korkutur) |
| **Oturum** | 20–90 sn/seviye, Sonsuz koşu 1–3 dk |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1.0 — havlama, yeni hayvanlar, köpek eğitimi, Sonsuz koşu, paylaşma/hatırlatma |

## Pazar analizi
- "Herd/sheep" hyper-casual başlıkları düzenli olarak top listelere giriyor; mekanik tek
  parmakla anlaşılır, oyuncu ilk 3 saniyede ne yapacağını görür.
- Rakiplerde şikâyetler: rastgele/çözülemez haritalar, reklam bombardımanı, kötü kontrol.
  Çoban'da her harita üretimde **erişilebilirlik testinden** geçer ve **bot ile süre testinden**
  geçer (aşağıda); kontrol doğrudan (köpek parmağı takip eder).
- Kısa video için: havlama şok dalgası (sürü yelpaze gibi açılır), kaz sürüsünün hızlı kaçışı,
  keçinin çitten atlaması ve Sonsuz koşunun "son anda kurtarma" anları kendiliğinden klip üretir;
  sonuç ekranında **Paylaş** düğmesi skorla birlikte mağaza bağlantısı gönderir.

## Çekirdek döngü
Parmağını sürükle → köpek ivmelenerek koşar → hayvanlar kaçar (boids: ayrılma, birleşme, kaçma;
köşeye sıkışan hayvan duvar boyunca yana kayar) → **Havla** (4 sn dolum) ile geniş alandaki
hayvanları ileri savur → hepsini kapıdan ağıla sok → kalan süreye göre 1–3 yıldız → jeton →
köpeği eğit → sonraki seviye. Süre biterse: video ya da artan fiyatlı jetonla +15 sn devam.

## Yenilikler ve kademeli tanıtım (her biri bir kez, **metinsiz** resimli ipucuyla)
| Seviye | Yeni şey | Davranış |
|---|---|---|
| 1 | sürükle | "köpek parmağı takip eder" ipucu |
| 3 | **Havla** | sağ alt düğme (Boşluk tuşu da); yarıçap içindeki hayvanlar 0,7 sn panikle köpekten uzağa koşar, kurtları kaçırır; şok dalgası + ses + haptik |
| 8 | kuzu | annesini izler; anne ağıldaysa kendisi kapıya yönelir |
| 12 | kara koyun | yavaş ve inatçı |
| 16 | çamur | köpeği ve hayvanları yavaşlatır |
| 20 | keçi | alçak çitlerin üstünden atlar, daha başına buyruk |
| 25 | kurt | kenarda devriye, koyunları korkutur; köpek ya da havlama kovar |
| 32 | kapı düğmesi | ağıl kapısı kapalı; köpek pati düğmesine basınca açılır (ip çizgisi düğmeyi kapıya bağlar) |
| 40 | kaz | hızlı, sıkı küme halinde kaçar |
Sonraki seviyeler bunları dönüşümlü karıştırır (her seviyede hepsi yok → çeşitlilik).

## Zorluk ve adalet
- Ağıl üst kenardaki çit/çalı sırasına gömülü: hayvan ağılın arkasına kaçamaz. Alan köşeleri
  çalıyla yuvarlatılmış; gölet/çalı/çitler kenarlara ve birbirine ≥56 px koridor bırakır
  (çıkmaz cep yok).
- **Bot (test + demo):** gruplar halinde güder — kapıya *yürüme mesafesi* (BFS alanı) en uzak
  grubu seçer, grubun ağırlık merkezinin kapıya giden yolun tersine (arkasına) geçer, yanlış
  taraftaysa grubu geniş bir yörüngeyle dolaşır (içinden geçmez), duvar dibinde itme açısını
  döndürür, sıkışınca geri çekilip sürünün sakinleşmesini bekler; arkaya hizalanınca havlar.
- **Süre limitleri** her hayvanın kapıya yürüme mesafesinden + engel/özel hayvan sayısından
  hesaplanır ve bota göre ayarlandı: bot 120 seviyenin hepsini bitirir, ortalama sürenin ~%24'ünü,
  en kötü seviyede %71'ini kullanır. `game.test.ts` her seviyenin **en az %15 süre artarak**
  bittiğini doğrular.

## Modlar ve meta
- **Seviyeler (120)**, harita, yıldızlar.
- **Sonsuz koşu** (meta `endless` kartı): hayvanlar dalgalar halinde kenardan gelir (dalga
  büyür, aralık kısalır; kuzu, kara koyun, kaz, keçi, kurt eklenir). Her hayvanın 40 sn sabrı var
  (son 8 sn kırmızı halka); 3 hayvan kaçarsa biter. Skor = ağıla sokulan; rekor meta'da.
  Ağıldaki hayvan 1,4 sn sonra çıkar (ağıl dolmaz). Devam: +1 kaçma hakkı.
- **Köpek eğitimi** (ana menüde, alınabilir yükseltme varsa kırmızı nokta): Hız (+%5/kademe),
  Havlama menzili (+13 px), Havlama dolumu (−0,3 sn); 5 kademe, 40/80/150/250/400 jeton.
- Görevler: `levels`, `stars`, `perfect`, `sheep`, `barks`, `rush` (+ `games` meta tarafından).
- 7 günlük ödül, mağaza: 7 köpek görünümü, video ile jeton, IAP. AdMob test kimlikleri.
- **Geri getirme:** ilk kazanmadan sonra `scheduleReminders` ile her gün 19:00 hatırlatma
  (izin ilk ekranda istenmez). **Yayılma:** kazanma ve Sonsuz koşu sonuç ekranında
  `shareResult` ile Paylaş (mağaza bağlantısı `STORE_URL`, yayında güncellenecek).

## Teknik
- `src/game.ts`: saf, sabit adımlı (1/60 s), tohumlu RNG ile deterministik simülasyon; olaylar
  (`pen`, `bark`, `gate`, `hop`, `escape`, `wave`) `state.events` ile UI'ya akar.
- Üretici: ağıl kapısından BFS ile tüm hayvanlara, köpeğe ve kapı düğmesine erişim garanti.
- `src/main.ts`: çizim (hayvanların yönü yumuşatılır → titreme yok), HUD, havlama düğmesi,
  ipucu resimleri oyunun kendi çizim fonksiyonlarıyla çizilir.
- Test: `src/game.test.ts` (21 test) — 120 seviyenin geçerliliği/koridorlar, özelliklerin doğru
  seviyede tanıtılması, **bot 120 seviyeyi ≥%15 süre artarak bitirir**, determinizm, ivme, kaçma,
  havlama yarıçapı/dolumu, keçi-çit, çamur, kuzu-anne, kapı düğmesi, yükseltmeler, Sonsuz koşu.
- `scripts/e2e.mjs`: 44 kontrol (gerçek sürükleme, havlama, eğitim, Sonsuz koşu, paylaş düğmeleri,
  360×640 ve 430×932 yerleşimi). `scripts/screenshots.mjs`: 6 sahne × en/tr × 3 boyut.

## KPI hedefleri
D1 ≥ %40, D7 ≥ %12, oturum ≥ 6 dk, 10. seviyeye ulaşma ≥ %50, paylaşım/kazanma ≥ %3,
Sonsuz koşu başlatan oyuncu ≥ %35.
Analytics: `game_start`, `level_start`, `level_win`, `level_lose`, `game_over`, `continue`,
`bark`, `upgrade`, `rush_start`, `rush_over`, `share`, `reminders_scheduled`.

## ASO
Bkz. `store/listing.md`.
