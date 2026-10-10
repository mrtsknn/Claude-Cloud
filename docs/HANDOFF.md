# Devir Teslim — Bir Sonraki Ajan/Oturum İçin Yol Haritası

Bu dosya, bu repoda çalışacak yeni bir ajanın (veya insanın) **önce okuyacağı** yer. Sırayla
`CLAUDE.md` → bu dosya → `docs/META.md` → `docs/RETENTION.md`.

## Şu anki durum (2026-10)
- 23 oyun `games/*` altında: hepsi v1 (oynanış + meta katmanı + AdMob test kimlikleri + IAP +
  i18n tr/en + testler + mağaza görselleri + PRIVACY). Tablo: `README.md`.
- Derinleştirilen 5 aday (v1.1): **Wordlink, Snapgrid, Kovan, Çömlek, Çoban** — günlük bulmaca,
  bölümler/macera modu, hatırlatma bildirimi, paylaşma, efektler.
- Sıradaki büyük iş: `docs/RETENTION.md` katmanı (kurma meta'sı, can, lig, albüm, devam
  reklamı). Önce Wordlink ve Snapgrid'e uygulanır; ölçülür, sonra diğerlerine yayılır.

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
- Sonuç ekranlarına (kazan/kaybet) özel içerik ve ekstra buton eklenecek resmi bir yuva yok;
  oyunlar kit çizdikten sonra DOM'a ekliyor.
- `endless` kartı oluşturulduktan sonra güncellenemiyor; harita grid'ine başlık ekleme yuvası yok.
- Günlük bulmaca `showWin({level:0})` ile kaydedilince görev sayacını ilerletiyor.
- `scheduleReminders` reddedilmiş izni her çağrıda tekrar istiyor (oyunlar yalnızca "evet" sonrası çağırıyor).
- Wordlink TR: denetlenmiş liste 620 seviyeye yetiyor; daha fazlası için liste elle genişletilmeli.

## Faydalı yerler
- Meta katmanı: `packages/kit/src/meta/` · Rehber: `docs/META.md`
- Tutma katmanı: `packages/kit/src/retention/` · Tasarım: `docs/RETENTION.md`
- Mağaza listesi şablonu: `games/<oyun>/store/listing.md` · Kontrol listesi: `docs/STORE_CHECKLIST.md`
