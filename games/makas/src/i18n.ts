import { createI18n } from '@studio/kit';

const en = {
  title: 'Switchyard',
  tagline: 'Flip the switches, send every train home',
  level: 'Level {n}',
  pause: 'Pause',
  outOfHearts: 'Out of hearts',
  delivered: 'Delivered',
  tapSwitch: 'Tap a switch to flip it',
  mission_levels: 'Clear {n} levels',
  mission_stars: 'Collect {n} stars',
  mission_perfect: 'Clear {n} levels without losing a heart',
  mission_trains: 'Deliver {n} trains',
  skin_classic: 'Meadow',
  skin_night: 'Night line',
  skin_desert: 'Desert',
  skin_snow: 'Snow',
  skin_neon: 'Neon',
  skin_toy: 'Toy box',
  skin_metro: 'Metro',
};

const tr: typeof en = {
  title: 'Makas',
  tagline: 'Makasları çevir, her treni yerine ulaştır',
  level: 'Seviye {n}',
  pause: 'Duraklat',
  outOfHearts: 'Can kalmadı',
  delivered: 'Teslim',
  tapSwitch: 'Makası çevirmek için dokun',
  mission_levels: '{n} seviye geç',
  mission_stars: '{n} yıldız topla',
  mission_perfect: 'Can kaybetmeden {n} seviye geç',
  mission_trains: '{n} tren teslim et',
  skin_classic: 'Çayır',
  skin_night: 'Gece hattı',
  skin_desert: 'Çöl',
  skin_snow: 'Kar',
  skin_neon: 'Neon',
  skin_toy: 'Oyuncak',
  skin_metro: 'Metro',
};

export const lang: 'en' | 'tr' = typeof navigator !== 'undefined' && navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
export const t = createI18n({ en, tr });
