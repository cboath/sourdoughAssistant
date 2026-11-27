import { visibleBanners, usePermissions } from '../store';

const base = {
  notifications: 'granted',
  exactAlarm: 'granted',
  failedCount: 0,
  budgetTrimmed: false,
  dismissed: { notifOff: false, alarmOff: false, budget: false },
} as const;

describe('visibleBanners', () => {
  it('shows nothing when all is well', () => {
    expect(visibleBanners(base)).toEqual([]);
    expect(visibleBanners({ ...base, notifications: 'unknown', exactAlarm: 'unknown' })).toEqual(
      [],
    );
  });

  it('shows notifications off for denied and for not yet asked', () => {
    expect(visibleBanners({ ...base, notifications: 'denied' })).toEqual(['notifOff']);
    expect(visibleBanners({ ...base, notifications: 'undetermined' })).toEqual(['notifOff']);
  });

  it('notifications off hides alarms off and failed', () => {
    expect(
      visibleBanners({ ...base, notifications: 'denied', exactAlarm: 'denied', failedCount: 2 }),
    ).toEqual(['notifOff']);
  });

  it('orders failed, alarms off, budget and shows at most two', () => {
    expect(
      visibleBanners({ ...base, failedCount: 1, exactAlarm: 'denied', budgetTrimmed: true }),
    ).toEqual(['notifFailed', 'alarmOff']);
    expect(visibleBanners({ ...base, exactAlarm: 'denied', budgetTrimmed: true })).toEqual([
      'alarmOff',
      'budget',
    ]);
  });

  it('respects dismissals', () => {
    expect(
      visibleBanners({
        ...base,
        notifications: 'denied',
        dismissed: { notifOff: true, alarmOff: false, budget: false },
      }),
    ).toEqual([]);
  });
});

describe('usePermissions', () => {
  it('dismisses and resets', () => {
    usePermissions.getState().dismiss('budget');
    expect(usePermissions.getState().dismissed.budget).toBe(true);
    usePermissions.getState().reset();
    expect(usePermissions.getState().dismissed.budget).toBe(false);
  });
});
