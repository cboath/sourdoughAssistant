import { foldText, matchesQuery } from './text';

describe('text search helpers', () => {
  it('folds case and accents', () => {
    expect(foldText('Jalapeño')).toBe('jalapeno');
  });
  it('matches any haystack entry; empty query matches all', () => {
    expect(matchesQuery(['Cheddar jalapeño loaf', 'spicy'], 'JALAPENO')).toBe(true);
    expect(matchesQuery(['Country loaf'], 'rye')).toBe(false);
    expect(matchesQuery(['x'], '  ')).toBe(true);
  });
});
