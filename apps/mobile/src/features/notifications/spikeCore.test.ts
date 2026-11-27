import {
  classifyPermission,
  describeCap,
  isSpikeId,
  planSpikeBatch,
  spikeId,
  summarizePending,
} from './spikeCore';

describe('spikeCore (IO-01)', () => {
  it('classifies iOS permission states', () => {
    expect(classifyPermission({ ios: { status: 0 } })).toBe('undetermined');
    expect(classifyPermission({ ios: { status: 1 } })).toBe('denied');
    expect(classifyPermission({ ios: { status: 2 } })).toBe('authorized');
    expect(classifyPermission({ ios: { status: 3 } })).toBe('provisional');
    expect(classifyPermission({ ios: { status: 99 } })).toBe('unknown');
    expect(classifyPermission({ granted: true })).toBe('authorized');
    expect(classifyPermission({ granted: false, canAskAgain: false })).toBe('denied');
  });

  it('keeps spike ids inside the satest: namespace, apart from sa1:', () => {
    expect(spikeId(1700000000000, 3)).toBe('satest:1700000000000:3');
    expect(isSpikeId('satest:1:1')).toBe(true);
    expect(isSpikeId('sa1:bake:step:start')).toBe(false);
  });

  it('plans an ordered batch and clamps its size', () => {
    const items = planSpikeBatch({ count: 3, firstDelaySec: 10, spacingSec: 60, nowMs: 1000 });
    expect(items.map((i) => i.fireAtMs)).toEqual([11000, 71000, 131000]);
    expect(new Set(items.map((i) => i.identifier)).size).toBe(3);
    expect(planSpikeBatch({ count: 5000, firstDelaySec: 0, spacingSec: 0, nowMs: 0 })).toHaveLength(
      100,
    );
    expect(planSpikeBatch({ count: -4, firstDelaySec: 0, spacingSec: 0, nowMs: 0 })).toHaveLength(
      0,
    );
  });

  it('summarizes pending requests and the cap', () => {
    expect(summarizePending(['satest:1:1', 'sa1:x', 'other'])).toEqual({
      total: 3,
      spike: 1,
      other: 2,
    });
    expect(describeCap(60)).toMatch(/budget/);
    expect(describeCap(64)).toMatch(/under the iOS cap/);
    expect(describeCap(65)).toMatch(/above the iOS cap/);
  });
});
