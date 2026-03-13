import type { CSSProperties } from 'react';
import { DICE_SIDES, type CharacterModifiers, type DiceCounts, type ModifierSetup, type SaveKey, type StatKey } from '../types';
import { InfoHint } from './InfoHint';

interface RollComposerProps {
  density?: 'regular' | 'compact' | 'tiny';
  counts: DiceCounts;
  formula: string;
  modifiers: CharacterModifiers;
  modifierSetups: ModifierSetup[];
  activeModifierSetupId: string;
  secretRoll: boolean;
  onCountChange: (sides: (typeof DICE_SIDES)[number], value: number) => void;
  onFormulaChange: (value: string) => void;
  onModifierSetupChange: (setupId: string) => void;
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
const DIE_PILL_COLORS: Record<
  (typeof DICE_SIDES)[number],
  {
    background: string;
    border: string;
  }
> = {
  4: {
    background: 'linear-gradient(145deg, rgba(255, 149, 143, 0.96), rgba(211, 86, 99, 0.94))',
    border: 'rgba(255, 199, 197, 0.88)'
  },
  6: {
    background: 'linear-gradient(145deg, rgba(255, 190, 111, 0.96), rgba(223, 138, 54, 0.94))',
    border: 'rgba(255, 220, 170, 0.88)'
  },
  8: {
    background: 'linear-gradient(145deg, rgba(251, 229, 118, 0.96), rgba(209, 168, 58, 0.94))',
    border: 'rgba(255, 241, 185, 0.9)'
  },
  10: {
    background: 'linear-gradient(145deg, rgba(127, 231, 164, 0.96), rgba(67, 174, 108, 0.94))',
    border: 'rgba(183, 246, 207, 0.88)'
  },
  12: {
    background: 'linear-gradient(145deg, rgba(121, 225, 240, 0.96), rgba(64, 160, 197, 0.94))',
    border: 'rgba(180, 241, 250, 0.9)'
  },
  20: {
    background: 'linear-gradient(145deg, rgba(129, 190, 255, 0.96), rgba(70, 130, 210, 0.94))',
    border: 'rgba(192, 223, 255, 0.9)'
  },
  100: {
    background: 'linear-gradient(145deg, rgba(198, 167, 255, 0.96), rgba(132, 97, 204, 0.94))',
    border: 'rgba(227, 211, 255, 0.9)'
  }
};

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
  modifierSetups,
  activeModifierSetupId,
  secretRoll,
  onCountChange,
  onFormulaChange,
  onModifierSetupChange,
  onInsertModifier,
  onSecretRollChange,
  onRoll,
  onRollFormula,
  onReset
}: RollComposerProps): JSX.Element {
  const hasFormula = formula.trim().length > 0;
  const compact = density !== 'regular';
  const tiny = density === 'tiny';
  const totalDiceCount = DICE_SIDES.reduce((sum, sides) => sum + counts[sides], 0);
  const activeSetup = modifierSetups.find((setup) => setup.id === activeModifierSetupId) ?? modifierSetups[0] ?? null;
  const activeSetupName = activeSetup?.name ?? 'Setup';
  const formulaSummaryLabel = tiny ? 'Formula' : compact ? 'Formula Mode' : 'Formula Mode (optional)';
  const formulaStatusLabel = hasFormula ? 'Ready' : compact ? 'Optional' : 'Optional';

  return (
    <section className={`panel roll-composer density-${density}`}>
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>{tiny ? 'Roll' : 'Dice Roller'}</h2>
            <InfoHint
              text="Blend manual dice pools with formulas and modifier tokens without leaving the current workspace."
              label="About dice roller"
            />
          </div>
        </div>
        {!tiny ? (
          <div className="panel-header-badges composer-header-badges">
            <span className="badge">{activeSetupName}</span>
            <span className="badge">{hasFormula ? 'Formula Ready' : 'Dice Pool Mode'}</span>
          </div>
        ) : null}
      </div>
      <div className="composer-status-row" role="status" aria-live="polite">
        <span className="badge">Dice: {totalDiceCount}</span>
        <span className="badge">{secretRoll ? 'Secret output' : 'Public output'}</span>
        <span className={`badge ${hasFormula ? 'badge-accent' : ''}`}>{hasFormula ? 'Formula armed' : 'Manual dice only'}</span>
      </div>
      <div className="dice-grid">
        {DICE_SIDES.map((sides) => {
          const pillStyle = DIE_PILL_COLORS[sides];
          return (
          <label
            key={sides}
            htmlFor={`dice-${sides}`}
            className="dice-input"
            style={
              {
                '--dice-pill-background': pillStyle.background,
                '--dice-pill-border': pillStyle.border
              } as CSSProperties
            }
          >
            <span className="dice-input-label dice-input-pill">d{sides}</span>
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
          );
        })}
      </div>

      <div className="formula-scroll-shell">
        <details className="formula-shell formula-mode-accordion">
          <summary>
            <span>{formulaSummaryLabel}</span>
            <span className="formula-summary-meta">
              {formulaStatusLabel} · {activeSetupName}
            </span>
          </summary>
          <div className="formula-shell-body">
            <div className="formula-setup-row">
              <label htmlFor="modifier-setup-select">{tiny ? 'Setup' : 'Stat/save setup'}</label>
              <select
                id="modifier-setup-select"
                value={activeModifierSetupId}
                onChange={(event) => onModifierSetupChange(event.target.value)}
                aria-label="Modifier setup used by formulas"
              >
                {modifierSetups.map((setup) => (
                  <option key={setup.id} value={setup.id}>
                    {setup.name}
                  </option>
                ))}
              </select>
              <p className="muted-text formula-setup-note">
                {compact ? `Using ${activeSetupName}` : 'Modifier tokens resolve from the selected setup.'}
              </p>
            </div>
            <label htmlFor="formula-input">Formula</label>
            <input
              id="formula-input"
              placeholder={tiny ? 'e.g. 2d20kh1+5' : 'Examples: (2d20kh1+5)*2, 4d6kh3, 3d8m4, 1d20+7'}
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
      </div>

      <div className="row wrap gap-sm">
        <label className="inline-toggle" htmlFor="secret-roll-toggle">
          <input
            id="secret-roll-toggle"
            type="checkbox"
            checked={secretRoll}
            onChange={(event) => onSecretRollChange(event.target.checked)}
          />
          {tiny ? 'Secret' : 'Secret roll'}
        </label>
      </div>

      <div className="row wrap gap-sm composer-actions">
        <button type="button" onClick={onRoll} className={hasFormula ? 'secondary-btn' : 'primary-btn'}>
          Roll Dice
        </button>
        {hasFormula ? (
          <button type="button" onClick={onRollFormula} className="primary-btn">
            Roll Formula
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
