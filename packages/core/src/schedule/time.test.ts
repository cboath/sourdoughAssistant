import { describe, expect, it } from 'vitest';
import {
  formatInZone,
  fromIso,
  localToUtc,
  toIso,
  utcToLocal,
  zoneTransitionsBetween,
} from './time';

const NY = 'America/New_York';

describe('localToUtc', () => {
  it('converts an ordinary time (EST)', () => {
    const r = localToUtc({ date: '2026-11-28', time: '10:00' }, NY);
    expect(toIso(r.at)).toBe('2026-11-28T15:00:00.000Z');
    expect(r.adjustment).toBe('none');
  });

  it('converts an ordinary time (EDT)', () => {
    expect(toIso(localToUtc({ date: '2026-05-02', time: '10:00' }, NY).at)).toBe(
      '2026-05-02T14:00:00.000Z',
    );
  });

  it('moves a spring-forward gap time forward by the gap (02:30 -> 03:30 EDT)', () => {
    const r = localToUtc({ date: '2026-03-08', time: '02:30' }, NY);
    expect(toIso(r.at)).toBe('2026-03-08T07:30:00.000Z');
    expect(r.adjustment).toBe('shiftedForward');
    expect(utcToLocal(r.at, NY)).toMatchObject({
      date: '2026-03-08',
      time: '03:30',
      offsetMin: -240,
    });
  });

  it('02:00 exactly (first nonexistent minute) moves to 03:00 EDT', () => {
    const r = localToUtc({ date: '2026-03-08', time: '02:00' }, NY);
    expect(toIso(r.at)).toBe('2026-03-08T07:00:00.000Z');
    expect(r.adjustment).toBe('shiftedForward');
  });

  it('01:59 before the gap is unchanged', () => {
    const r = localToUtc({ date: '2026-03-08', time: '01:59' }, NY);
    expect(toIso(r.at)).toBe('2026-03-08T06:59:00.000Z');
    expect(r.adjustment).toBe('none');
  });

  it('03:00 right after the gap is unchanged', () => {
    const r = localToUtc({ date: '2026-03-08', time: '03:00' }, NY);
    expect(toIso(r.at)).toBe('2026-03-08T07:00:00.000Z');
    expect(r.adjustment).toBe('none');
  });

  it('uses the first occurrence for a fall-back repeated time (01:30 -> EDT)', () => {
    const r = localToUtc({ date: '2026-11-01', time: '01:30' }, NY);
    expect(toIso(r.at)).toBe('2026-11-01T05:30:00.000Z');
    expect(r.adjustment).toBe('ambiguousEarlier');
  });

  it('02:00 after the repeated hour is EST and unambiguous', () => {
    const r = localToUtc({ date: '2026-11-01', time: '02:00' }, NY);
    expect(toIso(r.at)).toBe('2026-11-01T07:00:00.000Z');
    expect(r.adjustment).toBe('none');
  });

  it('handles a 30 minute gap (Lord Howe)', () => {
    // 2026-10-04 02:00 +10:30 jumps to 02:30 +11:00; 02:15 does not exist.
    const r = localToUtc({ date: '2026-10-04', time: '02:15' }, 'Australia/Lord_Howe');
    expect(r.adjustment).toBe('shiftedForward');
    expect(utcToLocal(r.at, 'Australia/Lord_Howe')).toMatchObject({
      time: '02:45',
      offsetMin: 660,
    });
  });

  it('handles a half-hour zone without DST', () => {
    expect(toIso(localToUtc({ date: '2026-05-02', time: '10:00' }, 'Asia/Kolkata').at)).toBe(
      '2026-05-02T04:30:00.000Z',
    );
  });

  it('throws on malformed input and unknown zones', () => {
    expect(() => localToUtc({ date: '2026-02-30', time: '10:00' }, NY)).toThrow();
    expect(() => localToUtc({ date: '2026-02-01', time: '25:00' }, NY)).toThrow();
    expect(() => localToUtc({ date: '2026-02-01', time: '10:00' }, 'Not/AZone')).toThrow();
  });

  it('does not depend on the host zone (round trip over a year)', () => {
    for (const zone of [NY, 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
      for (let day = 0; day < 365; day++) {
        const at = Date.UTC(2026, 0, 1 + day, 15);
        const l = utcToLocal(at, zone);
        const back = localToUtc({ date: l.date, time: l.time }, zone);
        // Round-trips exactly except in the repeated hour, where the first occurrence wins.
        expect(back.at).toBeLessThanOrEqual(at);
        expect(at - back.at).toBeLessThanOrEqual(60 * 60_000);
      }
    }
  });
});

describe('utcToLocal / formatInZone / ISO', () => {
  it('reports local date, time and offset', () => {
    expect(utcToLocal(Date.parse('2026-11-28T08:05:00Z'), NY)).toEqual({
      date: '2026-11-28',
      time: '03:05',
      offsetMin: -300,
    });
    expect(utcToLocal(Date.parse('2026-05-02T04:30:00Z'), 'Asia/Kolkata')).toEqual({
      date: '2026-05-02',
      time: '10:00',
      offsetMin: 330,
    });
  });

  it('formats with a pattern', () => {
    expect(formatInZone(Date.parse('2026-11-28T08:05:00Z'), NY, 'EEE h:mm a')).toBe('Sat 3:05 AM');
  });

  it('formats Lord Howe (30 minute DST shift) from the Intl wall clock', () => {
    const LH = 'Australia/Lord_Howe';
    // Summer (UTC+11) and winter (UTC+10:30), and both sides of the April fall-back
    expect(formatInZone(Date.parse('2026-01-15T00:00:00Z'), LH, 'yyyy-MM-dd HH:mm')).toBe(
      '2026-01-15 11:00',
    );
    expect(formatInZone(Date.parse('2026-07-15T00:00:00Z'), LH, 'yyyy-MM-dd HH:mm')).toBe(
      '2026-07-15 10:30',
    );
    expect(formatInZone(Date.parse('2026-04-04T14:45:00Z'), LH, 'HH:mm')).toBe('01:45');
    expect(formatInZone(Date.parse('2026-04-04T15:15:00Z'), LH, 'HH:mm')).toBe('01:45');
    for (const iso of ['2026-04-04T14:30:00Z', '2026-10-03T15:45:00Z', '2026-10-03T16:15:00Z']) {
      const l = utcToLocal(Date.parse(iso), LH);
      expect(formatInZone(Date.parse(iso), LH, 'yyyy-MM-dd HH:mm')).toBe(`${l.date} ${l.time}`);
    }
  });

  it('round trips ISO and rejects garbage', () => {
    const at = Date.parse('2026-11-28T15:00:00.000Z');
    expect(fromIso(toIso(at))).toBe(at);
    expect(() => fromIso('nope')).toThrow();
  });
});

describe('zoneTransitionsBetween', () => {
  it('finds the spring-forward instant (strictly inside)', () => {
    const t = zoneTransitionsBetween(
      Date.parse('2026-03-08T00:00:00Z'),
      Date.parse('2026-03-09T00:00:00Z'),
      NY,
    );
    expect(t).toEqual([{ at: Date.parse('2026-03-08T07:00:00Z'), offsetChangeMin: 60 }]);
  });

  it('finds the fall-back instant', () => {
    const t = zoneTransitionsBetween(
      Date.parse('2026-10-31T12:00:00Z'),
      Date.parse('2026-11-02T12:00:00Z'),
      NY,
    );
    expect(t).toEqual([{ at: Date.parse('2026-11-01T06:00:00Z'), offsetChangeMin: -60 }]);
  });

  it('is strict at both ends and empty outside', () => {
    const at = Date.parse('2026-03-08T07:00:00Z');
    expect(zoneTransitionsBetween(at, at + 3_600_000, NY)).toEqual([]);
    expect(zoneTransitionsBetween(at - 3_600_000, at, NY)).toEqual([]);
    expect(
      zoneTransitionsBetween(
        Date.parse('2026-05-01T00:00:00Z'),
        Date.parse('2026-05-03T00:00:00Z'),
        NY,
      ),
    ).toEqual([]);
    expect(zoneTransitionsBetween(at, at - 1, NY)).toEqual([]);
  });

  it('reports a 30 minute change', () => {
    const t = zoneTransitionsBetween(
      Date.parse('2026-10-03T00:00:00Z'),
      Date.parse('2026-10-05T00:00:00Z'),
      'Australia/Lord_Howe',
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.offsetChangeMin).toBe(30);
  });
});
