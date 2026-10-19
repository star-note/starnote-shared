import { initialLang, LANG_KEY, langFromNavigator, useI18n } from '..';

describe('i18n store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'zh-CN';
  });

  it('defaults from navigator.language', () => {
    expect(langFromNavigator('zh-CN')).toBe('zh-CN');
    expect(langFromNavigator('zh-Hant-TW')).toBe('zh-CN');
    expect(langFromNavigator('en-US')).toBe('en');
    expect(langFromNavigator('ja')).toBe('en');
    expect(langFromNavigator(undefined)).toBe('en');
  });

  it('prefers the stored choice over the browser language', () => {
    localStorage.setItem(LANG_KEY, 'en');
    expect(initialLang()).toBe('en');
    localStorage.setItem(LANG_KEY, 'nope');
    expect(initialLang()).toBe(langFromNavigator(navigator.language));
  });

  it('toggles, swaps the dictionary, persists and updates <html lang>', () => {
    useI18n.getState().setLang('zh-CN');
    expect(useI18n.getState().t.landing.h1a).toBe('笔落成星，');

    useI18n.getState().toggle();
    expect(useI18n.getState().lang).toBe('en');
    expect(useI18n.getState().t.landing.h1a).toBe('Write it.');
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    useI18n.getState().toggle();
    expect(useI18n.getState().lang).toBe('zh-CN');
    expect(localStorage.getItem(LANG_KEY)).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('ignores unknown languages', () => {
    useI18n.getState().setLang('en');
    useI18n.getState().setLang('fr' as never);
    expect(useI18n.getState().lang).toBe('en');
  });
});
