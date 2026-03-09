import { DICE_SIDES, type CharacterModifiers, type DiceCounts, type SaveKey, type StatKey } from '../types';

interface RollComposerProps {
  density?: 'regular' | 'compact' | 'tiny';
  counts: DiceCounts;
  formula: string;
  modifiers: CharacterModifiers;
  secretRoll: boolean;
  onCountChange: (sides: (typeof DICE_SIDES)[number], value: number) => void;
  onFormulaChange: (value: string) => void;
  onInsertModifier: (key: StatKey | SaveKey, label: string) => void;
  onSecretRollChange: (value: boolean) => void;
  onRoll: () => void;
  onRollFormula: () => void;
  onReset: () => void;
}

const STAT_OPTIONS: Array<{ key: StatKey; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' }
];

const SAVE_OPTIONS: Array<{ key: SaveKey; label: string }> = [
  { key: 'fort', label: 'Fort' },
  { key: 'reflex', label: 'Reflex' },
  { key: 'will', label: 'Will' }
];

const MIN_DICE = 0;
const MAX_DICE = 1000;

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function clampDiceCount(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_DICE;
  }
  return Math.max(MIN_DICE, Math.min(MAX_DICE, Math.trunc(value)));
}

export function RollComposer({
  density = 'regular',
  counts,
  formula,
  modifiers,
  secretRoll,
  onCountChange,
  onFormulaChange,
  onInsertModifier,
  onSecretRollChange,
  onRoll,
  onRollFormula,
  onReset
}: RollComposerProps): JSX.Element {
  const hasFormula = formula.trim().length > 0;
  const compact = density !== 'regular';
  const tiny = density === 'tiny';

  return (
    <section className={`panel roll-composer density-${density}`}>
      <h2>{tiny ? 'Dice' : 'Dice Roller'}</h2>
      <div className="dice-grid">
        {DICE_SIDES.map((sides) => (
          <label key={sides} htmlFor={`dice-${sides}`} className="dice-input">
            <span className="dice-input-label">d{sides}</span>
            <input
              id={`dice-${sides}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              value={counts[sides]}
              onChange={(event) => onCountChange(sides, clampDiceCount(Number.parseInt(event.target.value, 10) || 0))}
              onBlur={(event) => onCountChange(sides, clampDiceCount(Number.parseInt(event.target.value, 10) || 0))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onRoll();
                }
              }}
              aria-label={`Quantity for d${sides}`}
            />
          </label>
        ))}
      </div>

      <details className="formula-shell formula-mode-accordion">
        <summary>
          <span>{compact ? 'Formula Mode' : 'Formula Mode (optional)'}</span>
          <span className="formula-summary-meta">{hasFormula ? 'Formula ready' : compact ? 'Off' : 'Closed by default'}</span>
        </summary>
        <div className="formula-shell-body">
          <label htmlFor="formula-input">Formula</label>
          <input
            id="formula-input"
            placeholder={tiny ? '(2d20kh1+5)*2' : 'Examples: (2d20kh1+5)*2, 4d6kh3, 3d8m4, 1d20+7'}
            value={formula}
            onChange={(event) => onFormulaChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (formula.trim()) {
                  onRollFormula();
                } else {
                  onRoll();
                }
              }
            }}
            aria-describedby="formula-help"
          />
          {!tiny ? (
            <p id="formula-help" className="muted-text">
              Roll Dice uses selected dice only. Use Roll Formula to execute this formula. Supports `()`, `*`, `/`, `kh`/`kl`, and `m`.
            </p>
          ) : null}
          {!compact ? (
            <div className="formula-hints" aria-label="Formula examples">
              <span className="hint-chip">2d20kh1+5</span>
              <span className="hint-chip">(4d6kh3+2)/2</span>
              <span className="hint-chip">3d8m4</span>
              <span className="hint-chip">2*(1d12+3)</span>
            </div>
          ) : null}

          <details className="formula-accordion">
            <summary>{compact ? 'Add modifier' : 'Add stat/save modifier'}</summary>
            <div className="formula-accordion-body">
              <h3>Stats</h3>
              <div className="modifier-chip-row">
                {STAT_OPTIONS.map((option) => {
                  const total = modifiers.stats[option.key].base + modifiers.stats[option.key].temp;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="modifier-chip-btn"
                      onClick={() => onInsertModifier(option.key, option.label)}
                      aria-label={`Add ${option.label} modifier ${signed(total)} to formula`}
                    >
                      <span>{option.label}</span>
                      <strong>{signed(total)}</strong>
                    </button>
                  );
                })}
              </div>

              <h3>Saves</h3>
              <div className="modifier-chip-row">
                {SAVE_OPTIONS.map((option) => {
                  const total = modifiers.saves[option.key].base + modifiers.saves[option.key].temp;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="modifier-chip-btn"
                      onClick={() => onInsertModifier(option.key, option.label)}
                      aria-label={`Add ${option.label} modifier ${signed(total)} to formula`}
                    >
                      <span>{option.label}</span>
                      <strong>{signed(total)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        </div>
      </details>

      <div className="row wrap gap-sm">
        <label className="inline-toggle" htmlFor="secret-roll-toggle">
          <input
            id="secret-roll-toggle"
            type="checkbox"
            checked={secretRoll}
            onChange={(event) => onSecretRollChange(event.target.checked)}
          />
          Secret roll
        </label>
      </div>

      <div className="row wrap gap-sm composer-actions">
        <button type="button" onClick={onRoll} className={hasFormula ? 'secondary-btn' : 'primary-btn'}>
          {tiny ? 'Roll' : 'Roll Dice'}
        </button>
        {hasFormula ? (
          <button type="button" onClick={onRollFormula} className="primary-btn">
            {tiny ? 'Formula' : 'Roll Formula'}
          </button>
        ) : null}
        <button type="button" onClick={onReset} className="secondary-btn">
          {tiny ? 'Reset' : 'Reset Inputs'}
        </button>
      </div>
      {!tiny ? <p className="muted-text composer-shortcuts">Tip: `Enter` in Formula rolls it, `Ctrl/Cmd+Enter` rolls instantly.</p> : null}
    </section>
  );
}
