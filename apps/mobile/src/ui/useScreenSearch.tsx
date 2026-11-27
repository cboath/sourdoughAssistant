import type { NativeStackNavigationOptions } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { SearchField } from './components/SearchField';
import { ContentColumn } from './components/ContentColumn';

/**
 * Search for list roots: iOS uses the native nav-bar search (`headerSearchBarOptions`), Android
 * the in-list pill (`field`).
 */
export function useScreenSearch(placeholder: string): {
  query: string;
  setQuery: (query: string) => void;
  headerOptions: NativeStackNavigationOptions;
  field: ReactNode;
} {
  const [query, setQueryState] = useState('');
  // The native iOS search bar keeps its own text, so clearing from code has to clear it too.
  const searchBar = useRef<SearchBarCommands | null>(null);
  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    if (next === '') {
      searchBar.current?.clearText();
      searchBar.current?.blur();
    }
  }, []);
  const ios = Platform.OS === 'ios';
  const headerOptions = useMemo<NativeStackNavigationOptions>(
    () =>
      ios
        ? {
            headerSearchBarOptions: {
              placeholder,
              ref: searchBar,
              autoCapitalize: 'none',
              onChangeText: (event) => setQueryState(event.nativeEvent.text),
              onCancelButtonPress: () => setQueryState(''),
            },
          }
        : {},
    [ios, placeholder],
  );
  const field = ios ? null : (
    <ContentColumn>
      <SearchField
        value={query}
        onChangeText={setQuery}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
      />
    </ContentColumn>
  );
  return { query, setQuery, headerOptions, field };
}
