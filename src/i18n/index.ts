import { create } from 'zustand';

import { DICT, LANGS, type Dict, type Lang } from './dict';

export type { Dict, Lang } from './dict';

export const LANG_KEY = 'sn.lang';

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Browser language → one of ours. Anything Chinese is 中文; everything else gets English. */
export function langFromNavigator(navLang: string | undefined): Lang {
  return navLang && /^zh\b/i.test(navLang) ? 'zh-CN' : 'en';
}

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode: the choice lives for this page only */
  }
}

/** Only the landing (and later any page that opts in) changes `<html lang>`; the shell stays zh-CN. */
function applyHtmlLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function initialLang(): Lang {
  return (
    readStored() ??
    langFromNavigator(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );
}

interface I18nState {
  lang: Lang;
  t: Dict;
  setLang(lang: Lang): void;
  toggle(): void;
}

export const useI18n = create<I18nState>((set, get) => ({
  lang: initialLang(),
  t: DICT[initialLang()],
  setLang(lang) {
    if (!isLang(lang)) return;
    writeStored(lang);
    applyHtmlLang(lang);
    set({ lang, t: DICT[lang] });
  },
  toggle() {
    get().setLang(get().lang === 'zh-CN' ? 'en' : 'zh-CN');
  },
}));
