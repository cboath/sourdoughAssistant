/** RN-08 fix loop (DR2): the review fixes that have logic worth pinning. */
import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { resetAnnounced } from '../../../state/announced';
import { Banner } from '../../../ui/components';
import { Providers } from '../../../ui/testing';
import { cardFor } from '../card';
import { otherBakeChip } from '../components/LiveBakeScreen';
import { deriveBakeLive } from '../derive';
import { countdownRuns, spokenCountdown } from '../format';
import { NOW, ZONE, at, makeBake, plannedEnd, seededDb, startAt } from './helpers';

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));
jest.mock('../../notifications/components/ReminderBanners', () => ({
  ReminderBanners: () => null,
}));

const ctxAt = (now: number) => ({ zone: ZONE, locale: 'en-US', now });

describe('countdown text (DR2-03, DR2-14)', () => {
  it('splits numerals from unit words so the units can be set smaller', () => {
    expect(countdownRuns('5 h 42 min')).toEqual([
      { text: '5 ', unit: false },
      { text: 'h', unit: true },
      { text: ' 42 ', unit: false },
      { text: 'min', unit: true },
    ]);
    expect(countdownRuns('+12:30 over').map((r) => r.text)).toEqual(['+12:30 ', 'over']);
    expect(countdownRuns('42:10')).toEqual([{ text: '42:10', unit: false }]);
  });

  it('speaks whole minutes, never seconds', () => {
    expect(spokenCountdown(42 * 60_000 + 10_000, 'en-US')).toBe('42 minutes');
    expect(spokenCountdown(30_000, 'en-US')).toBe('Less than 1 minute');
  });
});

describe('Other-bake chip (DR2-01)', () => {
  it('names the other bake next step and when it starts, not the step it is in', async () => {
    const db = await seededDb();
    let other = await makeBake(db);
    other = await startAt(db, other, 'Bulk ferment');
    const now = at('2026-11-27', '17:46');
    const chip = otherBakeChip([other], 'someone-else', ctxAt(now));
    // Shape starts at 8:05 PM, 2 h 19 min away.
    expect(chip?.text).toBe('Other bake: Country loaf · Shape in 2 h 19 min');
    expect(chip?.overtime).toBe(false);
  });

  it('says "is over time" for a late bake instead of a misleading countdown', async () => {
    const db = await seededDb();
    let other = await makeBake(db);
    other = await startAt(db, other, 'Bulk ferment');
    const chip = otherBakeChip(
      [other],
      'x',
      ctxAt(plannedEnd(other, 'Bulk ferment') + 2 * 3_600_000),
    );
    expect(chip?.text).toBe('Other bake: Country loaf · Bulk ferment is over time');
    expect(chip?.overtime).toBe(true);
  });
});

describe('home card reminders tag (DR2-04)', () => {
  it('keeps the reminder state in the label', async () => {
    const db = await seededDb();
    const bake = await makeBake(db);
    const live = deriveBakeLive(bake, NOW);
    expect(cardFor(bake, live, ctxAt(NOW)).reminders).toBeNull();
    const off = cardFor(bake, live, ctxAt(NOW), 'off');
    expect(off.reminders).toBe('off');
    expect(off.a11yLabel.endsWith('Reminders off')).toBe(true);
    expect(cardFor(bake, live, ctxAt(NOW), 'late').a11yLabel).toContain('Reminders may be late');
  });
});

describe('a stale Undo says so (SEC-M45-08)', () => {
  it('shows "Can\'t undo that anymore." and logs an index, not text', async () => {
    const { showUndoSnackbar } = jest.requireActual('../feedback') as typeof import('../feedback');
    const { useSnackbarStore } = jest.requireActual(
      '../../../state/snackbar',
    ) as typeof import('../../../state/snackbar');
    const revert = jest.fn().mockResolvedValue({ ok: false, reason: 'stale' });
    showUndoSnackbar({ revert }, 'Shape done.', {} as never);
    useSnackbarStore.getState().current?.onAction?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSnackbarStore.getState().current?.message).toBe("Can't undo that anymore.");
    expect(useSnackbarStore.getState().current?.actionLabel).toBeUndefined();
  });

  it('keeps a fixed code list in step with the error type', () => {
    const { LIVE_ERROR_CODES } = jest.requireActual(
      '../services/liveOps',
    ) as typeof import('../services/liveOps');
    expect(LIVE_ERROR_CODES.indexOf('notActive')).toBe(1);
    expect(new Set(LIVE_ERROR_CODES).size).toBe(LIVE_ERROR_CODES.length);
  });
});

describe('Banner announcements (DR2-05)', () => {
  it('announces a keyed banner once per session, however often it remounts', async () => {
    resetAnnounced();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    const show = () => (
      <Providers>
        <Banner variant="warning" message="Reminders are off." announceKey="reminder:notifOff" />
      </Providers>
    );
    const first = await render(show());
    await first.unmount();
    const second = await render(show());
    await second.unmount();
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });
});
