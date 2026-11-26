import { describe, expect, it } from 'vitest';
import { APP_NAME, greeting } from './greeting';

describe('greeting', () => {
  it('greets by name', () => {
    expect(greeting('Chris')).toBe(`Hello, Chris! Welcome to ${APP_NAME}.`);
  });
});
