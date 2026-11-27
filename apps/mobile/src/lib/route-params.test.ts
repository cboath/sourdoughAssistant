import { cleanPrefill, parseRouteParams, routeParams } from './route-params';

const ID = '3f0c2a52-6b0e-4a43-9a53-1d1d7a0a6a11';

describe('parseRouteParams', () => {
  it('accepts a uuid id and ignores unrelated router keys', () => {
    expect(parseRouteParams(routeParams.pantryItem, { id: ID, screen: 'x' })).toEqual({
      ok: true,
      params: { id: ID },
    });
  });

  it.each([{ id: 'abc' }, { id: undefined }, { id: [ID, ID] }, { id: `${ID} ` }])(
    'rejects invalid id %j',
    (raw) => {
      expect(parseRouteParams(routeParams.pantryItem, raw).ok).toBe(false);
    },
  );

  it('allows "new" only where the schema says so', () => {
    expect(parseRouteParams(routeParams.recipeEditor, { id: 'new' }).ok).toBe(true);
    expect(parseRouteParams(routeParams.pantryEditor, { id: 'new' }).ok).toBe(true);
    expect(parseRouteParams(routeParams.recipe, { id: 'new' }).ok).toBe(false);
  });

  it('parses loaves as an int 1..50 and rejects everything else', () => {
    const ok = parseRouteParams(routeParams.recipe, { id: ID, loaves: '12' });
    expect(ok).toEqual({ ok: true, params: { id: ID, loaves: 12 } });
    for (const loaves of ['0', '51', '1.5', '-1', 'abc', '', '007x', '999']) {
      expect(parseRouteParams(routeParams.recipe, { id: ID, loaves }).ok).toBe(false);
    }
  });

  it('restricts enums for role and returnTo', () => {
    expect(parseRouteParams(routeParams.ingredientEditor, { role: 'levain' }).ok).toBe(true);
    expect(parseRouteParams(routeParams.ingredientEditor, { role: 'flour' }).ok).toBe(false);
    expect(parseRouteParams(routeParams.pantryEditor, { id: 'new', returnTo: 'home' }).ok).toBe(
      false,
    );
  });

  it('cleans and caps the name prefill instead of failing', () => {
    const raw = `  Rye\u0000 \n flour\u202e ${'x'.repeat(300)}`;
    const result = parseRouteParams(routeParams.pantryEditor, { id: 'new', name: raw });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.name?.length).toBeLessThanOrEqual(200);
      expect(result.params.name?.startsWith('Rye flour')).toBe(true);
      expect(result.params.name).toBe(result.params.name?.replace(/\s/g, ' '));
      expect(result.params.name).not.toContain('\u0000');
      expect(result.params.name).not.toContain('\u202e');
    }
  });

  it('accepts no params for routes that take none', () => {
    expect(parseRouteParams(routeParams.none, { file: 'file:///x' })).toEqual({
      ok: true,
      params: {},
    });
  });
});

describe('cleanPrefill', () => {
  it('replaces the extra invisible and isolate characters (SEC-M45-05)', () => {
    expect(cleanPrefill('a\u061cb\u180ec\u2060d\u2064e\ufefff\u2066g\u2069h')).toBe(
      'a b c d e f g h',
    );
  });

  it('collapses whitespace and does not split surrogate pairs at the cap', () => {
    expect(cleanPrefill('a   b\tc')).toBe('a b c');
    const cleaned = cleanPrefill('🍞'.repeat(250));
    expect(Array.from(cleaned)).toHaveLength(200);
  });
});
