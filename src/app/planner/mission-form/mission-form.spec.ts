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
    await enter(control<HTMLInputElement>('Parking orbit'), '80');
    expect(mission()).toMatchObject({ year: 3, day: 120, hour: 4, initialAltitudeKm: 80 });
  });

  it('explains invalid input', async () => {
    await enter(control<HTMLInputElement>('Day'), '500');
    expect(el.textContent).toContain('Day must be between 1 and 426');
    expect(control<HTMLInputElement>('Day').getAttribute('aria-invalid')).toBe('true');
  });

  it('switches calendars', async () => {
    const earth = el.querySelector<HTMLInputElement>('input[type="radio"][value="earth"]')!;
    earth.click();
    await fixture.whenStable();
    expect(mission().calendar).toBe('earth');
    expect(el.textContent).toContain('0–23');
  });

  it('disables the capture orbit altitude for a flyby', async () => {
    const capture = control<HTMLInputElement>('Capture');
    capture.click();
    await fixture.whenStable();
    expect(mission().capture).toBe(false);
    expect(control<HTMLInputElement>('Capture orbit').disabled).toBe(true);
  });
});
