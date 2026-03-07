import { describe, expect, test } from 'vitest';
import { evaluateFormula, parseFormula } from './formula';
import type { RandomEngine } from './rng';

function sequenceRng(values: number[]): RandomEngine {
  const queue = [...values];
  return {
    mode: 'math',
    intInclusive() {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('No RNG values left.');
      }
      return next;
    }
  };
}

describe('formula parser + evaluator', () => {
  test('evaluates keep-high with modifier', () => {
    const result = evaluateFormula('2d20kh1+5', sequenceRng([4, 18]));

    expect(result.total).toBe(23);
    expect(result.modifierTotal).toBe(5);
    expect(result.dicePools[0].keptValues).toEqual([18]);
    expect(result.dicePools[0].droppedValues).toEqual([4]);
  });

  test('evaluates 4d6 keep highest 3', () => {
    const result = evaluateFormula('4d6kh3', sequenceRng([1, 3, 6, 5]));

    expect(result.total).toBe(14);
    expect(result.dicePools[0].keptValues).toEqual([3, 5, 6]);
    expect(result.dicePools[0].droppedValues).toEqual([1]);
  });

  test('parsing invalid formula throws', () => {
    expect(() => parseFormula('2d20kh9')).toThrow('Keep modifier must be between 1 and dice count.');
  });

  test('evaluates minimum reroll floor', () => {
    const result = evaluateFormula('3d8m4', sequenceRng([2, 7, 1, 4, 3, 8]));
    expect(result.total).toBe(19);
    expect(result.dicePools[0].values).toEqual([7, 4, 8]);
  });

  test('evaluates minimum floor with keep-high', () => {
    const result = evaluateFormula('4d6m3kh3', sequenceRng([1, 3, 2, 6, 5, 4]));
    expect(result.total).toBe(15);
    expect(result.dicePools[0].values).toEqual([3, 6, 5, 4]);
    expect(result.dicePools[0].keptValues).toEqual([4, 5, 6]);
  });

  test('minimum modifier above sides throws', () => {
    expect(() => parseFormula('2d6m7')).toThrow('Minimum modifier must be between 1 and die sides.');
  });
});
