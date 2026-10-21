import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.removeItem('voicestudio.locale');
  localStorage.removeItem('voicestudio.locale.default');
  vi.restoreAllMocks();
  vi.resetModules();
});

it('starts in Spanish immediately even when the operating system uses English', async () => {
  localStorage.removeItem('voicestudio.locale');
  localStorage.removeItem('voicestudio.locale.default');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('es');
  expect(document.documentElement.lang).toBe('es');
  expect(i18n.t('settings.language')).toBe('Idioma');
});

it('restores a language explicitly selected in Settings', async () => {
  localStorage.setItem('voicestudio.locale.default', 'es');
  localStorage.setItem('voicestudio.locale', 'en');
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});

it('switches an existing English profile to Spanish once', async () => {
  localStorage.removeItem('voicestudio.locale.default');
  localStorage.setItem('voicestudio.locale', 'en');
  const { default: i18n } = await import('./index');
  expect(i18n.language).toBe('es');
  expect(localStorage.getItem('voicestudio.locale')).toBe('es');
  expect(localStorage.getItem('voicestudio.locale.default')).toBe('es');
});
