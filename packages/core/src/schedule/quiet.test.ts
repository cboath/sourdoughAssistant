import { describe, expect, it } from 'vitest';
import { planBake, type BakePlan, type PlanInput } from './backward';
import { defaultTemplate } from './fixtures';
import { isInQuietHours, quietHoursWarnings, type QuietHours } from './quiet';
import { localToUtc } from './time';
import type { DurationOptions } from './durations';

const NY = 'America/New_York';
const night: QuietHours = { enabled: true, startMin: 22 * 60, endMin: 6 * 60 };

function plan(readyDate: string, durations?: DurationOptions): BakePlan {
  const input: PlanInput = {
    items: [{ itemId: 'a', label: 'A', steps: defaultTemplate(), loaves: 1, durations }],
    ovenCapacity: 1,
  };
  const r = planBake(input, {
    mode: 'backward',
    readyAt: localToUtc({ date: readyDate, time: '10:00' }, NY).at,
    now: 0,
  });
  if (r.status !== 'ok') throw new Error('plan failed');
  return r.plan;
}
const z = (iso: string) => Date.parse(iso);

describe('isInQuietHours', () => {
  it('wraps past midnight; start inclusive, end exclusive (QH-05, QH-06)', () => {
    // 2026-05-02 NY is EDT (UTC-4)
    expect(isInQuietHours(z('2026-05-02T02:00:00Z'), night, NY)).toBe(true); // 22:00 EDT
    expect(isInQuietHours(z('2026-05-02T01:59:00Z'), night, NY)).toBe(false); // 21:59
    expect(isInQuietHours(z('2026-05-02T10:00:00Z'), night, NY)).toBe(false); // 06:00
    expect(isInQuietHours(z('2026-05-02T09:59:00Z'), night, NY)).toBe(true); // 05:59
  });

  it('same-day window (QH-04)', () => {
    const q = { enabled: true, startMin: 13 * 60, endMin: 15 * 60 };
    expect(isInQuietHours(z('2026-05-02T17:00:00Z'), q, NY)).toBe(true); // 13:00
    expect(isInQuietHours(z('2026-05-02T19:00:00Z'), q, NY)).toBe(false); // 15:00
  });

  it('disabled or start === end is an empty window', () => {
    expect(isInQuietHours(z('2026-05-02T05:00:00Z'), { ...night, enabled: false }, NY)).toBe(false);
    expect(
      isInQuietHours(z('2026-05-02T05:00:00Z'), { enabled: true, startMin: 600, endMin: 600 }, NY),
    ).toBe(false);
  });

  it('uses the zone passed in', () => {
    // 2026-05-02T02:00Z is 22:00 EDT but 07:30 IST
    expect(isInQuietHours(z('2026-05-02T02:00:00Z'), night, 'Asia/Kolkata')).toBe(false);
  });

  it('fall-back repeated hour: both 01:30s warn (QH-08)', () => {
    expect(isInQuietHours(z('2026-11-01T05:30:00Z'), night, NY)).toBe(true);
    expect(isInQuietHours(z('2026-11-01T06:30:00Z'), night, NY)).toBe(true);
  });

  it('spring-forward gap: 01:59 EST and 03:00 EDT both warn (QH-09)', () => {
    expect(isInQuietHours(z('2026-03-08T06:59:00Z'), night, NY)).toBe(true);
    expect(isInQuietHours(z('2026-03-08T07:00:00Z'), night, NY)).toBe(true);
  });
});

describe('quietHoursWarnings', () => {
  it('SCH-01 with 22:00 to 06:00: one warning at the 03:05 feeding, nothing moved (QH-01, QH-10)', () => {
    const p = plan('2026-05-02');
    const before = JSON.stringify(p);
    const w = quietHoursWarnings(p, night, NY);
    expect(w).toEqual([{ code: 'quietHours', stepKey: 'a:feed', at: z('2026-05-01T07:05:00Z') }]);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('18 h cold ferment: only Mix and rest at 05:05 warns (QH-02)', () => {
    const w = quietHoursWarnings(plan('2026-05-02', { overrides: { cold: 1080 } }), night, NY);
    expect(w).toEqual([{ code: 'quietHours', stepKey: 'a:mix', at: z('2026-05-01T09:05:00Z') }]);
  });

  it('disabled or empty gives no warnings (QH-03)', () => {
    expect(quietHoursWarnings(plan('2026-05-02'), { ...night, enabled: false }, NY)).toEqual([]);
    expect(
      quietHoursWarnings(plan('2026-05-02'), { enabled: true, startMin: 0, endMin: 0 }, NY),
    ).toEqual([]);
  });

  it('same-day window 13:00 to 15:00 warns for fold 3, fold 4 and bulk only (QH-04)', () => {
    const w = quietHoursWarnings(
      plan('2026-05-02'),
      { enabled: true, startMin: 13 * 60, endMin: 15 * 60 },
      NY,
    );
    expect(
      w.map((x) =>
        x.code === 'quietHours' ? `${x.stepKey}${x.foldIndex ? `#${x.foldIndex}` : ''}` : '',
      ),
    ).toEqual(['a:folds#3', 'a:folds#4', 'a:bulk']);
  });

  it('fold reminders 2..n warn individually; fold 1 is covered by the step start', () => {
    const q = { enabled: true, startMin: 12 * 60 + 30, endMin: 13 * 60 };
    const w = quietHoursWarnings(plan('2026-05-02'), q, NY);
    expect(w).toEqual([
      { code: 'quietHours', stepKey: 'a:folds', at: z('2026-05-01T16:35:00Z'), foldIndex: 2 },
    ]);
  });

  it('includes alongside steps (preheat)', () => {
    const q = { enabled: true, startMin: 7 * 60 + 40, endMin: 7 * 60 + 50 };
    expect(quietHoursWarnings(plan('2026-05-02'), q, NY)).toEqual([
      { code: 'quietHours', stepKey: 'bake:preheat', at: z('2026-05-02T11:45:00Z') },
    ]);
  });
});
