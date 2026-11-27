/** FlashList needs real layout; tests render every row with this stand-in:
 *   jest.mock('@shopify/flash-list', () => jest.requireActual('<path>/__tests__/helpers/flashListMock'));
 */
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

interface Props<T> {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: ReactNode;
}

export function FlashList<T>({ data, renderItem, keyExtractor, ListHeaderComponent }: Props<T>) {
  return (
    <View>
      {ListHeaderComponent}
      {data.map((item, index) => (
        <View key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, index })}
        </View>
      ))}
    </View>
  );
}
