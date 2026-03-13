import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { CharacterModifiers, ModifierSetup, SaveKey, StatKey } from '../types';
import { InfoHint } from './InfoHint';

interface ModifierToolkitPanelProps {
  modifierSetups: ModifierSetup[];
  activeSetupId: string;
  modifiers: CharacterModifiers;
  onSelectSetup: (setupId: string) => void;
  onCreateSetup: () => void;
  onDuplicateSetup: () => void;
  onRenameSetup: (name: string) => void;
  onDeleteSetup: () => void;
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

interface ModifierValueInputProps {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}

function ModifierValueInput({ value, min, max, ariaLabel, onCommit }: ModifierValueInputProps): JSX.Element {
  const [draft, setDraft] = useState(() => `${value}`);

  useEffect(() => {
    setDraft(`${value}`);
  }, [value]);

  const commitDraft = (): void => {
    const parsed = Number.parseInt(draft, 10);
    const normalized = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : 0;
    onCommit(normalized);
    setDraft(`${normalized}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(`${value}`);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);

        if (/^-?\d+$/.test(next)) {
          onCommit(Math.max(min, Math.min(max, Number.parseInt(next, 10))));
        }
      }}
      onBlur={commitDraft}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
    />
  );
}

export function ModifierToolkitPanel({
  modifierSetups,
  activeSetupId,
  modifiers,
  onSelectSetup,
  onCreateSetup,
  onDuplicateSetup,
  onRenameSetup,
  onDeleteSetup,
  onStatBaseChange,
  onStatTempChange,
  onSaveBaseChange,
  onSaveTempChange
}: ModifierToolkitPanelProps): JSX.Element {
  const activeSetup = useMemo(
    () => modifierSetups.find((setup) => setup.id === activeSetupId) ?? modifierSetups[0] ?? null,
    [activeSetupId, modifierSetups]
  );
  const statTotal = useMemo(
    () => STAT_ROWS.reduce((sum, row) => sum + modifiers.stats[row.key].base + modifiers.stats[row.key].temp, 0),
    [modifiers.stats]
  );
  const saveTotal = useMemo(
    () => SAVE_ROWS.reduce((sum, row) => sum + modifiers.saves[row.key].base + modifiers.saves[row.key].temp, 0),
    [modifiers.saves]
  );
  const [setupNameDraft, setSetupNameDraft] = useState(activeSetup?.name ?? '');

  useEffect(() => {
    setSetupNameDraft(activeSetup?.name ?? '');
  }, [activeSetup?.id, activeSetup?.name]);

  const canRename = !!activeSetup && setupNameDraft.trim().length > 0 && setupNameDraft.trim() !== activeSetup.name;

  return (
    <section className="panel modifier-toolkit-panel">
      <div className="modifier-toolkit-header">
        <div>
          <div className="panel-title-row">
            <h2>Stat & Save Setups</h2>
            <InfoHint
              text="Store multiple named stat/save sheets. Formula modifier tokens always use the active setup."
              label="About stat and save setups"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className="badge">Active: {activeSetup?.name ?? 'Setup'}</span>
          <span className="badge">{modifierSetups.length} setups</span>
          <span className="badge badge-accent">Totals {signed(statTotal + saveTotal)}</span>
        </div>
      </div>

      <div className="modifier-setup-controls">
        <label className="modifier-setup-field" htmlFor="modifier-setup-active">
          Active setup
          <select id="modifier-setup-active" value={activeSetupId} onChange={(event) => onSelectSetup(event.target.value)}>
            {modifierSetups.map((setup) => (
              <option key={setup.id} value={setup.id}>
                {setup.name}
              </option>
            ))}
          </select>
        </label>

        <div className="modifier-setup-button-row">
          <button type="button" onClick={onCreateSetup}>
            New Blank
          </button>
          <button type="button" onClick={onDuplicateSetup} disabled={!activeSetup}>
            Duplicate
          </button>
          <button type="button" onClick={onDeleteSetup} disabled={modifierSetups.length <= 1}>
            Delete
          </button>
        </div>
      </div>

      <div className="modifier-setup-controls modifier-setup-controls-tight">
        <label className="modifier-setup-field" htmlFor="modifier-setup-name">
          Setup name
          <input
            id="modifier-setup-name"
            value={setupNameDraft}
            maxLength={32}
            onChange={(event) => setSetupNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canRename) {
                event.preventDefault();
                onRenameSetup(setupNameDraft);
              }
            }}
          />
        </label>

        <button type="button" onClick={() => onRenameSetup(setupNameDraft)} disabled={!canRename}>
          Save Name
        </button>
      </div>
      <p className="muted-text modifier-setup-name-meta">{Math.max(0, 32 - setupNameDraft.length)} characters remaining</p>

      <div className="modifier-grid-group">
        <div className="modifier-grid-heading-row">
          <h3>Stats</h3>
          <span className="muted-text">Base + temp = formula token value</span>
        </div>
        <div className="modifier-grid-shell">
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
                  <ModifierValueInput
                    value={field.base}
                    min={-9999}
                    max={9999}
                    onCommit={(value) => onStatBaseChange(row.key, value)}
                    ariaLabel={`${row.label} base modifier`}
                  />
                  <ModifierValueInput
                    value={field.temp}
                    min={-9999}
                    max={9999}
                    onCommit={(value) => onStatTempChange(row.key, value)}
                    ariaLabel={`${row.label} temporary modifier`}
                  />
                  <output className="modifier-total" aria-label={`${row.label} total modifier`}>
                    {signed(total)}
                  </output>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="modifier-grid-group">
        <div className="modifier-grid-heading-row">
          <h3>Saves</h3>
          <span className="muted-text">Swap setups to change formula references instantly</span>
        </div>
        <div className="modifier-grid-shell">
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
                  <ModifierValueInput
                    value={field.base}
                    min={-9999}
                    max={9999}
                    onCommit={(value) => onSaveBaseChange(row.key, value)}
                    ariaLabel={`${row.label} base modifier`}
                  />
                  <ModifierValueInput
                    value={field.temp}
                    min={-9999}
                    max={9999}
                    onCommit={(value) => onSaveTempChange(row.key, value)}
                    ariaLabel={`${row.label} temporary modifier`}
                  />
                  <output className="modifier-total" aria-label={`${row.label} total modifier`}>
                    {signed(total)}
                  </output>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
