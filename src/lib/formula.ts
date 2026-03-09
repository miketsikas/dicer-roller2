import type { DicePoolResult } from '../types';
import type { RandomEngine } from './rng';

export interface DiceFormulaTerm {
  kind: 'dice';
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

type UnaryOperator = '+' | '-';
type BinaryOperator = '+' | '-' | '*' | '/';

interface NumberNode {
  type: 'number';
  value: number;
}

interface DiceNode {
  type: 'dice';
  term: DiceFormulaTerm;
}

interface UnaryNode {
  type: 'unary';
  operator: UnaryOperator;
  operand: FormulaExpression;
}

interface BinaryNode {
  type: 'binary';
  operator: BinaryOperator;
  left: FormulaExpression;
  right: FormulaExpression;
}

type FormulaExpression = NumberNode | DiceNode | UnaryNode | BinaryNode;

export interface ParsedFormula {
  normalized: string;
  terms: FormulaTerm[];
  expression: FormulaExpression;
}

export interface FormulaRollResult {
  total: number;
  modifierTotal: number;
  dicePools: DicePoolResult[];
}

type TokenType = 'number' | 'dice' | 'plus' | 'minus' | 'multiply' | 'divide' | 'lparen' | 'rparen';

interface FormulaToken {
  type: TokenType;
  lexeme: string;
  numberValue?: number;
  diceTerm?: DiceFormulaTerm;
}

const DICE_TOKEN_RE = /^(\d*)d(\d+)((?:kh\d+|kl\d+|m\d+)*)$/i;
const DICE_MODIFIER_RE = /(kh\d+|kl\d+|m\d+)/gi;

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

function isAlphaNumeric(character: string): boolean {
  return /[A-Za-z0-9]/.test(character);
}

function parseNumericToken(source: string, startIndex: number): { token: FormulaToken; nextIndex: number } {
  let end = startIndex;

  if (source[startIndex] === '.') {
    end += 1;
  } else {
    while (end < source.length && isDigit(source[end])) {
      end += 1;
    }
  }

  if (end < source.length && source[end] === '.') {
    end += 1;
  }

  const fractionalStart = end;
  while (end < source.length && isDigit(source[end])) {
    end += 1;
  }

  if (source[startIndex] === '.' && fractionalStart === end) {
    const snippet = source.slice(startIndex, Math.min(source.length, startIndex + 8));
    throw new Error(`Unsupported formula token near "${snippet}"`);
  }

  const rawNumber = source.slice(startIndex, end);
  if (!rawNumber || rawNumber === '.' || rawNumber.endsWith('.')) {
    const snippet = source.slice(startIndex, Math.min(source.length, startIndex + 8));
    throw new Error(`Unsupported formula token near "${snippet}"`);
  }

  const numberValue = Number.parseFloat(rawNumber);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Unsupported formula token: "${rawNumber}"`);
  }

  return {
    token: {
      type: 'number',
      lexeme: rawNumber,
      numberValue
    },
    nextIndex: end
  };
}

function parseDiceToken(rawToken: string): DiceFormulaTerm {
  const diceMatch = rawToken.match(DICE_TOKEN_RE);
  if (!diceMatch) {
    throw new Error(`Unsupported formula token: "${rawToken}"`);
  }

  const count = diceMatch[1] ? Number.parseInt(diceMatch[1], 10) : 1;
  const sides = Number.parseInt(diceMatch[2], 10);
  const modifierBlock = diceMatch[3] ?? '';

  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('Dice count must be between 1 and 1000 per term.');
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
    count,
    sides,
    keepMode,
    keepCount,
    minimumValue
  };
}

function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  const source = formula.trim();

  if (!source) {
    throw new Error('Formula is empty.');
  }

  let index = 0;
  while (index < source.length) {
    const current = source[index];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === '+') {
      tokens.push({ type: 'plus', lexeme: '+' });
      index += 1;
      continue;
    }
    if (current === '-') {
      tokens.push({ type: 'minus', lexeme: '-' });
      index += 1;
      continue;
    }
    if (current === '*') {
      tokens.push({ type: 'multiply', lexeme: '*' });
      index += 1;
      continue;
    }
    if (current === '/') {
      tokens.push({ type: 'divide', lexeme: '/' });
      index += 1;
      continue;
    }
    if (current === '(') {
      tokens.push({ type: 'lparen', lexeme: '(' });
      index += 1;
      continue;
    }
    if (current === ')') {
      tokens.push({ type: 'rparen', lexeme: ')' });
      index += 1;
      continue;
    }

    if (current.toLowerCase() === 'd') {
      let end = index + 1;
      while (end < source.length && isAlphaNumeric(source[end])) {
        end += 1;
      }
      const rawToken = source.slice(index, end);
      const diceTerm = parseDiceToken(rawToken);
      tokens.push({ type: 'dice', lexeme: rawToken.toLowerCase(), diceTerm });
      index = end;
      continue;
    }

    if (isDigit(current)) {
      let digitsEnd = index;
      while (digitsEnd < source.length && isDigit(source[digitsEnd])) {
        digitsEnd += 1;
      }

      const next = source[digitsEnd];
      if (next && next.toLowerCase() === 'd') {
        let tokenEnd = digitsEnd + 1;
        while (tokenEnd < source.length && isAlphaNumeric(source[tokenEnd])) {
          tokenEnd += 1;
        }

        const rawToken = source.slice(index, tokenEnd);
        const diceTerm = parseDiceToken(rawToken);
        tokens.push({ type: 'dice', lexeme: rawToken.toLowerCase(), diceTerm });
        index = tokenEnd;
        continue;
      }

      if (next && /[A-Za-z]/.test(next)) {
        const snippet = source.slice(index, Math.min(source.length, index + 8));
        throw new Error(`Unsupported formula token near "${snippet}"`);
      }

      const parsed = parseNumericToken(source, index);
      const nextChar = source[parsed.nextIndex];
      if (nextChar && /[A-Za-z]/.test(nextChar)) {
        const snippet = source.slice(index, Math.min(source.length, index + 8));
        throw new Error(`Unsupported formula token near "${snippet}"`);
      }

      tokens.push(parsed.token);
      index = parsed.nextIndex;
      continue;
    }

    if (current === '.') {
      const parsed = parseNumericToken(source, index);
      const nextChar = source[parsed.nextIndex];
      if (nextChar && /[A-Za-z]/.test(nextChar)) {
        const snippet = source.slice(index, Math.min(source.length, index + 8));
        throw new Error(`Unsupported formula token near "${snippet}"`);
      }

      tokens.push(parsed.token);
      index = parsed.nextIndex;
      continue;
    }

    const snippet = source.slice(index, Math.min(source.length, index + 8));
    throw new Error(`Unsupported formula token near "${snippet}"`);
  }

  if (tokens.length === 0) {
    throw new Error('Formula could not be parsed.');
  }

  return tokens;
}

class ExpressionParser {
  private cursor = 0;

  constructor(private readonly tokens: FormulaToken[]) {}

  parse(): FormulaExpression {
    const expression = this.parseAdditive();
    if (!this.isAtEnd()) {
      throw new Error(`Unexpected token "${this.peek().lexeme}".`);
    }
    return expression;
  }

  private parseAdditive(): FormulaExpression {
    let expression = this.parseMultiplicative();

    while (this.match('plus') || this.match('minus')) {
      const operator = this.previous().type === 'plus' ? '+' : '-';
      const right = this.parseMultiplicative();
      expression = {
        type: 'binary',
        operator,
        left: expression,
        right
      };
    }

    return expression;
  }

  private parseMultiplicative(): FormulaExpression {
    let expression = this.parseUnary();

    while (this.match('multiply') || this.match('divide')) {
      const operator = this.previous().type === 'multiply' ? '*' : '/';
      const right = this.parseUnary();
      expression = {
        type: 'binary',
        operator,
        left: expression,
        right
      };
    }

    return expression;
  }

  private parseUnary(): FormulaExpression {
    if (this.match('plus') || this.match('minus')) {
      const operator = this.previous().type === 'plus' ? '+' : '-';
      return {
        type: 'unary',
        operator,
        operand: this.parseUnary()
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): FormulaExpression {
    if (this.match('number')) {
      const value = this.previous().numberValue;
      if (value === undefined) {
        throw new Error('Formula number token missing value.');
      }
      return {
        type: 'number',
        value
      };
    }

    if (this.match('dice')) {
      const diceTerm = this.previous().diceTerm;
      if (!diceTerm) {
        throw new Error('Formula dice token missing value.');
      }
      return {
        type: 'dice',
        term: diceTerm
      };
    }

    if (this.match('lparen')) {
      const nested = this.parseAdditive();
      if (!this.match('rparen')) {
        throw new Error('Missing closing parenthesis in formula.');
      }
      return nested;
    }

    if (this.isAtEnd()) {
      throw new Error('Formula ended unexpectedly.');
    }

    throw new Error(`Unexpected token "${this.peek().lexeme}".`);
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.cursor += 1;
      return true;
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  private previous(): FormulaToken {
    return this.tokens[this.cursor - 1];
  }

  private peek(): FormulaToken {
    return this.tokens[this.cursor];
  }

  private isAtEnd(): boolean {
    return this.cursor >= this.tokens.length;
  }
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
    const index = pool.indexOf(value);
    if (index >= 0) {
      pool.splice(index, 1);
    }
  });
  dropped.push(...pool);

  return { kept, dropped };
}

function evaluateExpression(node: FormulaExpression, rng: RandomEngine, dicePools: DicePoolResult[]): number {
  if (node.type === 'number') {
    return node.value;
  }

  if (node.type === 'dice') {
    const { term } = node;
    const values: number[] = [];

    for (let i = 0; i < term.count; i += 1) {
      const rolled = rng.intInclusive(1, term.sides);
      values.push(term.minimumValue !== null ? Math.max(rolled, term.minimumValue) : rolled);
    }

    const { kept, dropped } = pickKeptValues(values, term.keepMode, term.keepCount);
    dicePools.push({
      sides: term.sides,
      values,
      keptValues: term.keepMode ? kept : undefined,
      droppedValues: term.keepMode ? dropped : undefined
    });

    return kept.reduce((sum, value) => sum + value, 0);
  }

  if (node.type === 'unary') {
    const operandValue = evaluateExpression(node.operand, rng, dicePools);
    return node.operator === '-' ? -operandValue : operandValue;
  }

  const leftValue = evaluateExpression(node.left, rng, dicePools);
  const rightValue = evaluateExpression(node.right, rng, dicePools);

  switch (node.operator) {
    case '+':
      return leftValue + rightValue;
    case '-':
      return leftValue - rightValue;
    case '*':
      return leftValue * rightValue;
    case '/':
      if (rightValue === 0) {
        throw new Error('Division by zero is not allowed in formulas.');
      }
      return leftValue / rightValue;
    default:
      return leftValue;
  }
}

function collectSimpleModifier(node: FormulaExpression, sign = 1): number | null {
  if (node.type === 'number') {
    return node.value * sign;
  }

  if (node.type === 'dice') {
    return 0;
  }

  if (node.type === 'unary') {
    return collectSimpleModifier(node.operand, node.operator === '-' ? sign * -1 : sign);
  }

  if (node.operator === '+') {
    const left = collectSimpleModifier(node.left, sign);
    const right = collectSimpleModifier(node.right, sign);
    if (left === null || right === null) {
      return null;
    }
    return left + right;
  }

  if (node.operator === '-') {
    const left = collectSimpleModifier(node.left, sign);
    const right = collectSimpleModifier(node.right, sign * -1);
    if (left === null || right === null) {
      return null;
    }
    return left + right;
  }

  return null;
}

export function parseFormula(formula: string): ParsedFormula {
  const tokens = tokenizeFormula(formula);
  const parser = new ExpressionParser(tokens);
  const expression = parser.parse();

  const terms: FormulaTerm[] = tokens
    .map((token) => {
      if (token.type === 'dice' && token.diceTerm) {
        return token.diceTerm;
      }
      if (token.type === 'number' && token.numberValue !== undefined) {
        return {
          kind: 'modifier',
          value: token.numberValue
        } as ModifierFormulaTerm;
      }
      return null;
    })
    .filter((term): term is FormulaTerm => term !== null);

  return {
    normalized: tokens.map((token) => token.lexeme).join(''),
    terms,
    expression
  };
}

export function evaluateParsedFormula(parsed: ParsedFormula, rng: RandomEngine): FormulaRollResult {
  const dicePools: DicePoolResult[] = [];
  const total = evaluateExpression(parsed.expression, rng, dicePools);
  const inferredModifier = collectSimpleModifier(parsed.expression);

  return {
    total,
    modifierTotal: inferredModifier ?? 0,
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
