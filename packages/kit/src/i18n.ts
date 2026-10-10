export type Dict = Record<string, string>;

/** Picks the dictionary matching the device language, falling back to English. */
export function createI18n<T extends Dict>(dicts: { en: T } & Record<string, T>) {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  const dict = dicts[lang] ?? dicts.en;
  return (key: keyof T, vars: Record<string, string | number> = {}) =>
    String(dict[key as string] ?? dicts.en[key as string] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
