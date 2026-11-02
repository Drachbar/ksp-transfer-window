import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { Planner } from './planner/planner/planner';
import { WindowSearch } from './search/window-search';

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
});
