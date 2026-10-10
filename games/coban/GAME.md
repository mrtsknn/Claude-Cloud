# Çoban (EN: Herd) — Oyun Kartı

| | |
|---|---|
| **Tür** | Gerçek zamanlı sürü yönetimi, hybrid-casual, seviye tabanlı |
| **Referanslar** | Sheepdog / "Herding" hyper-casual oyunları, Flock!, Shepherd's Crossing mini oyunları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, şiddet yok (kurtlar yalnızca korkutur) |
| **Oturum** | 30–120 sn/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır |

## Pazar analizi
- "Herd/sheep" hyper-casual başlıkları düzenli olarak top listelere giriyor; mekanik tek
  parmakla anlaşılır, oyuncu ilk 3 saniyede ne yapacağını görür.
- Rakiplerde şikâyetler: rastgele/çözülemez haritalar, reklam bombardımanı, kötü kontrol.
  Çoban'da her harita üretimde **erişilebilirlik testinden** geçer, kontrol doğrudan (köpek parmağı takip eder).

## Çekirdek döngü
Parmağını sürükle → köpek koşar → koyunlar kaçar (boids: ayrılma, birleşme, kaçma) →
hepsini kapıdan ağıla sok → kalan süreye göre 1–3 yıldız → jeton → sonraki seviye.
Süre biterse: video ya da artan fiyatlı jetonla +15 sn devam.

## Zorluk eğrisi (120 seviye, tohumlu üretim)
| Seviye | Koyun | Engeller |
|---|---|---|
| 1–6 | 3 | yok (öğretici ipucu) |
| 7–24 | 4–6 | çalı, çit, gölet |
| 12+ | + kara koyun (yavaş kaçar) | |
| 25+ | + kurt (kenarda devriye, koyunları korkutur; köpek kovalar) | |
| 70+ | 2 kurt, 2–3 kara koyun, 16'ya kadar koyun | 4 çit, 3 gölet, 5 çalı |

## Teknik
- `src/game.ts`: saf, sabit adımlı (1/60 s), tohumlu RNG ile deterministik simülasyon.
- Üretici: ağıl kapısından BFS ile tüm koyunlara ve köpeğe erişim garanti; koyun ağılda/engelde doğmaz.
- Test: `src/game.test.ts` — 120 seviyenin geçerliliği, determinizm, kaçma, kara koyun, çarpışma,
  süre/devam, yıldızlar ve **bot 1–5. seviyeleri süresi içinde bitirir**.

## Meta
Ana menü, seviye haritası, 3 günlük görev (`levels`, `stars`, `perfect`, `sheep`), 7 günlük ödül,
mağaza: 7 köpek görünümü (Border Collie, Golden, Kangal, Husky, Shiba, Çikolata Labrador, Dalmaçyalı),
video ile jeton, IAP (başlangıç paketi, reklamsız, jeton paketleri). AdMob test kimlikleri.

## KPI hedefleri
D1 ≥ %40, D7 ≥ %12, oturum ≥ 6 dk, 10. seviyeye ulaşma ≥ %50.
Analytics: `game_start`, `level_start`, `level_win`, `level_lose`, `game_over`, `continue`.

## ASO
Bkz. `store/listing.md`.
