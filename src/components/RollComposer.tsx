import { DICE_SIDES, type DiceCounts } from '../types';

interface RollComposerProps {
  counts: DiceCounts;
  formula: string;
  secretRoll: boolean;
  onCountChange: (sides: (typeof DICE_SIDES)[number], value: number) => void;
  onFormulaChange: (value: string) => void;
  onSecretRollChange: (value: boolean) => void;
  onRoll: () => void;
  onReset: () => void;
}

export function RollComposer({
  counts,
  formula,
  secretRoll,
  onCountChange,
  onFormulaChange,
  onSecretRollChange,
  onRoll,
  onReset
}: RollComposerProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Dice Roller</h2>
      <div className="dice-grid">
        {DICE_SIDES.map((sides) => (
          <label key={sides} htmlFor={`dice-${sides}`} className="dice-input">
            d{sides}
            <input
              id={`dice-${sides}`}
              type="number"
              min={0}
              max={99}
              value={counts[sides]}
              onChange={(event) => onCountChange(sides, Number.parseInt(event.target.value, 10) || 0)}
              aria-label={`Quantity for d${sides}`}
            />
          </label>
        ))}
      </div>

      <label htmlFor="formula-input">Formula (optional)</label>
      <input
        id="formula-input"
        placeholder="Examples: 2d20kh1+5, 4d6kh3, 3d8m4, 1d20+7"
        value={formula}
        onChange={(event) => onFormulaChange(event.target.value)}
        aria-describedby="formula-help"
      />
      <p id="formula-help" className="muted-text">
        Formula takes priority when filled. Keep-high/low uses `kh` / `kl`, minimum reroll floor uses `m` (ex: `3d8m4`).
      </p>

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

      <div className="row wrap gap-sm">
        <button type="button" onClick={onRoll} className="primary-btn">
          Roll
        </button>
        <button type="button" onClick={onReset}>
          Reset Inputs
        </button>
      </div>
    </section>
  );
}
