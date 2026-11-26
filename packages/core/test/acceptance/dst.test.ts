/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: DST and time zones (core-cases section 6, ADR 0005). Explicit zones only; run also under TZ=UTC/LA/Kolkata in CI. */
import { describe, expect, it } from 'vitest';
import {
  dstWarnings,
  formatInZone,
  fromIso,
  localToUtc,
  toIso,
  utcToLocal,
  zoneTransitionsBetween,
} from '../../src/schedule/time';
import { backward, forward } from './support/plan';
import {
  CHAIN,
  FALL,
  input,
  ITEM,
  iso,
  KOLKATA,
  LONDON,
  LORD_HOWE,
  MIN,
  ms,
  NY,
  SPRING,
  startsByStep,
  stepOf,
  TOTAL_MIN,
  UK_SPRING,
  type Expected,
} from './support/fixtures';

const FAR_PAST = ms('2025-01-01T00:00:00.000Z');
const plan = (e: Expected) => {
  const r = backward(input(), localToUtc(e.readyLocal, e.zone).at, FAR_PAST);
  expect(r.status).toBe('ok');
  return r.plan;
};
const hhmm = (at: number, zone: string) => formatInZone(at, zone, 'EEE HH:mm');

describe('DST-01 / DST-02 / DST-03: elapsed-time model (A1, ADR 0005)', () => {
  it.each([
    ['DST-01 US spring forward', SPRING],
    ['DST-02 US fall back', FALL],
    ['DST-03 UK spring forward', UK_SPRING],
  ])('%s: exact instants and local readings', (_n, e) => {
    const p = plan(e);
    expect(iso(p.readyAt)).toBe(e.readyUtc);
    expect(startsByStep(p)).toEqual(e.starts);
    for (const [stepId, local] of Object.entries(e.local)) {
      expect(hhmm(stepOf(p, ITEM, stepId).startAt, e.zone)).toBe(local);
    }
  });

  it('DST-01 cold ferment is 720 elapsed minutes but 13 clock hours; feed reads 02:05 not 03:05', () => {
    const p = plan(SPRING);
    const cold = stepOf(p, ITEM, 'cold');
    expect(cold.endAt - cold.startAt).toBe(720 * MIN);
    expect(formatInZone(cold.startAt, NY, 'HH:mm')).toBe('19:15');
    expect(formatInZone(cold.endAt, NY, 'HH:mm')).toBe('08:15');
    expect(p.readyAt - p.startAt).toBe(TOTAL_MIN * MIN);
    expect(formatInZone(p.startAt, NY, 'HH:mm')).toBe('02:05');
  });
  it('DST-02 cold ferment spans 11 clock hours; feed reads 04:05 not 03:05', () => {
    const p = plan(FALL);
    const cold = stepOf(p, ITEM, 'cold');
    expect(cold.endAt - cold.startAt).toBe(720 * MIN);
    expect(formatInZone(cold.startAt, NY, 'HH:mm')).toBe('21:15');
    expect(formatInZone(cold.endAt, NY, 'HH:mm')).toBe('08:15');
    expect(formatInZone(p.startAt, NY, 'HH:mm')).toBe('04:05');
  });

  it('DST-05 same instants rendered in America/Los_Angeles read 3 h earlier than New York', () => {
    const p = plan(SPRING);
    for (const s of p.steps) {
      const ny = utcToLocal(s.startAt, NY);
      const la = utcToLocal(s.startAt, 'America/Los_Angeles');
      expect(la.offsetMin - ny.offsetMin).toBe(-180);
    }
    expect(hhmm(stepOf(p, ITEM, 'feed').startAt, 'America/Los_Angeles')).toBe('Fri 23:05');
  });

  it('DST-07 start now across spring forward: 1855 elapsed min, ready Sun 19:55 EDT', () => {
    const now = ms('2026-03-07T17:00:00.000Z'); // Sat 12:00 EST
    const r = forward(input(), now);
    expect(r.status).toBe('ok');
    expect(iso(r.plan.readyAt)).toBe('2026-03-08T23:55:00.000Z');
    expect(formatInZone(r.plan.readyAt, NY, 'EEE HH:mm')).toBe('Sun 19:55');
  });
  it('DST-08 start now across fall back: ready Sun 17:55 EST', () => {
    const now = ms('2026-10-31T16:00:00.000Z'); // Sat 12:00 EDT
    const r = forward(input(), now);
    expect(iso(r.plan.readyAt)).toBe('2026-11-01T22:55:00.000Z');
    expect(formatInZone(r.plan.readyAt, NY, 'EEE HH:mm')).toBe('Sun 17:55');
  });
});

