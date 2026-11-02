import { describeBurn, formatAngle, formatDeltaV, formatSignedDeltaV } from './format';

describe('format', () => {
  it('formats Δv in whole m/s with thousands separators', () => {
    expect(formatDeltaV(1047.4)).toBe('1,047 m/s');
    expect(formatDeltaV(12.6)).toBe('13 m/s');
    expect(formatDeltaV(NaN)).toBe('–');
  });

  it('formats signed Δv components', () => {
    expect(formatSignedDeltaV(1027.3)).toBe('+1,027 m/s');
    expect(formatSignedDeltaV(-333.8)).toBe('−334 m/s');
    expect(formatSignedDeltaV(0.2)).toBe('0 m/s');
  });

  it('formats angles in degrees', () => {
    expect(formatAngle(Math.PI / 2)).toBe('90°');
    expect(formatAngle(2.2744)).toBe('130°');
    expect(formatAngle(-0.9425)).toBe('−54°');
    expect(formatAngle(0.10163, 1)).toBe('5.8°');
    expect(formatAngle(undefined)).toBe('–');
  });
});

describe('describeBurn', () => {
  it('names the manoeuvre node handles to pull', () => {
    expect(describeBurn(1027.3, 205.4)).toBe('1,027 m/s prograde and 205 m/s normal');
    expect(describeBurn(1027.3, -205.4)).toBe('1,027 m/s prograde and 205 m/s anti-normal');
    expect(describeBurn(-50, 10)).toBe('50 m/s retrograde and 10 m/s normal');
  });

  it('leaves out components that round to zero', () => {
    expect(describeBurn(1441, 0.3)).toBe('1,441 m/s prograde');
    expect(describeBurn(0.2, 80)).toBe('80 m/s normal');
  });
});
