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

  test('parsing invalid keep modifier throws', () => {
    expect(() => parseFormula('2d20kh9')).toThrow('Keep modifier must be between 1 and dice count.');
  });

  test('evaluates minimum floor by clamping instead of rerolling', () => {
    const result = evaluateFormula('3d8m4', sequenceRng([2, 7, 1]));

    expect(result.total).toBe(15);
    expect(result.dicePools[0].values).toEqual([4, 7, 4]);
  });

  test('evaluates minimum floor with keep-high', () => {
    const result = evaluateFormula('4d6m3kh3', sequenceRng([1, 3, 2, 6]));

    expect(result.total).toBe(12);
    expect(result.dicePools[0].values).toEqual([3, 3, 3, 6]);
    expect(result.dicePools[0].keptValues).toEqual([3, 3, 6]);
  });

  test('minimum modifier above sides throws', () => {
    expect(() => parseFormula('2d6m7')).toThrow('Minimum modifier must be between 1 and die sides.');
  });

  test('supports parenthesis with multiplication', () => {
    const result = evaluateFormula('(2d6+4)*2', sequenceRng([3, 5]));

    expect(result.total).toBe(24);
    expect(result.parsed.normalized).toBe('(2d6+4)*2');
  });

  test('supports operator precedence for multiplication and division', () => {
    const precedenceResult = evaluateFormula('1d4+2*3', sequenceRng([4]));
    const parenthesizedResult = evaluateFormula('(1d4+2)*3', sequenceRng([4]));

    expect(precedenceResult.total).toBe(10);
    expect(parenthesizedResult.total).toBe(18);
  });

  test('supports decimal numeric literals', () => {
    const result = evaluateFormula('(18*1.5+16d8)*1.2', sequenceRng(Array.from({ length: 16 }, () => 1)));

    expect(result.total).toBeCloseTo(51.6, 8);
  });

  test('supports leading decimal literals', () => {
    const result = evaluateFormula('1+.5', sequenceRng([]));

    expect(result.total).toBeCloseTo(1.5, 8);
  });

  test('division by zero throws', () => {
    expect(() => evaluateFormula('1d6/(2-2)', sequenceRng([5]))).toThrow('Division by zero is not allowed in formulas.');
  });

  test('unbalanced parenthesis throws', () => {
    expect(() => parseFormula('(1d20+5')).toThrow('Missing closing parenthesis in formula.');
  });
});
