import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { MissionForm } from './mission-form';
import { DEFAULT_MISSION, missionSchema, ORIGIN_GROUPS, type Mission } from '../mission';

describe('MissionForm', () => {
  let fixture: ComponentFixture<MissionForm>;
  let mission: WritableSignal<Mission>;
  let el: HTMLElement;

  const render = async (m: Mission = DEFAULT_MISSION) => {
    mission = signal(m);
    const f = TestBed.runInInjectionContext(() => form(mission, missionSchema));
    fixture = TestBed.createComponent(MissionForm);
    fixture.componentRef.setInput('form', f);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  };

  const control = <T extends HTMLElement>(label: string) => {
    const l = Array.from(el.querySelectorAll('label')).find((x) => x.textContent!.trim().startsWith(label));
    if (!l) throw new Error(`No label "${label}"`);
    return el.querySelector<T>(`#${l.htmlFor}`)!;
  };
  const enter = async (input: HTMLInputElement | HTMLSelectElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };
  const options = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value);
  const hasLabel = (text: string) => Array.from(el.querySelectorAll('label')).some((l) => l.textContent!.includes(text));
  const moreButton = () => el.querySelector<HTMLButtonElement>('[data-testid="more-options"]')!;
  const more = async () => {
    if (moreButton().getAttribute('aria-expanded') !== 'true') moreButton().click();
    await fixture.whenStable();
  };
  const planRoundTrip = async () => {
    control<HTMLInputElement>('Round trip').click();
    await fixture.whenStable();
  };

  beforeEach(() => render());

  it('offers every possible origin, grouped into planets and moons', () => {
    const groups = Array.from(control<HTMLSelectElement>('From').querySelectorAll('optgroup'));
    expect(groups.map((g) => g.label)).toEqual(ORIGIN_GROUPS.map((g) => g.label));
    expect(groups.map((g) => Array.from(g.querySelectorAll('option')).map((o) => o.value))).toEqual(ORIGIN_GROUPS.map((g) => g.bodies));
  });

  it('only offers destinations orbiting the same body as the origin', () => {
    expect(options(control<HTMLSelectElement>('To'))).toEqual(['Moho', 'Eve', 'Duna', 'Dres', 'Jool', 'Eeloo']);
  });

  it('shows the current selection', () => {
    expect(control<HTMLSelectElement>('From').value).toBe('Kerbin');
    expect(control<HTMLSelectElement>('To').value).toBe('Duna');
  });

  it('switches to a reachable destination when the origin changes system', async () => {
    await enter(control<HTMLSelectElement>('From'), 'Mun');
    expect(mission().origin).toBe('Mun');
    expect(mission().destination).toBe('Minmus');
    expect(options(control<HTMLSelectElement>('To'))).toEqual(['Minmus']);
  });

  it('updates the mission as you type', async () => {
    await enter(control<HTMLInputElement>('Year'), '3');
    await enter(control<HTMLInputElement>('Day'), '120');
    await enter(control<HTMLInputElement>('Hour'), '4');
    await more();
    await enter(control<HTMLInputElement>('Parking orbit'), '80');
    expect(mission()).toMatchObject({ year: 3, day: 120, hour: 4, initialAltitudeKm: 80 });
  });

  it('explains what a parking orbit of 0 km means', async () => {
    await more();
    expect(el.textContent).toContain('0 = no parking orbit');
  });

  it('takes an optional maximum flight time', async () => {
    await more();
    const max = control<HTMLInputElement>('Max flight time');
    expect(max.value).toBe('');
    await enter(max, '250');
    expect(mission().maxFlightDays).toBe(250);
    await enter(max, '');
    expect(mission().maxFlightDays).toBeNull();
  });

  describe('game time shortcuts', () => {
    it('moves the date forward, into the next year when needed', async () => {
      await render({ ...DEFAULT_MISSION, year: 1, day: 420 });
      const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;
      button('+10 d').click();
      await fixture.whenStable();
      expect(mission()).toMatchObject({ year: 2, day: 4 });
      button('+1 d').click();
      button('+100 d').click();
      await fixture.whenStable();
      expect(mission()).toMatchObject({ year: 2, day: 105 });
    });
  });

  describe('one way or round trip', () => {
    it('plans one way by default, without asking about the trip home', () => {
      expect(control<HTMLInputElement>('One way').checked).toBe(true);
      expect(hasLabel('Minimum stay')).toBe(false);
      expect(hasLabel('coming back')).toBe(false);
    });

    it('asks about the trip home on a round trip', async () => {
      await planRoundTrip();
      expect(mission().roundTrip).toBe(true);
      expect(hasLabel('Minimum stay')).toBe(true);
      control<HTMLInputElement>('One way').click();
      await fixture.whenStable();
      expect(mission().roundTrip).toBe(false);
    });
  });

  describe('more options', () => {
    it('keeps the orbits, calendar and flight time limit out of the way, summing them up', () => {
      expect(moreButton().getAttribute('aria-expanded')).toBe('false');
      expect(hasLabel('Parking orbit')).toBe(false);
      expect(hasLabel('Max flight time')).toBe(false);
      expect(hasLabel('Kerbin time')).toBe(false);
      expect(el.querySelector('[data-testid="more-summary"]')!.textContent).toBe('100 km → 100 km · Kerbin time · no time limit');
    });

    it('shows them when asked', async () => {
      await more();
      expect(moreButton().getAttribute('aria-expanded')).toBe('true');
      expect(hasLabel('Parking orbit')).toBe(true);
      expect(hasLabel('Max flight time')).toBe(true);
    });

    it('sums up a flyby and a time limit', async () => {
      await render({ ...DEFAULT_MISSION, capture: false, initialAltitudeKm: 80, maxFlightDays: 250, calendar: 'earth' });
      expect(el.querySelector('[data-testid="more-summary"]')!.textContent).toBe('80 km parking orbit · Earth time · max 250 days');
    });

    it('opens by itself when one of them is invalid', async () => {
      await render({ ...DEFAULT_MISSION, initialAltitudeKm: -5 });
      expect(hasLabel('Parking orbit')).toBe(true);
    });
  });

  it('takes an optional minimum stay at the destination', async () => {
    await planRoundTrip();
    const stay = control<HTMLInputElement>('Minimum stay');
    expect(stay.value).toBe('');
    await enter(stay, '30');
    expect(mission().stayDays).toBe(30);
    await enter(stay, '');
    expect(mission().stayDays).toBeNull();
  });

  describe('arrival', () => {
    const choose = async (label: string) => {
      control<HTMLInputElement>(label).click();
      await fixture.whenStable();
    };

    it('puts both orbit altitudes side by side, each with its own label', async () => {
      await more();
      const parking = control<HTMLInputElement>('Parking orbit');
      const capture = control<HTMLInputElement>('Capture orbit');
      expect(parking.closest('.row')).toBe(capture.closest('.row'));
    });

    it('offers burning into orbit, aerobraking or flying by, burning by default', () => {
      const options = Array.from(el.querySelectorAll<HTMLInputElement>('input[name="mission-arrival"]'));
      expect(options.map((o) => o.value)).toEqual(['burn', 'aerobrake', 'flyby']);
      expect(control<HTMLInputElement>('Burn into orbit').checked).toBe(true);
    });

    it('aerobrakes', async () => {
      await choose('Aerobrake');
      expect(mission()).toMatchObject({ capture: true, aerobrake: true });
    });

    it('flies by, without a capture orbit or a stay', async () => {
      await more();
      await planRoundTrip();
      await choose('Fly by');
      expect(mission()).toMatchObject({ capture: false, aerobrake: false });
      expect(control<HTMLInputElement>('Capture orbit').disabled).toBe(true);
      expect(control<HTMLInputElement>('Minimum stay').disabled).toBe(true);
    });

    it('goes back to burning into orbit', async () => {
      await choose('Aerobrake');
      await choose('Burn into orbit');
      expect(mission()).toMatchObject({ capture: true, aerobrake: false });
    });

    it('only offers aerobraking where the destination has an atmosphere, and says why', async () => {
      expect(control<HTMLInputElement>('Aerobrake').disabled).toBe(false);
      expect(el.querySelector('[data-testid="aerobrake-hint"]')).toBeNull();
      await enter(control<HTMLSelectElement>('To'), 'Dres');
      expect(control<HTMLInputElement>('Aerobrake').disabled).toBe(true);
      expect(el.querySelector('[data-testid="aerobrake-hint"]')!.textContent).toMatch(/Dres has no atmosphere/);
    });

    it('switches to burning into orbit if the new destination has no atmosphere', async () => {
      await choose('Aerobrake');
      await enter(control<HTMLSelectElement>('To'), 'Dres');
      expect(mission()).toMatchObject({ capture: true, aerobrake: false });
      expect(control<HTMLInputElement>('Burn into orbit').checked).toBe(true);
    });
  });

  describe('aerobraking back home', () => {
    beforeEach(() => planRoundTrip());

    it('is on by default and can be switched off', async () => {
      const home = control<HTMLInputElement>('Aerobrake when coming back');
      expect(home.checked).toBe(true);
      home.click();
      await fixture.whenStable();
      expect(mission().aerobrakeHome).toBe(false);
    });

    it('is not offered when home has no atmosphere', async () => {
      await render({ ...DEFAULT_MISSION, origin: 'Mun', destination: 'Minmus', roundTrip: true });
      expect(Array.from(el.querySelectorAll('label')).some((l) => l.textContent!.includes('coming back'))).toBe(false);
    });

    it('does not apply to a flyby', async () => {
      control<HTMLInputElement>('Fly by').click();
      await fixture.whenStable();
      expect(control<HTMLInputElement>('Aerobrake when coming back').disabled).toBe(true);
    });
  });

  it('limits the number fields in the browser too (arrows and spinners stop at the limits)', async () => {
    const attrs = (label: string) => {
      const input = control<HTMLInputElement>(label);
      return [input.getAttribute('min'), input.getAttribute('max')];
    };
    await more();
    expect(attrs('Year')).toEqual(['1', null]);
    expect(attrs('Day')).toEqual(['1', '426']);
    expect(attrs('Hour')).toEqual(['0', '5']);
    expect(attrs('Parking orbit')).toEqual(['0', null]);
    el.querySelector<HTMLInputElement>('input[type="radio"][value="earth"]')!.click();
    await fixture.whenStable();
    expect(attrs('Day')).toEqual(['1', '365']);
    expect(attrs('Hour')).toEqual(['0', '23']);
  });

  it('explains invalid input', async () => {
    await enter(control<HTMLInputElement>('Day'), '500');
    expect(el.textContent).toContain('Day must be between 1 and 426');
    expect(control<HTMLInputElement>('Day').getAttribute('aria-invalid')).toBe('true');
  });

  it('switches calendars', async () => {
    await more();
    const earth = el.querySelector<HTMLInputElement>('input[type="radio"][value="earth"]')!;
    earth.click();
    await fixture.whenStable();
    expect(mission().calendar).toBe('earth');
    expect(el.textContent).toContain('0–23');
  });

});
