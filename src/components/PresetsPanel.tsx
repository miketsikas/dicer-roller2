import { useState } from 'react';
import type { SavedPreset } from '../types';

interface PresetsPanelProps {
  presets: SavedPreset[];
  onCreate: (name: string) => void;
  onRename: (presetId: string, name: string) => void;
  onUpdate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onApply: (presetId: string) => void;
}

export function PresetsPanel({ presets, onCreate, onRename, onUpdate, onDelete, onApply }: PresetsPanelProps): JSX.Element {
  const [newName, setNewName] = useState('');

  return (
    <section className="panel">
      <h2>Saved Dice Combinations</h2>
      <div className="row gap-sm">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Preset name"
          maxLength={40}
          aria-label="New preset name"
        />
        <button
          type="button"
          onClick={() => {
            onCreate(newName);
            setNewName('');
          }}
        >
          Save Current
        </button>
      </div>

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
    </section>
  );
}
