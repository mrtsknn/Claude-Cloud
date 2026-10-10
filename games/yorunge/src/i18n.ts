import { createI18n } from '@studio/kit';

const en = {
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  close: 'Close',
  privacy: 'Privacy policy',
  tapToStart: 'Tap to start',
  tapToLaunch: 'Tap to leave orbit',
  lost: 'Lost in space',
  newBest: 'New best!',
  best: 'Best {n}',
  continue: 'Continue',
  playAgain: 'Play again',
  perfect: 'Perfect',
};

const tr: typeof en = {
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  close: 'Kapat',
  privacy: 'Gizlilik politikası',
  tapToStart: 'Başlamak için dokun',
  tapToLaunch: 'Yörüngeden çıkmak için dokun',
  lost: 'Uzayda kayboldun',
  newBest: 'Yeni rekor!',
  best: 'Rekor {n}',
  continue: 'Devam et',
  playAgain: 'Tekrar oyna',
  perfect: 'Kusursuz',
};

export const lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
export const t = createI18n({ en, tr });
