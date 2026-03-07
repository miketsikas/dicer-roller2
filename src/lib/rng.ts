import type { RngMode } from '../types';

export interface RandomEngine {
  mode: RngMode;
  intInclusive(min: number, max: number): number;
}

interface CryptoOptions {
  getRandomValues?: (array: Uint32Array) => Uint32Array;
}

function assertRange(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`Invalid range: ${min}..${max}`);
  }
}

export function createMathRng(): RandomEngine {
  return {
    mode: 'math',
    intInclusive(min: number, max: number): number {
      assertRange(min, max);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  };
}

export function createCryptoRng(options: CryptoOptions = {}): RandomEngine {
  const getRandomValues =
    options.getRandomValues ??
    ((array: Uint32Array) => {
      if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
        throw new Error('crypto.getRandomValues is unavailable in this environment');
      }
      return crypto.getRandomValues(array);
    });

  return {
    mode: 'crypto',
    intInclusive(min: number, max: number): number {
      assertRange(min, max);
      const range = max - min + 1;
      const maxUint32 = 0xffffffff;
      const bucketLimit = maxUint32 - ((maxUint32 + 1) % range);
      const buffer = new Uint32Array(1);

      let value: number;
      do {
        value = getRandomValues(buffer)[0];
      } while (value > bucketLimit);

      return min + (value % range);
    }
  };
}

export function createRng(mode: RngMode): RandomEngine {
  return mode === 'crypto' ? createCryptoRng() : createMathRng();
}
