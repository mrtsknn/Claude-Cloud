# Oyuncuyu Tutma (Retention) Katmanı

Neden var: v1 oyunlar güzel ama 10–15 dakikada bitiyordu. Oyuncunun **geri dönmesi**,
**saatlerce oynaması** ve **reklamı isteyerek izlemesi** için tasarlanmış ortak katman.
Kod: `packages/kit/src/retention/`. Her derin oyun bu beş parçayı kullanır.

## 1. Kurma meta'sı (ana uzun vadeli hedef)
- Seviye kazanınca **yıldız** (1 seviye = 1 yıldız, kazanca bağlı) gelir; yıldızlar bir "yer"in
  adımlarına harcanır (Royal Match / Gardenscapes modeli).
- Her oyunun kendi teması: bölge (area) → 5–8 görev (task, 1–3 yıldız). Bölge bitince yeni bölge
  açılır, büyük ödül + kutlama. Görsel her adımda değişir (SVG/canvas katmanları açılır).
- Ana menüde kahraman (hero) olarak bu yer gösterilir: "Sonraki adım: Çeşme · ⭐2".
- Hedef: oyuncunun her oturum sonunda "bir adım daha" demesi. 1 bölge ≈ 15–25 seviye.

## 2. Yeni mekanik ritmi
- Her ~20 seviyede yeni bir öğe/engel tanıtılır (ilk göründüğü seviye kolay ve öğretici).
- Her oyun `GAME.md` içinde mekanik takvimini tutar (seviye → yeni öğe).

## 3. Zorluk dalgası + kaybedince devam
- Zorluk düz artmaz: testere dişi. Her 5. seviye "zor", her 10. "çok zor" (rozetli, daha çok ödül).
- Hedef ilk denemede kaybetme oranı: normal %10–20, zor %35–50.
- Kaybedince: "+5 hamle / +süre" — 1. sefer ödüllü reklam veya jeton, sonrası artan jeton.
- **Can sistemi:** 5 can, kaybedince 1 gider, 30 dk'da 1 dolar; reklamla 1 can, jetonla full.
  Reklamsız/premium satın alanlara sınırsız can süresi paketleri (IAP).

## 4. Kazanma serisi + haftalık lig
- Kazanma serisi: art arda kazanınca bir sonraki seviyeye başlangıç bonusu (1/2/3 kademe);
  kaybedince sıfırlanır → kaybetmemek için reklamla devam etme motivasyonu.
- Haftalık lig: 30 kişilik grup (deterministik botlar, gerçekçi isim/puan eğrileri), puan =
  kazanılan seviye. Pazar gecesi sonuç: ilk 5 yükselir, son 5 düşer; ödül kademeli.
  (İleride gerçek sunucuya geçebilecek arayüzle yazılır.)

## 5. Albüm / koleksiyon
- Seviye ve bölge ödüllerinden kart paketleri. 9 kartlık setler; set bitince jeton + kozmetik.
- Tekrar gelen kartlar "yıldız tozu"na döner (sonradan istenen kartı almak için).

## Reklam ve satın alma noktaları (öncelik sırası)
1. Kaybedince devam (en yüksek gelir), 2. can doldurma, 3. ödülü 2x yapma (kazanma ekranı),
4. günlük çark/ücretsiz paket. Geçiş reklamı: 3. seviyeden sonra, en sık 2 seviyede bir,
kazanma ekranından sonra; kaybettikten hemen sonra **asla**.
IAP: reklamsız, başlangıç paketi (jeton + 24 saat sınırsız can), jeton paketleri.

## API kullanımı (kit `packages/kit/src/retention/`, örnek: `games/wordlink/src/main.ts`)

Saf mağazalar (DOM yok, Vitest'li; hepsi `{ game, storage?, now? }` alır, `<game>.<ad>` anahtarına yazar,
bozuk kayıtta varsayılana döner, `onChange(fn)` verir):

```ts
import { createLives, createWinStreak, createBuild, createLeague, createAlbum, continueOffer,
  createInterstitialPolicy, createBuildHero, openBuildScreen, createLivesPill, openLivesSheet,
  openLeague, showLeagueResult, openAlbum, streakFlames, RICON } from '@studio/kit';

const lives = createLives({ game });            // count, canPlay(), lose(), add(1), refill(), grantUnlimited(ms), nextInMs()
const streak = createWinStreak({ game });       // win(), fail(), tier (0..3) → oyun bonusu seçer
const build = createBuild({ game, areas });     // areas: [{ id, tasks: [{ id, cost }], reward: { coins, packs } }]
                                                // addStars(n), build(taskId), areaComplete(), claimArea()
const league = createLeague({ game });          // addScore(1), standings(), pendingResult(), claimResult()
                                                // opponents?: LeagueOpponents → sunucu botların yerine geçer
const album = createAlbum({ game, sets });      // sets: [{ id, reward }], 9 kart/set; addPacks, openPack, buyCard, claimSet
const ads = createInterstitialPolicy();         // createMeta({ interstitial: ads, ... })
```

Ekranlar kitin meta sayfasında açılır (`meta` = `SheetHost`), tema `meta.css` değişkenlerinden:

```ts
const ui = { build, art: (k) => ({ viewBox, base, layers: { [taskId]: svg }, spots: { [taskId]: [x, y] } }),
  areaName: (area, k) => '…', taskName: (area, id) => '…', onReward: (r) => { profile.addCoins(r.coins); album.addPacks(r.packs ?? 0); } };
createMeta({ hero: createBuildHero(ui, () => openBuildScreen(meta, ui)),
  topExtra: createLivesPill(lives, () => openLivesSheet(meta, lives, { refillPrice: 150, spendCoins: (n) => profile.spend(n) })),
  homeButtons: [{ id: 'league', icon, label, onClick: () => openLeague(meta, league, onReward) },
                { id: 'album', icon: RICON.cards, label, badge: () => album.packs || null, onClick: () => openAlbum(meta, albumUi) }],
  levels: { count, play, canPlay: () => lives.canPlay() || (openLivesSheet(…), false) }, … });
// kazanınca: streak.win(); ilk geçişte build.addStars(1), league.addScore(1); meta.showWin({ …, extra, buttons })
// kaybedince: meta.showFail({ level, offer: continueOffer(used), attempt, onContinue, onRetry: () => { lives.lose(); streak.fail(); … } })
// açılışta: league.pendingResult() && showLeagueResult(meta, league, onReward)
```

Kurallar: inşa yıldızı / lig puanı yalnızca ilk geçişte (tekrar oynayarak çiftçilik yok); günlük bulmaca
can harcamaz; süreli seviyede "baştan başla" verilmez (kaybetmeden kaçış olmasın). Olaylar mağazalardan
otomatik atılır (`build_task`, `build_area`, `lives_empty`, `league_end`, `album_set`; `continue_*` ve
`level_fail` meta `showFail`'den); `level_start/level_win(level, attempt)` oyunun işi.

## Ölçüm
Olaylar: `level_start/level_win/level_fail(level, attempt)`, `continue_offer/accept(kind)`,
`build_task(area, task)`, `league_end(rank)`, `album_set(set)`, `lives_empty`.
Hedef KPI: D1 %40, D7 %15, oturum ≥ 3/gün, ödüllü reklam ≥ 2/DAU.
