import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  undo: 'Undo',
  hint: 'Hint',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  resume: 'Continue',
  privacy: 'Privacy policy',
  complete: 'Balanced!',
  levelN: 'Level {n}',
  moves: '{n} moves · par {par}',
  next: 'Next level',
  noUndo: 'Nothing to undo',
  noHint: 'Everything is already in place',
  locked: 'Placed by a hint',
  tutorial: 'Drag weights onto the plank until it is level',
  stackTip: 'New: weights can share a peg',
};

const tr: typeof en = {
  level: 'Seviye',
  undo: 'Geri al',
  hint: 'İpucu',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  complete: 'Dengede!',
  levelN: 'Seviye {n}',
  moves: '{n} hamle · hedef {par}',
  next: 'Sonraki seviye',
  noUndo: 'Geri alınacak hamle yok',
  noHint: 'Her şey zaten yerinde',
  locked: 'İpucuyla yerleşti',
  tutorial: 'Ağırlıkları tahtaya sürükle, terazi düz dursun',
  stackTip: 'Yeni: aynı çiviye birden çok ağırlık asılabilir',
};

export const lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
export const t = createI18n({ en, tr });
