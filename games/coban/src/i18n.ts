import { createI18n } from '@studio/kit';

const en = {
  title: 'Herd',
  tagline: 'Guide the flock home',
  level: 'Level {n}',
  hint: 'Drag — the dog follows your finger',
  timeUp: "Time's up!",
  penned: 'sheep penned',
  pause: 'Pause',
  wolf: 'A wolf! Chase it off with the dog',
  black: 'The black sheep is stubborn',
  mission_levels: 'Clear {n} levels',
  mission_stars: 'Earn {n} stars',
  mission_perfect: 'Get 3 stars {n} times',
  mission_games: 'Run out of time {n} times',
  mission_sheep: 'Pen {n} sheep',
  skin_collie: 'Border Collie',
  skin_golden: 'Golden',
  skin_kangal: 'Kangal',
  skin_husky: 'Husky',
  skin_shiba: 'Shiba',
  skin_choco: 'Chocolate Lab',
  skin_dalmatian: 'Dalmatian',
};

const tr: typeof en = {
  title: 'Çoban',
  tagline: 'Sürüyü ağıla götür',
  level: 'Seviye {n}',
  hint: 'Sürükle — köpek parmağını takip eder',
  timeUp: 'Süre doldu!',
  penned: 'koyun ağılda',
  pause: 'Duraklat',
  wolf: 'Kurt! Köpekle kovala',
  black: 'Kara koyun inatçıdır',
  mission_levels: '{n} seviye bitir',
  mission_stars: '{n} yıldız topla',
  mission_perfect: '{n} kez 3 yıldız al',
  mission_games: '{n} kez süreyi doldur',
  mission_sheep: '{n} koyunu ağıla sok',
  skin_collie: 'Border Collie',
  skin_golden: 'Golden',
  skin_kangal: 'Kangal',
  skin_husky: 'Husky',
  skin_shiba: 'Shiba',
  skin_choco: 'Çikolata Labrador',
  skin_dalmatian: 'Dalmaçyalı',
};

export const t = createI18n({ en, tr });
export const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
