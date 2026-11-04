import { computed, DestroyRef, DOCUMENT, effect, inject, Service, signal } from '@angular/core';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function load(): ThemeName | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function save(theme: ThemeName) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}

/**
 * Light or dark: the OS colour scheme until the user picks one, which is remembered.
 * The current theme is put on <html data-theme> for the stylesheets.
 */
@Service()
export class Theme {
  private readonly systemDark = signal(false);
  private readonly chosen = signal<ThemeName | null>(load());

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
    save(next);
  }
}
