/**
 * QA-04 / M5: "a large mark done target (at least 56 pt/dp)". RNTL has no layout engine, so this
 * checks the declared minimum height on the buttons the baker taps with floury hands. The real
 * measurement and the largest-text check stay manual (`docs/test-plan.md` section 7).
 */
import { configure, screen } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { LiveBakeScreen } from '../components/LiveBakeScreen';
import { ZONE, at, makeBake, seededDb, startAt } from './helpers';

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30_000);

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('@shopify/flash-list', () =>
  jest.requireActual('../../../__tests__/helpers/flashListMock'),
);
jest.mock('../../notifications/components/ReminderBanners', () => ({
  ReminderBanners: () => null,
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));

const originalNow = clock.now;
const originalZone = clock.zone;

afterEach(() => {
  clock.now = originalNow;
  clock.zone = originalZone;
  clearClients();
  jest.restoreAllMocks();
});

interface Node {
  props: { style?: unknown };
  children?: unknown[];
}

/** The largest declared `minHeight` on the node or anything inside it. */
function minHeightOf(node: Node): number {
  const own = ReactNative.StyleSheet.flatten(node.props.style as never)?.minHeight;
  const inner = (node.children ?? [])
    .filter((c): c is Node => typeof c === 'object' && c !== null && 'props' in c)
    .map(minHeightOf);
  return Math.max(typeof own === 'number' ? own : 0, ...inner);
}

describe('M5: large mark-done targets', () => {
  it.each([
    ['phone', 390, 844],
    ['small phone', 320, 568],
  ])(
    'Done is at least 56 on a %s, at the default and the largest font scale',
    async (_name, width, height) => {
      for (const fontScale of [1, 2.35]) {
        clock.now = () => at('2026-11-27', '17:00');
        clock.zone = () => ZONE;
        jest
          .spyOn(ReactNative, 'useWindowDimensions')
          .mockReturnValue({ width, height, scale: 3, fontScale });
        const db = await seededDb();
        let bake = await makeBake(db);
        bake = await startAt(db, bake, 'Bulk ferment');
        const view = await renderScreen(<LiveBakeScreen id={bake.bake.id} />, { db });
        const done = await screen.findByRole('button', { name: 'Done, start Shape' });
        expect(minHeightOf(done as unknown as Node)).toBeGreaterThanOrEqual(56);
        await view.unmount();
        clearClients();
      }
    },
  );
});
