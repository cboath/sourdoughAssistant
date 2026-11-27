import { cleanName, cleanNotes } from './sanitize';

describe('sanitize', () => {
  it('cleans names', () => {
    expect(cleanName('  Bread‮  flour\u0000 ', 60)).toBe('Bread flour');
    expect(cleanName('x'.repeat(300), 200)).toHaveLength(200);
  });
  it('keeps line breaks in notes but drops other control characters', () => {
    expect(cleanNotes('a\nb\u0000c‮d', 100)).toBe('a\nbcd');
    expect(cleanNotes('x'.repeat(50), 10)).toHaveLength(10);
  });
});
