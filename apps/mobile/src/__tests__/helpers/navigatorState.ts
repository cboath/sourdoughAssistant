/**
 * State and the `expo-router` stand-in for `Navigator` (kept apart from the screens so the
 * jest.mock factory does not import screens that import expo-router).
 */

import { mockExpoRouter, routerSpies } from './mockRouter';

type BeforeRemove = (event: {
  defaultPrevented: boolean;
  preventDefault(): void;
  data: { action: unknown };
}) => void;

export const state = {
  stack: [] as string[],
  setStack: undefined as undefined | ((next: string[]) => void),
  listeners: new Set<BeforeRemove>(),
};

export function commit(next: string[]) {
  state.stack = next;
  state.setStack?.(next);
}

/** The current stack, bottom first. */
export const navigatorStack = () => [...state.stack];
export const navigatorTop = () => state.stack[state.stack.length - 1];

export function resetNavigator() {
  state.stack = [];
  state.setStack = undefined;
  state.listeners.clear();
  for (const spy of [
    routerSpies.push,
    routerSpies.back,
    routerSpies.replace,
    routerSpies.navigate,
    routerSpies.dismissAll,
  ]) {
    spy.mockReset();
  }
}

const POP = { type: 'POP' };

const navigation = {
  addListener: (type: string, listener: BeforeRemove) => {
    if (type !== 'beforeRemove') return () => undefined;
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
  /** The guard re-dispatches the blocked action once the user confirms. */
  dispatch: () => commit(state.stack.slice(0, -1)),
};

export function install() {
  routerSpies.push.mockImplementation((path: unknown) => commit([...state.stack, String(path)]));
  routerSpies.replace.mockImplementation((path: unknown) =>
    commit([...state.stack.slice(0, -1), String(path)]),
  );
  routerSpies.navigate.mockImplementation((path: unknown) => commit([String(path)]));
  routerSpies.dismissAll.mockImplementation(() => commit(state.stack.slice(0, 1)));
  routerSpies.back.mockImplementation(() => {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      data: { action: POP },
    };
    [...state.listeners].forEach((listener) => listener(event));
    if (!event.defaultPrevented && state.stack.length > 1) commit(state.stack.slice(0, -1));
  });
}

export const mockExpoRouterWithNavigator = {
  ...mockExpoRouter,
  useNavigation: () => navigation,
};
