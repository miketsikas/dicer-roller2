import { describe, expect, test, vi } from 'vitest';
import { createCryptoRng, createRng } from './rng';

describe('rng modes', () => {
  test('crypto mode uses getRandomValues', () => {
    const getter = vi.fn((array: Uint32Array) => {
      array[0] = 11;
      return array;
    });

    const rng = createCryptoRng({ getRandomValues: getter });
    const value = rng.intInclusive(1, 20);

    expect(getter).toHaveBeenCalledTimes(1);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(20);
  });

  test('factory returns requested mode', () => {
    expect(createRng('crypto').mode).toBe('crypto');
    expect(createRng('math').mode).toBe('math');
  });
});
