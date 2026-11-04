import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { Planner } from './planner/planner/planner';
import { SatellitesPage } from './satellites/satellites-page/satellites-page';
import { WindowSearch } from './search/window-search';
import { Theme } from './theme';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), { provide: WindowSearch, useValue: { search: () => new Promise(() => {}) } }],
    }).compileComponents();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('KSP Transfer Window');
  });

  it('credits the original planner and states the licence', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer')!;
    const links = Array.from(footer.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('https://github.com/alexmoon/ksp');
    expect(links).toContain('http://creativecommons.org/licenses/by-nc-sa/4.0/');
    expect(footer.textContent).toContain('Alex Moon');
  });

  it('shows the planner on the start page', async () => {
    const harness = await RouterTestingHarness.create();
    const planner = await harness.navigateByUrl('/', Planner);
    expect(planner).toBeInstanceOf(Planner);
  });

  it('links to every page from the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('header nav a'));
    expect(links.map((a) => [a.textContent!.trim(), a.getAttribute('href')])).toEqual([
      ['Transfer windows', '/'],
      ['Satellites', '/satellites'],
    ]);
  });

  it('shows the satellite calculator on its own page', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/satellites', SatellitesPage);
    expect(page).toBeInstanceOf(SatellitesPage);
  });

  it('marks the current page in the header, whatever the query parameters', async () => {
    const harness = await RouterTestingHarness.create();
    const app = TestBed.createComponent(App);
    await harness.navigateByUrl('/?from=Kerbin&to=Duna');
    await app.whenStable();
    expect(Array.from((app.nativeElement as HTMLElement).querySelectorAll('nav a.active')).map((a) => a.textContent!.trim())).toEqual(['Transfer windows']);
    await harness.navigateByUrl('/satellites?body=Duna');
    await app.whenStable();
    expect(Array.from((app.nativeElement as HTMLElement).querySelectorAll('nav a.active')).map((a) => a.textContent!.trim())).toEqual(['Satellites']);
  });

  it('switches between the light and the dark theme from the header', async () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('header [data-testid="theme-toggle"]')!;
    expect(button.textContent!.trim()).toBe('Dark mode');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(Theme).current()).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    localStorage.clear();
  });
});
