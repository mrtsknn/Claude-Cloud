# Devir Teslim — Bir Sonraki Ajan/Oturum İçin Yol Haritası

Bu dosya, bu repoda çalışacak yeni bir ajanın (veya insanın) **önce okuyacağı** yer. Sırayla
`CLAUDE.md` → bu dosya → `docs/META.md` → `docs/RETENTION.md`.

## Şu anki durum (2026-10)
- 23 oyun `games/*` altında: hepsi v1 (oynanış + meta katmanı + AdMob test kimlikleri + IAP +
  i18n tr/en + testler + mağaza görselleri + PRIVACY). Tablo: `README.md`.
- Derinleştirilen 5 aday (v1.1): **Wordlink, Snapgrid, Kovan, Çömlek, Çoban** — günlük bulmaca,
  bölümler/macera modu, hatırlatma bildirimi, paylaşma, efektler.
- Tutma katmanı (`docs/RETENTION.md`) kit'te hazır (`packages/kit/src/retention/`) ve **Wordlink v1.2**'de
  tam entegre (okuma dünyası inşası, can, seri, testere dişi zorluk + süreli seviyeler, yeni mekanik
  ritmi, lig, albüm). Sıradaki: Snapgrid'e aynı API ile uygulamak (2026-10-10: kredi bittiği için başlanıp durduruldu, sıfırdan yapılacak; ardından 5 oyunun telefon test linki yenilenecek) (rehber: RETENTION.md "API kullanımı").

## Strateji (neden böyle)
1. **Yeni oyun ekleme dönemi bitti.** 23 yüzeysel oyun yerine 2–3 derin oyun para kazanır.
   Yeni oyun ancak mevcutlar mağazada ölçüldükten sonra ve veriye dayanarak eklenir.
2. **Önce yayınla, sonra ölç.** Mağazaya çıkış sırası: Wordlink → Snapgrid → Kovan → Çömlek →
   Çoban. Her biri için ilk 2 hafta D1/D7, oturum süresi, ödüllü reklam/DAU izlenir.
3. **Karar kuralı:** D1 < %25 ise oyunu bırak/yeniden tasarla; D1 ≥ %35 ve D7 ≥ %10 ise içerik
   ve canlı etkinlik ekle, küçük ücretli kullanıcı edinimi (CPI testi) dene.
4. Benchmark: GameAnalytics medyan D1 %22 / D7 %4; ilk %10 D1 %40 / D7 %12. Casual ARPDAU
   $0.03–0.10.

## Yayına çıkış için insanın yapması gerekenler (ajan yapamaz)
- Google Play Console ($25) ve Apple Developer ($99/yıl) hesapları.
- AdMob hesabı: gerçek uygulama ve reklam birimi kimlikleri → `packages/kit/src/meta/monetize.ts`
  ve her oyunun `AndroidManifest.xml` / `Info.plist` dosyasındaki test kimliklerini değiştir.
- Mağazada IAP ürünleri: `remove_ads`, `starter_pack`, `coins_small`, `coins_large`.
- Android AAB: GitHub Actions → **Android build**. iOS: macOS + Xcode gerekir.
- Yayından sonra her oyunun `src/main.ts` içindeki `STORE_URL` yer tutucusunu gerçek linkle değiştir.

## Çalışma yöntemi (ajanlar için)
- Dal: tek geliştirme dalı; paralel işler git worktree'lerinde, bitince ana dala merge
  (`package-lock.json` çakışırsa `--ours` + `npm install`).
- Her değişiklikten sonra kökten: `npm run typecheck && npm test && npm run build`; oyunun
  `scripts/e2e.mjs`'i (önizleme sunucusu açıkken) ve ekran görüntülerini **gözle** incele.
- Native senkron: `npx cap sync` (oyun klasöründe). İkon için `tools/native-assets.sh`.
- Ortak ihtiyaç → kit'e (`packages/kit`), oyuna özel → oyuna. Kit değişince 23 oyunun build'i
  bozulmamalı.
- Kelime içeriği: Wordlink cevapları **yalnızca** elle denetlenmiş
  `games/wordlink/scripts/reviewed-{en,tr}.txt` listelerinden. Denetlenmemiş kelime eklenmez.
- Token tasarrufu: aynı işi iki ajana verme, gereksiz yeniden üretme (ekran görüntüsü vb.) yapma,
  kullanıcı Türkçe konuşur — yanıtlar Türkçe.

## Bilinen eksikler / kit borçları
- ~~Sonuç ekranlarına özel içerik / ekstra buton yuvası yok~~ → **düzeldi (v1.2):** `showWin/showFail/showLose`
  `extra` + `buttons` alır (Wordlink kullanıyor; diğer oyunlar hâlâ DOM'a ekliyor, taşınabilir).
- ~~`endless` kartı güncellenemiyor; harita başlık yuvası yok~~ → **düzeldi:** `meta.setEndless(...)`,
  `levels.section(n)` / `levels.tag(n)`.
- ~~Günlük bulmaca `showWin({level:0})` görev sayacını ilerletiyor~~ → **düzeldi:** `level <= 0` haritaya ve
  `levels/stars/perfect` görevlerine dokunmaz (Snapgrid'in günlüğü de otomatik düzeldi).
- Wordlink mağaza ekran görüntüleri v1.1'den (yeni ana menü yok); yayın öncesi yeniden çekilmeli.
- Lig botları istemci tarafında; gerçek sunucu için `LeagueOpponents` arayüzünü uygulayan sağlayıcı yazılmalı.
- `scheduleReminders` reddedilmiş izni her çağrıda tekrar istiyor (oyunlar yalnızca "evet" sonrası çağırıyor).
- Wordlink TR: denetlenmiş liste 620 seviyeye yetiyor; daha fazlası için liste elle genişletilmeli.

## Faydalı yerler
- Meta katmanı: `packages/kit/src/meta/` · Rehber: `docs/META.md`
- Tutma katmanı: `packages/kit/src/retention/` · Tasarım: `docs/RETENTION.md`
- Mağaza listesi şablonu: `games/<oyun>/store/listing.md` · Kontrol listesi: `docs/STORE_CHECKLIST.md`