describe('dstWarnings and zoneTransitionsBetween', () => {
  it('DST-W1 spring: only the cold ferment spans the change (+60)', () => {
    expect(dstWarnings(plan(SPRING), NY)).toEqual([
      { code: 'dstTransition', stepKey: `${ITEM}:cold`, offsetChangeMin: 60 },
    ]);
  });
  it('DST-W2 fall: only the cold ferment spans the change (-60)', () => {
    expect(dstWarnings(plan(FALL), NY)).toEqual([
      { code: 'dstTransition', stepKey: `${ITEM}:cold`, offsetChangeMin: -60 },
    ]);
  });
  it('DST-W3 no DST nearby: no warnings; zones without DST never warn', () => {
    expect(dstWarnings(plan({ ...SPRING, ...{ readyUtc: '' } } as any), 'Asia/Kolkata')).toEqual(
      [],
    );
  });
  it('transitions strictly between instants', () => {
    expect(
      zoneTransitionsBetween(ms('2026-03-07T00:00:00.000Z'), ms('2026-03-09T00:00:00.000Z'), NY),
    ).toEqual([{ at: ms('2026-03-08T07:00:00.000Z'), offsetChangeMin: 60 }]);
    expect(
      zoneTransitionsBetween(ms('2026-10-31T00:00:00.000Z'), ms('2026-11-02T00:00:00.000Z'), NY),
    ).toEqual([{ at: ms('2026-11-01T06:00:00.000Z'), offsetChangeMin: -60 }]);
    expect(
      zoneTransitionsBetween(ms('2026-05-01T00:00:00.000Z'), ms('2026-05-03T00:00:00.000Z'), NY),
    ).toEqual([]);
    expect(
      zoneTransitionsBetween(
        ms('2026-01-01T00:00:00.000Z'),
        ms('2026-12-31T00:00:00.000Z'),
        KOLKATA,
      ),
    ).toEqual([]);
    // an instant exactly at `from` or `to` is not "strictly between"
    expect(
      zoneTransitionsBetween(ms('2026-03-08T07:00:00.000Z'), ms('2026-03-08T07:00:00.000Z'), NY),
    ).toEqual([]);
  });
  it('Lord Howe has a 30 minute shift', () => {
    expect(
      zoneTransitionsBetween(
        ms('2026-10-01T00:00:00.000Z'),
        ms('2026-10-10T00:00:00.000Z'),
        LORD_HOWE,
      ),
    ).toEqual([{ at: ms('2026-10-03T15:30:00.000Z'), offsetChangeMin: 30 }]);
  });
});

