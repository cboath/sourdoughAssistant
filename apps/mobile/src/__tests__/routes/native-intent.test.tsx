import { redirectSystemPath } from './+native-intent';

const BAKE = '3f0c2a52-6b0e-4a43-9a53-1d1d7a0a6a11';
const STEP = '9b2f6d2e-1c1a-4c0e-8f3b-5a7d1e2c3b44';

describe('+native-intent (SEC-01 M2)', () => {
  it('allows the bake deep link with an optional step', () => {
    expect(redirectSystemPath({ path: `/bake/${BAKE}?step=${STEP}`, initial: true })).toBe(
      `/bake/${BAKE}?step=${STEP}`,
    );
    expect(redirectSystemPath({ path: '/', initial: false })).toBe('/');
  });

  it.each(['/import', '/settings/backup?action=undo', `/recipe-editor/new?duplicateOf=${BAKE}`])(
    'sends %s to /',
    (path) => {
      expect(redirectSystemPath({ path, initial: false })).toBe('/');
    },
  );
});
