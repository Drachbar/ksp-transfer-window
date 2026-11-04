import { TestBed } from '@angular/core/testing';
import { Theme, THEME_STORAGE } from './theme';

/** A matchMedia stand-in where only "prefers dark" can match. */
function stubColorScheme(dark: boolean) {
  const listeners: (() => void)[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: () => {},
  };
  vi.stubGlobal('matchMedia', (q: string) => (q.includes('dark') ? query : { ...query, matches: false }));
  return {
    change(next: boolean) {
      query.matches = next;
      listeners.forEach((l) => l());
    },
  };
}

/** In-memory storage, so the tests do not depend on the runtime's localStorage. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('Theme', () => {
  const html = document.documentElement;
  let storage: ReturnType<typeof memoryStorage>;
  const provideStorage = (s: Pick<Storage, 'getItem' | 'setItem'> | null) =>
    TestBed.configureTestingModule({ providers: [{ provide: THEME_STORAGE, useValue: s }] });
  const theme = () => TestBed.inject(Theme);
  const settle = () => TestBed.tick();

  beforeEach(() => {
    storage = memoryStorage();
    provideStorage(storage);
    delete html.dataset['theme'];
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is light when the OS states no preference and nothing is saved', () => {
    expect(theme().current()).toBe('light');
    settle();
    expect(html.dataset['theme']).toBe('light');
  });

  it('follows the OS colour scheme, also when it changes', () => {
    const os = stubColorScheme(true);
    expect(theme().current()).toBe('dark');
    os.change(false);
    expect(theme().current()).toBe('light');
  });

  it('switches to the other theme and puts it on the page', () => {
    stubColorScheme(true);
    theme().toggle();
    expect(theme().current()).toBe('light');
    settle();
    expect(html.dataset['theme']).toBe('light');
  });

  it('remembers the choice for the next visit, over the OS setting', () => {
    stubColorScheme(false);
    theme().toggle();
    TestBed.resetTestingModule();
    provideStorage(storage);
    expect(theme().current()).toBe('dark');
  });

  it('works without storage', () => {
    TestBed.resetTestingModule();
    provideStorage(null);
    expect(theme().current()).toBe('light');
    theme().toggle();
    expect(theme().current()).toBe('dark');
  });

  it('works when storage refuses access', () => {
    TestBed.resetTestingModule();
    const blocked = () => {
      throw new Error('blocked');
    };
    provideStorage({ getItem: blocked, setItem: blocked });
    expect(theme().current()).toBe('light');
    theme().toggle();
    expect(theme().current()).toBe('dark');
  });
});