describe('localToUtc (AMB-04) and conversions', () => {
  it.each([
    ['plain winter', '2026-11-28', '10:00', NY, '2026-11-28T15:00:00.000Z', 'none'],
    ['plain summer', '2026-05-02', '10:00', NY, '2026-05-02T14:00:00.000Z', 'none'],
    ['Kolkata', '2026-05-02', '10:00', KOLKATA, '2026-05-02T04:30:00.000Z', 'none'],
    [
      'DST-09 NY gap 02:30 shifts forward to 03:30 EDT',
      '2026-03-08',
      '02:30',
      NY,
      '2026-03-08T07:30:00.000Z',
      'shiftedForward',
    ],
    [
      'DST-09b NY gap start 02:00 shifts to 03:00 EDT',
      '2026-03-08',
      '02:00',
      NY,
      '2026-03-08T07:00:00.000Z',
      'shiftedForward',
    ],
    [
      'DST-09c London gap 01:30 shifts to 02:30 BST',
      '2026-03-29',
      '01:30',
      LONDON,
      '2026-03-29T01:30:00.000Z',
      'shiftedForward',
    ],
    [
      'DST-09d Lord Howe 30 min gap 02:15 shifts to 02:45',
      '2026-10-04',
      '02:15',
      LORD_HOWE,
      '2026-10-03T15:45:00.000Z',
      'shiftedForward',
    ],
    [
      'DST-10 NY repeated 01:30 picks first (EDT)',
      '2026-11-01',
      '01:30',
      NY,
      '2026-11-01T05:30:00.000Z',
      'ambiguousEarlier',
    ],
    [
      'DST-10b London repeated 01:30 picks first (BST)',
      '2026-10-25',
      '01:30',
      LONDON,
      '2026-10-25T00:30:00.000Z',
      'ambiguousEarlier',
    ],
    ['just after the NY gap', '2026-03-08', '03:00', NY, '2026-03-08T07:00:00.000Z', 'none'],
    ['just before the NY gap', '2026-03-08', '01:59', NY, '2026-03-08T06:59:00.000Z', 'none'],
  ])('%s', (_n, date, time, zone, utc, adj) => {
    const r = localToUtc({ date, time }, zone);
    expect(iso(r.at)).toBe(utc);
    expect(r.adjustment).toBe(adj);
    expect(Number.isFinite(r.at)).toBe(true);
  });

  it('utcToLocal returns wall time and offset', () => {
    expect(utcToLocal(ms('2026-11-28T15:00:00.000Z'), NY)).toEqual({
      date: '2026-11-28',
      time: '10:00',
      offsetMin: -300,
    });
    expect(utcToLocal(ms('2026-05-02T14:00:00.000Z'), NY)).toEqual({
      date: '2026-05-02',
      time: '10:00',
      offsetMin: -240,
    });
    expect(utcToLocal(ms('2026-05-02T04:30:00.000Z'), KOLKATA)).toEqual({
      date: '2026-05-02',
      time: '10:00',
      offsetMin: 330,
    });
  });
  it('round trip local -> utc -> local for non-adjusted times', () => {
    for (const z of [NY, LONDON, KOLKATA, LORD_HOWE]) {
      const r = localToUtc({ date: '2026-07-15', time: '13:45' }, z);
      expect(utcToLocal(r.at, z)).toMatchObject({ date: '2026-07-15', time: '13:45' });
    }
  });
  it('formatInZone uses the given zone, not the host', () => {
    expect(formatInZone(ms('2026-11-28T15:00:00.000Z'), NY, 'yyyy-MM-dd HH:mm xxx')).toBe(
      '2026-11-28 10:00 -05:00',
    );
    expect(formatInZone(ms('2026-11-28T15:00:00.000Z'), KOLKATA, 'yyyy-MM-dd HH:mm xxx')).toBe(
      '2026-11-28 20:30 +05:30',
    );
  });
  it('toIso / fromIso round trip', () => {
    expect(toIso(ms('2026-11-28T15:00:00.000Z'))).toBe('2026-11-28T15:00:00.000Z');
    expect(fromIso('2026-11-28T15:00:00.000Z')).toBe(Date.UTC(2026, 10, 28, 15, 0, 0));
    const t = Date.UTC(2026, 10, 28, 15, 0, 0, 123);
    expect(fromIso(toIso(t))).toBe(t);
  });
});

describe('DST-04 / DST-12: whole-year sweep, instants never depend on the wall clock', () => {
  const zones = [NY, LONDON, KOLKATA, LORD_HOWE];
  it.each(zones)('DST-12 every day of 2026 in %s', (zone) => {
    let checked = 0;
    for (let d = 0; d < 365; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const ready = localToUtc({ date: day, time: '10:00' }, zone).at;
      const r = backward(input(), ready, FAR_PAST);
      expect(r.status).toBe('ok');
      let end = ready;
      for (const [id, min] of [...CHAIN].reverse()) {
        const s = stepOf(r.plan, ITEM, id);
        expect(Number.isFinite(s.startAt)).toBe(true);
        expect(s.endAt).toBe(end);
        expect(s.startAt).toBe(end - min * MIN);
        end = s.startAt;
      }
      expect(ready - end).toBe(TOTAL_MIN * MIN);
      checked++;
    }
    expect(checked).toBe(365);
  });
});
