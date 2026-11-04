import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

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

describe('Theme', () => {
  const html = document.documentElement;
  const theme = () => TestBed.inject(Theme);
  const settle = () => TestBed.tick();

  beforeEach(() => {
    localStorage.clear();
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
    expect(theme().current()).toBe('dark');
  });

  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(theme().current()).toBe('light');
    theme().toggle();
    expect(theme().current()).toBe('dark');
    vi.restoreAllMocks();
  });
});
