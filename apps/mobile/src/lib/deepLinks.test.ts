import { sanitizeIncomingPath } from './deepLinks';

const BAKE = '3f0c2a52-6b0e-4a43-9a53-1d1d7a0a6a11';
const STEP = '9b2f6d2e-1c1a-4c0e-8f3b-5a7d1e2c3b44';
const SCHEME = 'com.cboath.sourdoughassistant';

describe('sanitizeIncomingPath (SEC-01 M2)', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    [`/bake/${BAKE}`, `/bake/${BAKE}`],
    [`/bake/${BAKE}/`, `/bake/${BAKE}`],
    [`bake/${BAKE}`, `/bake/${BAKE}`],
    [`/bake/${BAKE}?step=${STEP}`, `/bake/${BAKE}?step=${STEP}`],
    [`${SCHEME}://bake/${BAKE}`, `/bake/${BAKE}`],
    [`${SCHEME}://bake/${BAKE}?step=${STEP}`, `/bake/${BAKE}?step=${STEP}`],
  ])('allows %s', (input, expected) => {
    expect(sanitizeIncomingPath(input)).toBe(expected);
  });

  it.each([
    '/import',
    `${SCHEME}://import?file=file:///etc/passwd`,
    '/settings/backup?action=undo',
    '/recipe-editor/new?duplicateOf=' + BAKE,
    '/pantry-editor/new?name=x&returnTo=ingredient',
    '/bake/schedule',
    '/bake/not-a-uuid',
    `/bake/${BAKE}/timeline`,
    `/bake/${BAKE}?step=nope`,
    `/bake/${BAKE}?step=${STEP}&action=cancel`,
    `/bake/${BAKE}?step=${STEP}&step=${STEP}`,
    `/bake/${BAKE}?other=${STEP}`,
    `/bake/${BAKE}#frag`,
    `/bake/${BAKE}/../../import`,
    `https://example.com/bake/${BAKE}`,
    `/bake/${BAKE}?step=${STEP}?x=1`,
    `/bake/${BAKE.toUpperCase().replace('A', 'Z')}`,
    `/${'a'.repeat(400)}`,
  ])('rewrites %s to /', (input) => {
    expect(sanitizeIncomingPath(input)).toBe('/');
  });
});

describe('sanitizeIncomingPath dev-only route (IO-01)', () => {
  const g = globalThis as { __DEV__?: boolean };
  const original = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = original;
  });

  it('admits the spike route only when __DEV__ is true', () => {
    g.__DEV__ = true;
    expect(sanitizeIncomingPath('/dev-notifications')).toBe('/dev-notifications');
    expect(sanitizeIncomingPath(`${SCHEME}://dev-notifications`)).toBe('/dev-notifications');
    expect(sanitizeIncomingPath('/dev-notifications?x=1')).toBe('/');
    expect(sanitizeIncomingPath('/dev-other')).toBe('/');
    g.__DEV__ = false;
    expect(sanitizeIncomingPath('/dev-notifications')).toBe('/');
    expect(sanitizeIncomingPath(`${SCHEME}://dev-notifications`)).toBe('/');
  });
});
