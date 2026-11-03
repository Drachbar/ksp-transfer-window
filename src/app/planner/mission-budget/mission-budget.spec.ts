import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionBudget } from './mission-budget';
import { missionBudget } from '../budget';
import { DEFAULT_MISSION, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { sampleResult } from '../../../testing/sample-windows';
import type { TransferWindow } from '../../search/window-finder';

describe('MissionBudget', () => {
  let fixture: ComponentFixture<MissionBudget>;
  let el: HTMLElement;
  const [outbound, homeward] = sampleResult().windows;
  const roundTrip: Mission = { ...DEFAULT_MISSION, roundTrip: true };

  const render = async (mission: Mission = DEFAULT_MISSION, home: TransferWindow | null = homeward) => {
    fixture = TestBed.createComponent(MissionBudget);
    fixture.componentRef.setInput('mission', mission);
    fixture.componentRef.setInput('outbound', outbound);
    fixture.componentRef.setInput('homeward', home);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  };
  const rows = () => Array.from(el.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  const total = () => el.querySelector('[data-testid="budget-total"]')!.textContent!.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes(label))!;
  const breakdown = async () => {
    button('Show breakdown').click();
    await fixture.whenStable();
  };
  const toggle = async (label: string) => {
    const l = Array.from(el.querySelectorAll('label')).find((x) => x.textContent!.trim().startsWith(label))!;
    l.querySelector('input')!.click();
    await fixture.whenStable();
  };
  const everything = { launch: true, land: true, comeBack: false };

  it('shows only the total until you ask for the breakdown', async () => {
    await render();
    const expected = missionBudget(DEFAULT_MISSION, outbound, homeward, everything);
    expect(total()).toContain(`~${formatDeltaV(expected.total)}`);
    expect(total()).toContain('launch, transfer, landing');
    expect(el.querySelector('table')).toBeNull();
    expect(button('Show breakdown').getAttribute('aria-expanded')).toBe('false');
  });

  it('lists every leg of a one-way trip with its Δv, marking estimates', async () => {
    await render();
    await breakdown();
    expect(button('Hide breakdown').getAttribute('aria-expanded')).toBe('true');
    const expected = missionBudget(DEFAULT_MISSION, outbound, homeward, everything);
    expect(rows().length).toBe(expected.rows.length);
    expect(rows()[0]).toContain('Launch from Kerbin');
    expect(rows()[0]).toContain(`~${formatDeltaV(3400)}`);
    expect(rows()[1]).toContain(formatDeltaV(expected.rows[1].deltaV));
    expect(rows()[1]).not.toContain('~');
    expect(rows().some((r) => r.includes('Return to'))).toBe(false);
  });

  it('includes the trip home on a round trip', async () => {
    await render(roundTrip);
    const expected = missionBudget(roundTrip, outbound, homeward, { ...everything, comeBack: true });
    expect(total()).toContain(`~${formatDeltaV(expected.total)}`);
    expect(total()).toContain('trip home');
    await breakdown();
    expect(rows().some((r) => r.includes('Return to Kerbin'))).toBe(true);
  });

  it('lets you leave out the landing or the launch', async () => {
    await render();
    await breakdown();
    await toggle('Land on Duna');
    expect(rows().some((r) => r.includes('Landing on Duna'))).toBe(false);
    await toggle('Launch');
    expect(rows().some((r) => r.includes('Launch from'))).toBe(false);
    const expected = missionBudget(DEFAULT_MISSION, outbound, homeward, { launch: false, land: false, comeBack: false });
    expect(total()).toContain(formatDeltaV(expected.total));
  });

  it('does not offer a landing where there is no surface', async () => {
    await render({ ...DEFAULT_MISSION, destination: 'Jool' });
    await breakdown();
    expect(Array.from(el.querySelectorAll('label')).some((l) => l.textContent!.includes('Land on'))).toBe(false);
  });

  it('says when the way home is still being worked out', async () => {
    await render(roundTrip, null);
    expect(el.textContent).toMatch(/way home/i);
  });

  it('explains the estimates', async () => {
    await render();
    await breakdown();
    expect(el.textContent).toMatch(/~ marks estimates/i);
  });
});
