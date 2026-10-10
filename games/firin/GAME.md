# Fırın (EN: Bake Rush) — Oyun Kartı

| | |
|---|---|
| **Tür** | Zaman yönetimi arcade, seviye tabanlı (hybrid-casual) |
| **Referanslar** | Cooking Fever, Diner Dash, Good Pizza Great Pizza (sadeleştirilmiş) |
| **Hedef kitle** | Herkes — 4+, nötr unsurlar (ekmek, simit, kruvasan, pasta, kurabiye), metinsiz oynanış |
| **Oturum** | 90 sn/seviye |
| **Platform** | iOS + Android (Capacitor), web |
| **Durum** | v1.0.0 |

## Pazar analizi
- Yemek/servis "time management" türü yıllardır en çok indirilen casual alt türlerden; tek tıkla
  anlaşılır, seviye başı kısa oturum, kozmetik/tema satışına çok uygun.
- Rakiplerin şikâyet aldığı noktalar: karmaşık upgrade ağaçları, enerji sistemi, agresif reklam.
  Fırın: upgrade yok, enerji yok; tek ilerleme yıldız + kozmetik fırın temaları.

## Çekirdek döngü
Hamur istasyonuna dokun → boş fırına girer (ilerleme halkası) → altın rengine dönünce dokun → tepsiye
(3 yer) → müşteriye dokun → siparişindeki eşleşen ürünler teslim → sipariş tamamsa ödeme + bahşiş.
Fazla bekleyen ürün yanar (dokununca çöpe). Sabır çubuğu biten müşteri gider, kombo sıfırlanır.
Hedef: 90 sn'de X jeton; yıldızlar 1× / 1,3× / 1,6× hedef. Kaybedince devam = +20 sn.

## Zorluk (120 seviye, `levelConfig`)
| Seviye | Ürün | Fırın | Müşteri yeri | Sipariş | Yanma süresi |
|---|---|---|---|---|---|
| 1 | 2 | 3 | 2 | 1 | 6 sn |
| 12 | 3 | 4 | 3 | 1–3 | ~5,7 sn |
| 25+ | 5 | 4 | 4 | 1–3 | → 2,5 sn |
Sabır 30 → 18 sn, varış aralığı 6 → 3,4 sn. Müşteriler seed'li: herkesin 37. seviyesi aynı.
**Doğrulama:** `game.test.ts` her 120 seviyeyi açgözlü bir botla (0,6 sn tepki) oynatır; hepsi
1 yıldız hedefini geçer, yavaş bot (1,2 sn) son seviyede geçemez.

## Meta
Ana menü, seviye haritası, 3 günlük görev (`levels`, `stars`, `perfect`, `served`, `combo`),
7 günlük ödül, mağaza: 6 fırın teması (tente rengi + zemin karosu), video ile jeton, IAP.
Duraklat / kazan (x2 video) / kaybet (jeton ya da video ile devam).

## KPI hedefleri
D1 ≥ %35, D7 ≥ %12, oturum ≥ 6 dk, seviye 10'a ulaşma ≥ %50.

## Analytics
`game_start`, `game_over` (level, coins, served, stars), `continue`, meta olayları (kit).

## ASO
Bkz. `store/listing.md`.
