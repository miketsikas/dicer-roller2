import { useState } from 'react';
import type { SavedPreset } from '../types';

interface PresetsPanelProps {
  presets: SavedPreset[];
  onCreate: (name: string) => void;
  onRename: (presetId: string, name: string) => void;
  onUpdate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onApply: (presetId: string) => void;
  className?: string;
}

export function PresetsPanel({ presets, onCreate, onRename, onUpdate, onDelete, onApply, className }: PresetsPanelProps): JSX.Element {
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  return (
    <section className={`panel ${className ?? ''}`.trim()}>
      <h2>Saved Dice Combinations</h2>
      <div className="row gap-sm">
        <input
          value={newName}
          onChange={(event) => {
            setNewName(event.target.value);
            if (createError) {
              setCreateError(null);
            }
          }}
          placeholder="Preset name"
          maxLength={40}
          aria-label="New preset name"
          aria-invalid={!!createError}
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = newName.trim();
            if (!trimmed) {
              setCreateError('Preset name is required.');
              return;
            }

            setCreateError(null);
            onCreate(newName);
            setNewName('');
          }}
        >
          Save Current
        </button>
      </div>
      {createError ? <p className="error-text">{createError}</p> : null}

      <div className="presets-scroll">
        <ul className="item-list" aria-label="Saved presets">
          {presets.map((preset) => (
            <li key={preset.id} className="list-item">
              <div>
                <strong>{preset.name}</strong>
                <p className="muted-text">{preset.formula || 'Manual dice counts preset'}</p>
              </div>
              <div className="row wrap gap-xs">
                <button type="button" onClick={() => onApply(preset.id)}>
                  Apply
                </button>
                <button type="button" onClick={() => onUpdate(preset.id)}>
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const proposed = window.prompt('Rename preset', preset.name);
                    if (proposed !== null) {
                      onRename(preset.id, proposed);
                    }
                  }}
                >
                  Rename
                </button>
                <button type="button" onClick={() => onDelete(preset.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {presets.length === 0 ? <li className="muted-text">No saved presets yet.</li> : null}
        </ul>
      </div>
    </section>
  );
}
