import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  undo: 'Undo',
  hint: 'Hint',
  sail: 'Sail',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  resume: 'Continue',
  privacy: 'Privacy policy',
  complete: 'Delivered!',
  levelN: 'Level {n}',
  moves: '{n} moves · par {p}',
  next: 'Next level',
  noUndo: 'Nothing to undo',
  noHint: 'No hint available',
};

const tr: typeof en = {
  level: 'Seviye',
  undo: 'Geri al',
  hint: 'İpucu',
  sail: 'Yola çık',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  complete: 'Teslim edildi!',
  levelN: 'Seviye {n}',
  moves: '{n} hamle · hedef {p}',
  next: 'Sonraki seviye',
  noUndo: 'Geri alınacak hamle yok',
  noHint: 'İpucu bulunamadı',
};

export const t = createI18n({ en, tr });
