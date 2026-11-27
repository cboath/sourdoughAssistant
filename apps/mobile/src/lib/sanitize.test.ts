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

  it('removes the invisible and bidi characters import could smuggle in (SEC-M45-05)', () => {
    const hidden = '\u061c\u180e\u2060\u2061\u2062\u2063\u2064\ufeff\u2066\u2069';
    const gone = /[\u061c\u180e\u2060-\u2064\ufeff\u2066\u2069]/;
    expect(cleanName(`Co${hidden}untry`, 80)).not.toMatch(gone);
    expect(cleanName(`Co${hidden}untry`, 80)).toMatch(/^Co ?untry$/);
    expect(cleanNotes(`No${hidden}te`, 100)).not.toMatch(gone);
  });
});
