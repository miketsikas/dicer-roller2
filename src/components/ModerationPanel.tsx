import { useState } from 'react';
import type { ModerationSettings } from '../types';

interface ModerationPanelProps {
  moderation: ModerationSettings;
  onAddMuted: (alias: string) => void;
  onRemoveMuted: (alias: string) => void;
  onAddHidden: (alias: string) => void;
  onRemoveHidden: (alias: string) => void;
}

export function ModerationPanel({
  moderation,
  onAddMuted,
  onRemoveMuted,
  onAddHidden,
  onRemoveHidden
}: ModerationPanelProps): JSX.Element {
  const [aliasInput, setAliasInput] = useState('');

  return (
    <section className="panel">
      <h2>Moderation Tools (Local)</h2>
      <p className="panel-subtitle">These controls affect only this local feed and never block rolling.</p>
      <div className="row wrap gap-sm">
        <input
          value={aliasInput}
          onChange={(event) => setAliasInput(event.target.value)}
          placeholder="Alias"
          aria-label="Alias for moderation"
        />
        <button
          type="button"
          onClick={() => {
            onAddMuted(aliasInput);
            setAliasInput('');
          }}
        >
          Mute in feed
        </button>
        <button
          type="button"
          onClick={() => {
            onAddHidden(aliasInput);
            setAliasInput('');
          }}
        >
          Hide in feed
        </button>
      </div>

      <div className="two-col">
        <div>
          <h3>Muted Aliases</h3>
          <ul className="item-list">
            {moderation.mutedAliases.map((alias) => (
              <li key={alias} className="list-item compact">
                <span>{alias}</span>
                <button type="button" onClick={() => onRemoveMuted(alias)}>
                  Remove
                </button>
              </li>
            ))}
            {moderation.mutedAliases.length === 0 ? <li className="muted-text">None</li> : null}
          </ul>
        </div>

        <div>
          <h3>Hidden Aliases</h3>
          <ul className="item-list">
            {moderation.hiddenAliases.map((alias) => (
              <li key={alias} className="list-item compact">
                <span>{alias}</span>
                <button type="button" onClick={() => onRemoveHidden(alias)}>
                  Remove
                </button>
              </li>
            ))}
            {moderation.hiddenAliases.length === 0 ? <li className="muted-text">None</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
