import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { SatellitesPage } from './satellites-page';
import { NARROW_SCREEN } from '../../narrow-screen';
import { evaluatePlan, DEFAULT_PLAN } from '../plan';
import { formatDeltaV, formatDistance } from '../../planner/format';
import { BODIES, BODY_NAMES } from '../../astro/bodies';

describe('SatellitesPage', () => {
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  const open = async (url = '/satellites', narrow = false) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'satellites', component: SatellitesPage }]), { provide: NARROW_SCREEN, useValue: signal(narrow) }],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, SatellitesPage);
    await harness.fixture.whenStable();
    el = harness.routeNativeElement!;
  };
  const settle = () => harness.fixture.whenStable();
  const enter = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const text = (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('offers every body', async () => {
    await open();
    expect(Array.from(el.querySelector<HTMLSelectElement>('#plan-body')!.options).map((o) => o.value)).toEqual(BODY_NAMES);
  });

  it('plans three satellites in Kerbin’s stationary orbit by default', async () => {
    await open();
    const r = evaluatePlan(DEFAULT_PLAN);
    expect(text('[data-testid="plan-summary"]')).toContain(formatDistance(r.constellation.target.altitude));
    expect(text('[data-testid="plan-summary"]')).toContain(formatDeltaV(r.constellation.satelliteBurn));
    expect(el.querySelectorAll('app-constellation-diagram [data-testid="satellite"]').length).toBe(3);
  });

  it('explains how to deploy them, step by step', async () => {
    await open();
    const r = evaluatePlan(DEFAULT_PLAN);
    const steps = Array.from(el.querySelectorAll('[data-testid="steps"] li')).map((li) => li.textContent!.replace(/\s+/g, ' '));
    expect(steps.length).toBe(3);
    expect(steps[0]).toContain(`${formatDeltaV(Math.abs(r.constellation.carrierBurns[0]))} prograde`);
    expect(steps[2]).toContain(`${formatDeltaV(r.constellation.satelliteBurn)} prograde`);
    expect(steps[2]).toContain('apoapsis');
  });

  it('puts the numbers of each step first, with the explanation below', async () => {
    await open();
    const c = evaluatePlan(DEFAULT_PLAN).constellation;
    const step = (i: number) => el.querySelectorAll('[data-testid="steps"] li')[i];
    const data = (i: number) =>
      Object.fromEntries(Array.from(step(i).querySelectorAll('dl div')).map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]));
    expect(Array.from(el.querySelectorAll('[data-testid="steps"] h4')).map((h) => h.textContent!.replace(/^\s*\d+/, '').trim())).toEqual([
      'Raise your apoapsis',
      'Enter the resonant orbit',
      'Release the satellites',
    ]);
    expect(data(0)).toEqual({
      'Where': 'Parking orbit',
      'Burn': `${formatDeltaV(Math.abs(c.carrierBurns[0]))} prograde`,
      'New apoapsis': formatDistance(c.target.altitude),
    });
    expect(data(1)).toEqual({
      'Where': 'Apoapsis',
      'Burn': `${formatDeltaV(Math.abs(c.carrierBurns[1]))} ${c.carrierBurns[1] >= 0 ? 'prograde' : 'retrograde'}`,
      'New periapsis': formatDistance(c.deployment.periapsis - BODIES.Kerbin.radius),
      'Orbital period': '3h 59m 26.28s',
    });
    expect(data(2)).toMatchObject({ 'Where': 'Each apoapsis', 'Each satellite burns': `${formatDeltaV(c.satelliteBurn)} prograde` });
    expect(step(1).querySelector('.explain')!.textContent).toMatch(/resonant/i);
  });

  it('calls it the new apoapsis when deploying from above', async () => {
    await open('/satellites?from=above');
    const labels = Array.from(el.querySelectorAll('[data-testid="steps"] li')[1].querySelectorAll('dt')).map((d) => d.textContent!.trim());
    expect(labels).toContain('New apoapsis');
  });

  it('only offers relay antennas', async () => {
    await open();
    const options = Array.from(el.querySelector<HTMLSelectElement>('#plan-antenna')!.options).map((o) => o.value);
    expect(options).toEqual(['HG-5 High Gain Antenna', 'RA-2 Relay Antenna', 'RA-15 Relay Antenna', 'RA-100 Relay Antenna']);
  });

  it('shows orbital periods to the hundredth of a second', async () => {
    await open();
    expect(text('[data-testid="plan-summary"]')).toContain('5h 59m 9.43s');
  });

  it('checks the comms', async () => {
    await open();
    expect(text('[data-testid="comms"]')).toMatch(/neighbours.*✓/i);
    await enter('#plan-antenna', 'HG-5 High Gain Antenna');
    expect(text('[data-testid="comms"]')).toMatch(/too short/i);
  });

  it('shows the problems with a plan', async () => {
    await open();
    await enter('#plan-body', 'Mun');
    expect(text('[data-testid="problems"]')).toMatch(/sphere of influence/i);
  });

  it('offers a stationary orbit (keostationary around Kerbin) or a custom altitude', async () => {
    await open();
    const choices = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[name], input[type="radio"]'))
      .filter((i) => i.type === 'radio' && (i.value === 'stationary' || i.value === 'custom' || i.value.includes('sync')))
      .map((i) => [i.value, i.closest('label')!.textContent!.trim()]);
    expect(choices()).toEqual([
      ['stationary', 'Keostationary (stays over one spot)'],
      ['custom', 'Custom altitude'],
    ]);
    await enter('#plan-body', 'Duna');
    expect(choices()[0][1]).toBe('Stationary (stays over one spot)');
    expect(el.textContent).toContain('Any evenly spaced circular orbit works for CommNet');
  });

  it('only asks for an altitude for a custom orbit', async () => {
    await open();
    expect(el.querySelector<HTMLInputElement>('#plan-altitude')!.disabled).toBe(true);
    el.querySelector<HTMLInputElement>('input[type="radio"][value="custom"]')!.click();
    await settle();
    expect(el.querySelector<HTMLInputElement>('#plan-altitude')!.disabled).toBe(false);
  });

  it('opens a shared plan and keeps the URL up to date', async () => {
    await open('/satellites?body=Duna&n=4&from=above');
    expect(el.querySelector<HTMLSelectElement>('#plan-body')!.value).toBe('Duna');
    expect(el.querySelectorAll('app-constellation-diagram [data-testid="satellite"]').length).toBe(4);
    await enter('#plan-count', '5');
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(Router).url).toContain('n=5');
  });

  it('limits the number fields in the browser too', async () => {
    await open();
    const count = el.querySelector<HTMLInputElement>('#plan-count')!;
    expect([count.getAttribute('min'), count.getAttribute('max')]).toEqual(['2', '12']);
    expect(el.querySelector<HTMLInputElement>('#plan-parking')!.getAttribute('min')).toBe('0');
  });

  it('stops showing results while the form is invalid', async () => {
    await open();
    await enter('#plan-count', '1');
    expect(el.querySelector('[data-testid="plan-summary"]')).toBeNull();
    expect(text('[role="status"]')).toMatch(/fix/i);
  });

  describe('on a narrow screen', () => {
    const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);

    it('folds the form into a one-line summary, so the plan comes first', async () => {
      await open('/satellites', true);
      expect(el.querySelector('form')).toBeNull();
      expect(text('[data-testid="plan-form-summary"]')).toContain('3 satellites around Kerbin');
      expect(text('[data-testid="plan-form-summary"]')).toContain('Keostationary · RA-2 Relay Antenna');
    });

    it('opens the form again for editing, and closes it when done', async () => {
      await open('/satellites', true);
      expect(button('Edit')!.getAttribute('aria-expanded')).toBe('false');
      button('Edit')!.click();
      await settle();
      expect(el.querySelector('#plan-body')).not.toBeNull();
      button('Done')!.click();
      await settle();
      expect(el.querySelector('form')).toBeNull();
    });

    it('keeps the form open while the plan is invalid', async () => {
      await open('/satellites?n=1', true);
      expect(el.querySelector('form')).not.toBeNull();
    });

    it('sums up a custom altitude', async () => {
      await open('/satellites?orbit=custom&alt=1500', true);
      expect(text('[data-testid="plan-form-summary"]')).toContain('1,500 km ·');
    });

    it('always shows the form on a wide screen', async () => {
      await open();
      expect(el.querySelector('form')).not.toBeNull();
      expect(button('Edit')).toBeUndefined();
    });
  });
});
