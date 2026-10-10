import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  language: 'Word language',
  resume: 'Continue',
  privacy: 'Privacy policy',
  next: 'Next level',
  levelN: 'Level {n}',
  bonusTitle: 'Bonus words',
  bonusInfo: 'Extra words you found. Every {n} earn {c} coins.',
  bonusNone: 'Find words that are not in the grid to fill the star.',
  already: 'Already found',
  bonusWord: 'Bonus word!',
  notWord: 'Not in the word list',
  freeCoins: 'Not enough coins — watch a video for +{n}?',
  gotCoins: '+{n} coins',
  allDone: 'You finished every level in this language!',
  credits: 'Word lists: SCOWL (Kevin Atkinson), Wiktionary (CC BY-SA), OpenSubtitles frequency data.',
};

const tr: typeof en = {
  level: 'Seviye',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  language: 'Kelime dili',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  next: 'Sonraki seviye',
  levelN: 'Seviye {n}',
  bonusTitle: 'Bonus kelimeler',
  bonusInfo: 'Bulduğun ekstra kelimeler. Her {n} kelimede {c} jeton.',
  bonusNone: 'Yıldızı doldurmak için tabloda olmayan kelimeler bul.',
  already: 'Zaten bulundu',
  bonusWord: 'Bonus kelime!',
  notWord: 'Kelime listesinde yok',
  freeCoins: 'Jeton yetmiyor — video izle, +{n}?',
  gotCoins: '+{n} jeton',
  allDone: 'Bu dildeki tüm seviyeleri bitirdin!',
  credits: 'Kelime listeleri: SCOWL (Kevin Atkinson), Vikisözlük (CC BY-SA), OpenSubtitles sıklık verisi.',
};

export const t = createI18n({ en, tr });
