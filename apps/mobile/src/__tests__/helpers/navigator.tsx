/**
 * A tiny in-memory navigator for multi-screen flows (QA-03). It renders only the top route, keeps a
 * stack, and drives it from the `routerSpies` (push, back, replace, navigate, dismissAll). `back()`
 * and the header close button go through `beforeRemove` listeners, so `useDiscardGuard` behaves as
 * it does under expo-router: the guard can prevent the pop and ask first.
 *
 * Use it from a test file with:
 *   jest.mock('expo-router', () => jest.requireActual('<path>/helpers/navigatorState').mockExpoRouterWithNavigator);
 * and render `<Navigator initial={['/recipes', '/recipe-editor/new']} />` with `renderScreen`.
 * Routes that do not exist yet (for example `/bake/<id>`, `/settings/cost`) render a
 * `route-not-found` marker, like the real app.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CostScreen } from '../../features/cost/components/CostScreen';
import { IngredientEditorScreen } from '../../features/recipes/components/IngredientEditorScreen';
import { RecipeDetailScreen } from '../../features/recipes/components/RecipeDetailScreen';
import { SchedulePickScreen } from '../../features/schedule/components/SchedulePickScreen';
import { SchedulePlanScreen } from '../../features/schedule/components/SchedulePlanScreen';
import { RecipeEditorScreen } from '../../features/recipes/components/RecipeEditorScreen';
import { RecipeListScreen } from '../../features/recipes/components/RecipeListScreen';
import { StepEditorScreen } from '../../features/recipes/components/StepEditorScreen';
import { Text } from '../../ui/components';
import { usePickedItem } from '../../features/pantry/pickedItem';
import { useRecipeDraft } from '../../features/recipes/store';
import { install, state } from './navigatorState';

export { navigatorStack, navigatorTop, resetNavigator } from './navigatorState';

function parse(path: string): { segments: string[]; query: URLSearchParams } {
  const [pathname = '', search = ''] = path.split('?');
  return { segments: pathname.split('/').filter(Boolean), query: new URLSearchParams(search) };
}

function Route({ path }: { path: string }) {
  const { segments, query } = parse(path);
  const [first, second, third] = segments;
  const loaves = query.get('loaves') ? Number(query.get('loaves')) : undefined;
  if (first === 'bake' && second === 'schedule' && third === 'plan') {
    return (
      <SchedulePlanScreen
        recipeId={query.get('recipeId') ?? undefined}
        loaves={query.get('loaves') ? Number(query.get('loaves')) : undefined}
      />
    );
  }
  if (first === 'bake' && second === 'schedule') return <SchedulePickScreen />;
  if (first === 'recipe-editor' && second === 'ingredient') {
    return (
      <IngredientEditorScreen
        lineId={query.get('lineId') ?? undefined}
        pantryItemId={query.get('pantryItemId') ?? undefined}
        role={query.get('role') === 'levain' ? 'levain' : undefined}
      />
    );
  }
  if (first === 'recipe-editor' && second === 'step') {
    return <StepEditorScreen stepId={query.get('stepId') ?? undefined} />;
  }
  if (first === 'recipe-editor' && second) {
    return <RecipeEditorScreen id={second} duplicateOf={query.get('duplicateOf') ?? undefined} />;
  }
  if (first === 'recipes' && second && third === 'cost') {
    return <CostScreen id={second} loaves={loaves} />;
  }
  if (first === 'recipes' && second) return <RecipeDetailScreen id={second} loaves={loaves} />;
  if (first === 'recipes') return <RecipeListScreen />;
  return (
    <View testID="route-not-found">
      <Text>{`Page not found: ${path}`}</Text>
    </View>
  );
}

export function Navigator({ initial }: { initial: string[] }) {
  const [stack, setStack] = useState(() => {
    state.stack = initial;
    state.setStack = undefined;
    install();
    return initial;
  });
  // Bind the setter during render so a push from a child's first effect is not lost.
  state.setStack = setStack;
  // app/recipe-editor/_layout.tsx drops the draft when the editor modal closes.
  const inEditor = stack.some((path) => path.startsWith('/recipe-editor'));
  useEffect(() => {
    if (inEditor) return;
    useRecipeDraft.getState().reset();
    usePickedItem.getState().clear();
  }, [inEditor]);
  const top = stack[stack.length - 1] as string;
  return (
    <View style={{ flex: 1 }} testID={`route:${top}`}>
      <Route key={top + stack.length} path={top} />
    </View>
  );
}
