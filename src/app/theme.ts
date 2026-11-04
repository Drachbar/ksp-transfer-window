import { computed, DestroyRef, DOCUMENT, effect, inject, InjectionToken, Service, signal } from '@angular/core';

export type ThemeName = 'light' | 'dark';

/** Where the chosen theme is kept between visits; null where there is no storage. */
export const THEME_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>('THEME_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null; // Access denied, e.g. with site data blocked
    }
  },
});

const STORAGE_KEY = 'theme';

/**
 * Light or dark: the OS colour scheme until the user picks one, which is remembered.
 * The current theme is put on <html data-theme> for the stylesheets.
 */
@Service()
export class Theme {
  private readonly storage = inject(THEME_STORAGE);
  private readonly systemDark = signal(false);
  private readonly chosen = signal<ThemeName | null>(this.load());

  readonly current = computed<ThemeName>(() => this.chosen() ?? (this.systemDark() ? 'dark' : 'light'));

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-color-scheme: dark)');
      const update = () => this.systemDark.set(query.matches);
      update();
      query.addEventListener?.('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', update));
    }

    const html = inject(DOCUMENT).documentElement;
    effect(() => (html.dataset['theme'] = this.current()));
  }

  toggle() {
    const next = this.current() === 'dark' ? 'light' : 'dark';
    this.chosen.set(next);
    try {
      this.storage?.setItem(STORAGE_KEY, next);
    } catch {
      // Storage full or blocked: the choice lasts until the page is closed.
    }
  }

  private load(): ThemeName | null {
    try {
      const saved = this.storage?.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
      return null;
    }
  }
}
