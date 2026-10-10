# Makas (EN: Switchyard) — Oyun Kartı

| | |
|---|---|
| **Tür** | Gerçek zamanlı ray/makas puzzle, seviye tabanlı (150 seviye) |
| **Referanslar** | Rail Maze, Train Switch / Railroad Switch tarzı hyper-casual oyunlar, Mini Metro (estetik) |
| **Hedef kitle** | Herkes — metinsiz oynanış, renk + şekil sembolleri (renk körlüğü dostu) |
| **Oturum** | 20–60 sn/seviye |
| **Platform** | iOS + Android (Capacitor), web |
| **Durum** | v1.0.0 — mağazaya hazır |

## Çekirdek döngü
Tünelden renkli trenler belirli aralıklarla çıkar ve raylarda kesintisiz ilerler. Oyuncu makaslara
dokunarak sol/sağ kolu seçer (net ok + tık animasyonu, pasif kol soluk çizilir). Tren kendi
rengindeki istasyona ulaşınca puan; yanlış istasyon ya da çarpışma = 1 can. 3 can, hedef N tren.
Yıldız = kalan can (devam kullanıldıysa 1). Tünelin üstündeki ışık sıradaki trenin rengini ve
geri sayımını gösterir.

## Zorluk eğrisi
2→7 istasyon, 2→6 renk, 1→6 makas, hız 1→2 birim/sn, aralık 4.4→1.6 sn; 25. seviyeden itibaren
ikinci tünel (birleşme noktasında çarpışma riski), 45+ farklı hızlı trenler (arkadan çarpma).

## Adalet
`generateLevel` deterministik; her seviye kusursuz yönlendiren bir "kâhin" simülasyonuyla doğrulanır:
hiç çarpışma yok, her tren kendi rengine ulaşabilir, aynı makası farklı yöne isteyen iki tren arasında
insan tepkisine yetecek süre (0.75–1.3 sn) var. 150 seviyenin hepsi testte kontrol edilir.

## Meta
Ana menü, seviye haritası, 3 günlük görev (`levels`, `stars`, `perfect`, `trains`), 7 günlük ödül,
mağaza (7 tema: Çayır, Gece hattı, Çöl, Kar, Neon, Oyuncak, Metro), duraklat/kazan/kaybet;
kaybedince video ya da jetonla devam (+1 can). AdMob + IAP test kimlikleriyle.

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, seviye 10'a ulaşma ≥ %50, oturum ≥ 6 dk.

## Analytics
`level_start`, `level_complete` (yıldız, can), `level_fail`, `continue`, meta olayları (kit).
