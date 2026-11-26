/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: quiet hours (core-cases section 7, ADR 0010 section 5). Warnings only, steps never move. */
import { describe, expect, it } from 'vitest';
import { isInQuietHours, quietHoursWarnings } from '../../src/schedule/quiet';
import { localToUtc } from '../../src/schedule/time';
import { backward } from './support/plan';
import { input, ITEM, iso, LONDON, ms, NOV28, NOV28_COLD18, NY, stepOf } from './support/fixtures';

const FAR_PAST = ms('2025-01-01T00:00:00.000Z');
const NIGHT = { enabled: true, startMin: 22 * 60, endMin: 6 * 60 };
const mkPlan = (
  readyLocal = NOV28.readyLocal,
  itemOver: Record<string, unknown> = {},
  zone = NY,
) => {
  const r = backward(input({}, itemOver), localToUtc(readyLocal, zone).at, FAR_PAST);
  expect(r.status).toBe('ok');
  return r.plan;
};
const keys = (ws: any[]) =>
  ws.map((w) => `${w.stepKey}${w.foldIndex ? '#' + w.foldIndex : ''}`).sort();

describe('quietHoursWarnings on PRD plans', () => {
  it('QH-01 22:00-06:00: exactly one warning, the feeding at Fri 03:05; nothing moves', () => {
    const p = mkPlan();
    const before = structuredClone(p);
    const ws = quietHoursWarnings(p, NIGHT, NY);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({
      code: 'quietHours',
      stepKey: `${ITEM}:feed`,
      at: stepOf(p, ITEM, 'feed').startAt,
    });
    expect(iso((ws[0] as any).at)).toBe(NOV28.starts.feed);
    expect(p).toEqual(before); // QH-10: plan untouched
  });
  it('QH-02 18 h cold ferment: only Mix and rest at Fri 05:05 warns', () => {
    const p = mkPlan(NOV28.readyLocal, { durations: { overrides: { cold: 1080 } } });
    const ws = quietHoursWarnings(p, NIGHT, NY);
    expect(keys(ws)).toEqual([`${ITEM}:mix`]);
    expect(iso((ws[0] as any).at)).toBe(NOV28_COLD18.starts.mix);
  });
  it('QH-03 disabled and empty windows give no warnings', () => {
    const p = mkPlan();
    expect(quietHoursWarnings(p, { ...NIGHT, enabled: false }, NY)).toEqual([]);
    expect(quietHoursWarnings(p, { enabled: true, startMin: 1320, endMin: 1320 }, NY)).toEqual([]); // start === end is empty (AMB-07)
  });
  it('QH-04 same-day window 13:00-15:00 warns for fold reminders 3 and 4 and for bulk at 14:05', () => {
    const p = mkPlan();
    const ws = quietHoursWarnings(p, { enabled: true, startMin: 13 * 60, endMin: 15 * 60 }, NY);
    expect(keys(ws)).toEqual([`${ITEM}:bulk`, `${ITEM}:folds#3`, `${ITEM}:folds#4`].sort());
    const fold3 = ws.find((w: any) => w.foldIndex === 3) as any;
    expect(iso(fold3.at)).toBe('2026-11-27T18:05:00.000Z'); // 13:05 EST
  });
  it('QH-07 an alongside step start is checked (preheat Sat 07:45 in a 07:00-08:00 window)', () => {
    const ws = quietHoursWarnings(mkPlan(), { enabled: true, startMin: 420, endMin: 480 }, NY);
    expect(keys(ws)).toEqual(['bake:preheat']);
  });
  it('QH-11 heads-ups are not checked: a 06:10 feed is outside quiet hours even though its heads-up is inside', () => {
    const p = mkPlan({ date: '2026-11-28', time: '13:05' }); // feed Fri 06:10, shape Fri 23:10, cold Fri 23:20
    expect(keys(quietHoursWarnings(p, NIGHT, NY))).toEqual([`${ITEM}:cold`, `${ITEM}:shape`]);
  });
  it('QH-13 evaluated in the zone passed: in London the feed (08:05 GMT) is fine but shape/cold (01:05, 01:15 GMT) warn', () => {
    const p = mkPlan();
    expect(keys(quietHoursWarnings(p, NIGHT, NY))).toEqual([`${ITEM}:feed`]);
    expect(keys(quietHoursWarnings(p, NIGHT, LONDON))).toEqual([`${ITEM}:cold`, `${ITEM}:shape`]);
  });
  it('QH-12 warnings carry the step key and the instant', () => {
    const w: any = quietHoursWarnings(mkPlan(), NIGHT, NY)[0];
    expect(w.code).toBe('quietHours');
    expect(typeof w.stepKey).toBe('string');
    expect(Number.isFinite(w.at)).toBe(true);
  });
});

describe('isInQuietHours boundaries (AMB-07: [start, end), wrap, DST)', () => {
  const at = (date: string, time: string, zone = NY) => localToUtc({ date, time }, zone).at;
  it.each([
    ['QH-05 22:00 start inclusive', '22:00', true],
    ['21:59 outside', '21:59', false],
    ['QH-06 06:00 end exclusive', '06:00', false],
    ['05:59 inside', '05:59', true],
    ['midnight inside (wrap)', '00:00', true],
    ['noon outside', '12:00', false],
  ])('%s', (_n, time, expected) => {
    expect(isInQuietHours(at('2026-11-28', time), NIGHT, NY)).toBe(expected);
  });
  it('non-wrapping window [13:00, 15:00)', () => {
    const q = { enabled: true, startMin: 780, endMin: 900 };
    expect(isInQuietHours(at('2026-11-28', '13:00'), q, NY)).toBe(true);
    expect(isInQuietHours(at('2026-11-28', '14:59'), q, NY)).toBe(true);
    expect(isInQuietHours(at('2026-11-28', '15:00'), q, NY)).toBe(false);
  });
  it('disabled never matches', () =>
    expect(isInQuietHours(at('2026-11-28', '23:00'), { ...NIGHT, enabled: false }, NY)).toBe(
      false,
    ));
  it('QH-08 fall-back repeated hour: both 01:30 EDT and 01:30 EST are quiet', () => {
    expect(isInQuietHours(ms('2026-11-01T05:30:00.000Z'), NIGHT, NY)).toBe(true);
    expect(isInQuietHours(ms('2026-11-01T06:30:00.000Z'), NIGHT, NY)).toBe(true);
  });
  it('QH-09 spring-forward gap: 01:59 EST and 03:00 EDT are quiet; nothing exists at 02:xx', () => {
    expect(isInQuietHours(ms('2026-03-08T06:59:00.000Z'), NIGHT, NY)).toBe(true);
    expect(isInQuietHours(ms('2026-03-08T07:00:00.000Z'), NIGHT, NY)).toBe(true);
  });
  it('the same instant is judged by the zone given, never the host', () => {
    const t = ms('2026-11-28T08:05:00.000Z');
    expect(isInQuietHours(t, NIGHT, NY)).toBe(true); // 03:05
    expect(isInQuietHours(t, NIGHT, LONDON)).toBe(false); // 08:05
  });
});
