/**
 * A stand-in for `expo-router` in screen tests. Use it from a test file with:
 *   jest.mock('expo-router', () => jest.requireActual('<path>/__tests__/helpers/mockRouter').mockExpoRouter);
 * Spies and the current params live in `routerSpies`.
 */
import type { ReactNode } from 'react';

export const routerSpies = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  params: {} as Record<string, string | string[] | undefined>,
  /** The options of the last `<Stack.Screen>` rendered (header buttons live here). */
  options: undefined as undefined | Record<string, unknown>,
  reset() {
    this.push.mockClear();
    this.back.mockClear();
    this.replace.mockClear();
    this.navigate.mockClear();
    this.dismiss.mockClear();
    this.dismissAll.mockClear();
    this.params = {};
    this.options = undefined;
  },
};

const router = {
  push: (...a: unknown[]) => routerSpies.push(...a),
  back: (...a: unknown[]) => routerSpies.back(...a),
  replace: (...a: unknown[]) => routerSpies.replace(...a),
  navigate: (...a: unknown[]) => routerSpies.navigate(...a),
  dismiss: (...a: unknown[]) => routerSpies.dismiss(...a),
  dismissAll: (...a: unknown[]) => routerSpies.dismissAll(...a),
  canGoBack: () => true,
};
const navigation = { addListener: () => () => undefined, dispatch: jest.fn() };

function Screen({ options }: { options?: Record<string, unknown> }): null {
  routerSpies.options = options;
  return null;
}
function Stack({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
Stack.Screen = Screen;

export const mockExpoRouter = {
  useRouter: () => router,
  useNavigation: () => navigation,
  useLocalSearchParams: () => routerSpies.params,
  Stack,
};
