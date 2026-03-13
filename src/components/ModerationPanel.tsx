import { useState } from 'react';
import type { ModerationSettings } from '../types';
import { InfoHint } from './InfoHint';

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
  const trimmedAlias = aliasInput.trim();
  const canApply = trimmedAlias.length > 0;

  return (
    <section className="panel moderation-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Moderation Tools (Local)</h2>
            <InfoHint
              text="These controls affect only this local feed and never block rolling."
              label="About moderation tools"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className="badge">{moderation.mutedAliases.length} muted</span>
          <span className="badge">{moderation.hiddenAliases.length} hidden</span>
        </div>
      </div>

      <div className="panel-slab">
        <div className="row wrap gap-sm moderation-action-row">
          <input
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value)}
            placeholder="Alias"
            aria-label="Alias for moderation"
          />
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              onAddMuted(trimmedAlias);
              setAliasInput('');
            }}
          >
            Mute in feed
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              onAddHidden(trimmedAlias);
              setAliasInput('');
            }}
          >
            Hide in feed
          </button>
        </div>
        <p className="muted-text">Muted aliases stay visible but softened. Hidden aliases are removed from this local view.</p>
      </div>

      <div className="two-col moderation-lists">
        <div className="panel-slab">
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

        <div className="panel-slab">
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
