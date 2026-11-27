/**
 * Header buttons are passed to `<Stack.Screen options>` (the mock records them). These helpers read
 * and press them by calling the element's own props, so the screen under test stays mounted.
 */
import { act } from '@testing-library/react-native';
import { isValidElement, type ReactElement } from 'react';
import { routerSpies } from './mockRouter';

type HeaderFn = () => ReactElement<{ label?: string; onPress: () => void; disabled?: boolean }>;

export function headerButton(side: 'headerLeft' | 'headerRight' = 'headerRight') {
  const make = routerSpies.options?.[side] as HeaderFn | undefined;
  if (!make) throw new Error(`No ${side} in the screen options`);
  return make().props;
}

export async function pressHeaderButton(
  label: string,
  side: 'headerLeft' | 'headerRight' = 'headerRight',
) {
  const props = headerButton(side);
  if (props.label !== label) throw new Error(`Expected "${label}" but found "${props.label}"`);
  await act(async () => {
    props.onPress();
  });
}

export function headerTitle(): string | undefined {
  return routerSpies.options?.title as string | undefined;
}

type AnyElement = ReactElement<{ testID?: string; onPress?: () => void; children?: unknown }>;

function findByTestId(node: unknown, testID: string): AnyElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByTestId(child, testID);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const element = node as AnyElement;
  if (element.props.testID === testID) return element;
  return findByTestId(element.props.children, testID);
}

/**
 * Presses a button inside `headerRight` by its testID, such as the detail screen's `detail-more`.
 * The mock only records the header, so this walks the recorded element and calls its `onPress`.
 * (Rendering it separately would replace RNTL's global `screen`.)
 */
export async function pressHeaderRightByTestId(testID: string) {
  const make = routerSpies.options?.headerRight as (() => ReactElement) | undefined;
  if (!make) throw new Error('No headerRight in the screen options');
  const found = findByTestId(make(), testID);
  if (!found?.props.onPress) throw new Error(`No pressable "${testID}" in headerRight`);
  await act(async () => {
    found.props.onPress?.();
  });
}
