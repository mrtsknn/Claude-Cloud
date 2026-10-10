# Meta katmanı (her oyunda zorunlu)

Bir mobil oyun sadece oynanış ekranı değildir. Her oyun `@studio/kit` içindeki ortak meta
katmanını kullanır (`packages/kit/src/meta/`). Referans: mrtsknn/sigdir.

## Olması gerekenler
- **Ana menü** (açılışta): logo, jeton, ayarlar, görev şeridi, mod kartları (Seviyeler ve/veya Sonsuz), alt menü: Seviyeler · Görevler · Günlük · Mağaza
- **Seviye haritası** (yıldızlı, kilitli), **3 günlük görev**, **7 günlük ödül takvimi**
- **Mağaza**: görünümler (oyuna özgü skin/tema, en az 6), video ile ücretsiz jeton (günde 5), uygulama içi satın alma (başlangıç paketi, reklamsız, jeton paketleri), satın alımları geri yükleme
- **Oyun içi**: duraklat butonu → `meta.showPause`; kazanınca `meta.showWin` (yıldız + jeton + videoyla x2); kaybedince `meta.showLose` (artan fiyatlı devam: jeton ya da video)
- **Reklam/IAP**: `initAds()` + `initStore()` açılışta (test kimlikleriyle); yayın öncesi gerçek kimlikler

## Entegrasyon (özet)
```ts
import { createProfile, createMeta, initAds, initStore } from '@studio/kit';
const profile = createProfile({ game: 'oyun', levelCount: 150, defaultSkin: 'classic', skinIds: SKINS.map(s => s.id),
  missions: [ { id: 'levels', targets: [2,3,5], reward: n => 20 + n*10 }, { id: 'stars', targets: [4,6,9], reward: n => 20 + n*5 },
              { id: 'perfect', targets: [1,2,3], reward: n => 30 + n*10 }, /* + oyuna özgü görevler: profile.progress('id', n) */ ] });
const meta = createMeta({ title, tagline, version, privacyUrl, profile, skins: SKINS, onSkin: applySkin,
  levels: { count: 150, play: (n) => startLevel(n) }, endless: { play: startEndless },   // en az biri
  missionText: (id, n) => t(`mission_${id}`, { n }), settings, onSettings });
void initAds(); void initStore();
meta.showHome();
// Oyun içi: kazanınca  meta.showWin({ level, stars, coins: 10 + stars*5, onNext: () => startLevel(level+1) })
//           kaybedince (sonsuz) meta.showLose({ score, coins, continuesUsed, canContinue, onContinue, onRetry })
//           seviye başarısız  meta.showFail({ level, reason, continuesUsed?, onContinue?, onRetry })  (rekora dokunmaz)
// Android geri: setupNative({ onBack: () => meta.back() || (!meta.covering && (pause(), true)) })
//   (ana menüdeyken false döner → uygulama arka plana alınır)
```
İlk sonuç ekranından sonra `firstRun` otomatik kapanır (günlük ödül sonraki menü açılışında kendiliğinden açılır).
`showPause({ onResume, onRestart? })`: idle oyunlarda `onRestart` verilmez. `endless.subtitle` kart alt yazısını değiştirir.
Standart görev kimlikleri meta tarafından otomatik ilerletilir: `levels`, `stars`, `perfect` (showWin), `games` (showLose).
Tema: `:root { --m-bg; --m-ink; --m-card; --m-muted; --m-accent; --m-accent-ink; --m-alt; --m-font; --m-home-ink; --m-strip }` (bkz. meta.css).
Açık renkli ana menüde `--m-home-ink` koyu bir renge ayarlanır.

## Native
- Oyunun `package.json` bağımlılıklarına `@capacitor-community/admob` ve `@capgo/native-purchases` eklenir (cap sync native eklentiyi ancak böyle görür).
- AndroidManifest `<application>` içine AdMob test uygulama kimliği:
  `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-3940256099942544~3347511713"/>`
- iOS Info.plist: `GADApplicationIdentifier` = `ca-app-pub-3940256099942544~1458002511`, `NSUserTrackingUsageDescription`.
- Yayın öncesi: gerçek AdMob kimlikleri `initAds({ units, testing: false })`, ürünler Play Console / App Store Connect'te aynı kimliklerle.

## Geri getirme ve yayılma (kit `engage.ts`)
- `scheduleReminders([{ id, title, body, dailyHour: 19 }])`: günlük ödül, can/enerji dolumu, idle üretim dolması gibi
  hatırlatmalar. İzni ilk ekranda değil, iyi bir anda iste (ör. ilk kazanmadan sonra). Native için oyuna
  `@capacitor/local-notifications` bağımlılığı eklenir.
- `shareResult({ title, text, url })`: skor/eser paylaşma (native paylaşım sayfası, web'de Web Share ya da kopyalama).
  Native için `@capacitor/share` eklenir. Metne mağaza bağlantısı koy. `imageDataUrl` verilirse resim de paylaşılır
  (native için ayrıca `@capacitor/filesystem`).
