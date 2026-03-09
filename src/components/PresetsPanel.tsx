import { useState } from 'react';
import type { SavedPreset } from '../types';

interface PresetsPanelProps {
  presets: SavedPreset[];
  favoritePresetIds: string[];
  onCreate: (name: string) => void;
  onOpenOptions: (presetId: string) => void;
  onApply: (presetId: string) => void;
  onRollFavorite: (presetId: string) => void;
  onToggleFavorite: (presetId: string) => void;
  density?: 'regular' | 'compact' | 'tiny';
  className?: string;
}

export function PresetsPanel({
  presets,
  favoritePresetIds,
  onCreate,
  onOpenOptions,
  onApply,
  onRollFavorite,
  onToggleFavorite,
  density = 'regular',
  className
}: PresetsPanelProps): JSX.Element {
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const compact = density !== 'regular';
  const tiny = density === 'tiny';
  const trimmedName = newName.trim();
  const favoriteSet = new Set(favoritePresetIds);
  const favoritePresets = presets.filter((preset) => favoriteSet.has(preset.id));

  const submitCreate = (): void => {
    if (!trimmedName) {
      setCreateError('Preset name is required.');
      return;
    }

    setCreateError(null);
    onCreate(trimmedName);
    setNewName('');
  };

  return (
    <section className={`panel presets-panel density-${density} ${className ?? ''}`.trim()}>
      <h2>{tiny ? 'Saved Presets' : 'Saved Dice Combinations'}</h2>
      <div className="row gap-sm presets-header-row">
        <input
          value={newName}
          onChange={(event) => {
            setNewName(event.target.value);
            if (createError) {
              setCreateError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitCreate();
            }
          }}
          placeholder={compact ? 'New preset' : 'Preset name'}
          maxLength={40}
          aria-label="New preset name"
          aria-invalid={!!createError}
        />
        <button
          type="button"
          onClick={submitCreate}
        >
          {tiny ? 'Save Preset' : 'Save Current'}
        </button>
        <button
          type="button"
          className="preset-action-icon"
          aria-label="Open saved preset options"
          disabled={presets.length === 0}
          onClick={() => {
            if (presets.length === 0) {
              return;
            }
            onOpenOptions(presets[0].id);
          }}
          title="Open preset options"
        >
          ⚙
        </button>
      </div>
      {createError ? <p className="error-text">{createError}</p> : null}

      {favoritePresets.length > 0 ? (
        <div className="preset-favorites-bar">
          <h3>Favorites</h3>
          <div className="preset-favorites-grid">
            {favoritePresets.map((preset) => (
              <button key={preset.id} type="button" className="quick-chip-btn" onClick={() => onRollFavorite(preset.id)}>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="presets-scroll">
        <ul className="item-list" aria-label="Saved presets">
          {presets.map((preset) => (
            <li key={preset.id} className="list-item compact preset-item-row">
              <button type="button" className="preset-row-main preset-row-select" onClick={() => onApply(preset.id)} aria-label={`Apply preset ${preset.name}`}>
                <strong>{preset.name}</strong>
                {!tiny ? <p className="muted-text">{preset.formula || 'Manual dice counts preset'}</p> : null}
              </button>
              <button
                type="button"
                className={`preset-action-icon ${favoriteSet.has(preset.id) ? 'active' : ''}`}
                aria-label={`${favoriteSet.has(preset.id) ? 'Unfavorite' : 'Favorite'} preset ${preset.name}`}
                onClick={() => onToggleFavorite(preset.id)}
                title={favoriteSet.has(preset.id) ? 'Unfavorite preset' : 'Favorite preset'}
              >
                ★
              </button>
              <button
                type="button"
                className="preset-action-icon"
                aria-label={`Open actions for preset ${preset.name}`}
                onClick={() => onOpenOptions(preset.id)}
                title={`Open ${preset.name} options`}
              >
                ⋯
              </button>
            </li>
          ))}
          {presets.length === 0 ? <li className="muted-text">{tiny ? 'No presets yet.' : 'No saved presets yet.'}</li> : null}
        </ul>
      </div>
    </section>
  );
}
