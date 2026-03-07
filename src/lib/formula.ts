import type { DicePoolResult } from '../types';
import type { RandomEngine } from './rng';

export interface DiceFormulaTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keepMode: 'kh' | 'kl' | null;
  keepCount: number | null;
  minimumValue: number | null;
}

export interface ModifierFormulaTerm {
  kind: 'modifier';
  value: number;
}

export type FormulaTerm = DiceFormulaTerm | ModifierFormulaTerm;

export interface ParsedFormula {
  normalized: string;
  terms: FormulaTerm[];
}

export interface FormulaRollResult {
  total: number;
  modifierTotal: number;
  dicePools: DicePoolResult[];
}

const DICE_TOKEN_RE = /^(\d*)d(\d+)((?:kh\d+|kl\d+|m\d+)*)$/i;
const DICE_MODIFIER_RE = /(kh\d+|kl\d+|m\d+)/gi;

function parseOneToken(rawToken: string, index: number): FormulaTerm {
  const compact = rawToken.replace(/\s+/g, '');
  if (compact.length === 0) {
    throw new Error('Formula contains an empty token.');
  }

  let sign: 1 | -1 = 1;
  let body = compact;

  if (compact[0] === '+' || compact[0] === '-') {
    sign = compact[0] === '-' ? -1 : 1;
    body = compact.slice(1);
    if (body.length === 0) {
      throw new Error(`Invalid token at position ${index + 1}`);
    }
  }

  const diceMatch = body.match(DICE_TOKEN_RE);
  if (diceMatch) {
    const count = diceMatch[1] ? Number.parseInt(diceMatch[1], 10) : 1;
    const sides = Number.parseInt(diceMatch[2], 10);
    const modifierBlock = diceMatch[3] ?? '';
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      throw new Error('Dice count must be between 1 and 200 per term.');
    }
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
      throw new Error('Die sides must be between 2 and 1000 per term.');
    }

    const modifierTokens = modifierBlock.match(DICE_MODIFIER_RE) ?? [];
    if (modifierTokens.join('').toLowerCase() !== modifierBlock.toLowerCase()) {
      throw new Error(`Unsupported formula token: "${rawToken}"`);
    }

    let keepMode: 'kh' | 'kl' | null = null;
    let keepCount: number | null = null;
    let minimumValue: number | null = null;

    for (const modifierToken of modifierTokens.map((value) => value.toLowerCase())) {
      if (modifierToken.startsWith('kh') || modifierToken.startsWith('kl')) {
        if (keepMode) {
          throw new Error('Only one keep modifier is allowed per dice term.');
        }
        keepMode = modifierToken.startsWith('kh') ? 'kh' : 'kl';
        keepCount = Number.parseInt(modifierToken.slice(2), 10);
        continue;
      }

      if (modifierToken.startsWith('m')) {
        if (minimumValue !== null) {
          throw new Error('Only one minimum modifier is allowed per dice term.');
        }
        minimumValue = Number.parseInt(modifierToken.slice(1), 10);
      }
    }

    if (keepMode && (!keepCount || keepCount < 1 || keepCount > count)) {
      throw new Error('Keep modifier must be between 1 and dice count.');
    }
    if (minimumValue !== null && (!Number.isInteger(minimumValue) || minimumValue < 1 || minimumValue > sides)) {
      throw new Error('Minimum modifier must be between 1 and die sides.');
    }

    return {
      kind: 'dice',
      sign,
      count,
      sides,
      keepMode,
      keepCount,
      minimumValue
    };
  }

  if (/^\d+$/.test(body)) {
    const numberValue = Number.parseInt(body, 10);
    return {
      kind: 'modifier',
      value: sign * numberValue
    };
  }

  throw new Error(`Unsupported formula token: "${rawToken}"`);
}

export function parseFormula(formula: string): ParsedFormula {
  const compact = formula.trim();
  if (!compact) {
    throw new Error('Formula is empty.');
  }

  const rawTokens = compact.match(/[+-]?[^+-]+/g);
  if (!rawTokens || rawTokens.length === 0) {
    throw new Error('Formula could not be parsed.');
  }

  const terms = rawTokens.map((token, index) => parseOneToken(token, index));
  return {
    normalized: rawTokens.map((t) => t.replace(/\s+/g, '')).join(''),
    terms
  };
}

function pickKeptValues(values: number[], mode: 'kh' | 'kl' | null, count: number | null): { kept: number[]; dropped: number[] } {
  if (!mode || !count || count >= values.length) {
    return { kept: [...values], dropped: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const kept = mode === 'kh' ? sorted.slice(sorted.length - count) : sorted.slice(0, count);

  const pool = [...values];
  const dropped: number[] = [];
  kept.forEach((value) => {
    const idx = pool.indexOf(value);
    if (idx >= 0) {
      pool.splice(idx, 1);
    }
  });
  dropped.push(...pool);

  return { kept, dropped };
}

export function evaluateParsedFormula(parsed: ParsedFormula, rng: RandomEngine): FormulaRollResult {
  let total = 0;
  let modifierTotal = 0;
  const dicePools: DicePoolResult[] = [];

  for (const term of parsed.terms) {
    if (term.kind === 'modifier') {
      modifierTotal += term.value;
      total += term.value;
      continue;
    }

    const values: number[] = [];
    for (let i = 0; i < term.count; i += 1) {
      let value = rng.intInclusive(1, term.sides);
      while (term.minimumValue !== null && value < term.minimumValue) {
        value = rng.intInclusive(1, term.sides);
      }
      values.push(value);
    }

    const { kept, dropped } = pickKeptValues(values, term.keepMode, term.keepCount);
    const termTotal = kept.reduce((sum, value) => sum + value, 0) * term.sign;
    total += termTotal;

    dicePools.push({
      sides: term.sides,
      values,
      keptValues: term.keepMode ? kept : undefined,
      droppedValues: term.keepMode ? dropped : undefined,
      sign: term.sign
    });
  }

  return {
    total,
    modifierTotal,
    dicePools
  };
}

export function evaluateFormula(formula: string, rng: RandomEngine): FormulaRollResult & { parsed: ParsedFormula } {
  const parsed = parseFormula(formula);
  const rolled = evaluateParsedFormula(parsed, rng);
  return {
    ...rolled,
    parsed
  };
}

export function buildAdvantageFormula(modifier = 0): string {
  return modifier === 0 ? '2d20kh1' : `2d20kh1${modifier > 0 ? '+' : ''}${modifier}`;
}

export function buildDisadvantageFormula(modifier = 0): string {
  return modifier === 0 ? '2d20kl1' : `2d20kl1${modifier > 0 ? '+' : ''}${modifier}`;
}
