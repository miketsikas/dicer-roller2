import { Fragment } from 'react';
import type { CharacterModifiers, SaveKey, StatKey } from '../types';

interface ModifierToolkitPanelProps {
  modifiers: CharacterModifiers;
  onStatBaseChange: (key: StatKey, value: number) => void;
  onStatTempChange: (key: StatKey, value: number) => void;
  onSaveBaseChange: (key: SaveKey, value: number) => void;
  onSaveTempChange: (key: SaveKey, value: number) => void;
}

const STAT_ROWS: Array<{ key: StatKey; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' }
];

const SAVE_ROWS: Array<{ key: SaveKey; label: string }> = [
  { key: 'fort', label: 'Fort' },
  { key: 'reflex', label: 'Reflex' },
  { key: 'will', label: 'Will' }
];

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function ModifierToolkitPanel({
  modifiers,
  onStatBaseChange,
  onStatTempChange,
  onSaveBaseChange,
  onSaveTempChange
}: ModifierToolkitPanelProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Stat & Save Modifiers</h2>
      <p className="panel-subtitle">Set base and temporary values. Totals are available from the formula helper.</p>

      <div className="modifier-grid" role="table" aria-label="Stat modifiers">
        <div className="modifier-header">Stat</div>
        <div className="modifier-header">Base</div>
        <div className="modifier-header">Temp</div>
        <div className="modifier-header">Total</div>

        {STAT_ROWS.map((row) => {
          const field = modifiers.stats[row.key];
          const total = field.base + field.temp;

          return (
            <Fragment key={row.key}>
              <div className="modifier-label">{row.label}</div>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={field.base}
                onChange={(event) => onStatBaseChange(row.key, Number.parseInt(event.target.value, 10) || 0)}
                aria-label={`${row.label} base modifier`}
              />
              <input
                type="number"
                min={-9999}
                max={9999}
                value={field.temp}
                onChange={(event) => onStatTempChange(row.key, Number.parseInt(event.target.value, 10) || 0)}
                aria-label={`${row.label} temporary modifier`}
              />
              <output className="modifier-total" aria-label={`${row.label} total modifier`}>
                {signed(total)}
              </output>
            </Fragment>
          );
        })}
      </div>

      <div className="modifier-grid" role="table" aria-label="Save modifiers">
        <div className="modifier-header">Save</div>
        <div className="modifier-header">Base</div>
        <div className="modifier-header">Temp</div>
        <div className="modifier-header">Total</div>

        {SAVE_ROWS.map((row) => {
          const field = modifiers.saves[row.key];
          const total = field.base + field.temp;

          return (
            <Fragment key={row.key}>
              <div className="modifier-label">{row.label}</div>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={field.base}
                onChange={(event) => onSaveBaseChange(row.key, Number.parseInt(event.target.value, 10) || 0)}
                aria-label={`${row.label} base modifier`}
              />
              <input
                type="number"
                min={-9999}
                max={9999}
                value={field.temp}
                onChange={(event) => onSaveTempChange(row.key, Number.parseInt(event.target.value, 10) || 0)}
                aria-label={`${row.label} temporary modifier`}
              />
              <output className="modifier-total" aria-label={`${row.label} total modifier`}>
                {signed(total)}
              </output>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
