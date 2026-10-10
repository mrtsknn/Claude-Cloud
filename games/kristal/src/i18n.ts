import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  undo: 'Undo',
  hint: 'Hint',
  outline: 'Outline',
  target: 'Target',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  resume: 'Continue',
  privacy: 'Privacy policy',
  complete: 'Crystal clear!',
  levelN: 'Level {n}',
  taps: '{n} taps · par {p}',
  tapsShort: '{n} / par {p}',
  next: 'Next level',
  noUndo: 'Nothing to undo',
  neighbours: 'New: a tap also flips its neighbours',
  mirror: 'New: mirror symmetry, 12 at once',
  tutorial: 'Tap to match the small snowflake',
};

const tr: typeof en = {
  level: 'Seviye',
  undo: 'Geri al',
  hint: 'İpucu',
  outline: 'Taslak',
  target: 'Hedef',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  complete: 'Kristal gibi!',
  levelN: 'Seviye {n}',
  taps: '{n} dokunuş · hedef {p}',
  tapsShort: '{n} / hedef {p}',
  next: 'Sonraki seviye',
  noUndo: 'Geri alınacak hamle yok',
  neighbours: 'Yeni: dokunuş komşuları da çevirir',
  mirror: 'Yeni: ayna simetrisi, tek dokunuşta 12 yer',
  tutorial: 'Küçük kar tanesinin aynısını yap',
};

export const t = createI18n({ en, tr });
