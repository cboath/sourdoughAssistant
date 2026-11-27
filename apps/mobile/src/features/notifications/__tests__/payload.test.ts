import { hashOf, pathForPayload } from '../payload';

const BAKE = '00000000-0000-4000-8000-000000000001';
const STEP = '00000000-0000-4000-8000-000000000002';

describe('pathForPayload', () => {
  it('deep-links a valid step payload', () => {
    expect(pathForPayload({ v: 1, kind: 'start', bakeId: BAKE, bakeStepId: STEP })).toEqual({
      path: `/bake/${BAKE}?step=${STEP}`,
      valid: true,
    });
    expect(
      pathForPayload({ v: 1, kind: 'fold', bakeId: BAKE, bakeStepId: STEP, foldIndex: 2 }).path,
    ).toBe(`/bake/${BAKE}?step=${STEP}`);
  });

  it('opens / for the test reminder and the top-up sentinel', () => {
    expect(pathForPayload({ v: 1, kind: 'test' })).toEqual({ path: '/', valid: true });
    expect(pathForPayload({ v: 1, kind: 'topup' })).toEqual({ path: '/', valid: true });
  });

  it.each([
    ['wrong version', { v: 2, kind: 'start', bakeId: BAKE, bakeStepId: STEP }],
    ['non-uuid bake', { v: 1, kind: 'start', bakeId: '../../settings', bakeStepId: STEP }],
    ['non-uuid step', { v: 1, kind: 'start', bakeId: BAKE, bakeStepId: 'x?y=1' }],
    ['missing step', { v: 1, kind: 'start', bakeId: BAKE }],
    ['unknown kind', { v: 1, kind: 'evil', bakeId: BAKE, bakeStepId: STEP }],
    ['null', null],
    ['string', 'sa1'],
  ])('rejects %s and opens /', (_label, data) => {
    expect(pathForPayload(data)).toEqual({ path: '/', valid: false });
  });
});

describe('hashOf', () => {
  it('reads our hash and ignores anything else', () => {
    expect(hashOf({ v: 1, hash: 'abc123' })).toBe('abc123');
    expect(hashOf({ hash: 'abc123' })).toBeNull();
    expect(hashOf(undefined)).toBeNull();
  });
});
