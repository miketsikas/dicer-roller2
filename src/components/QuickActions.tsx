import { InfoHint } from './InfoHint';

interface QuickActionsProps {
  density?: 'regular' | 'compact' | 'tiny';
  onRollPublicD20: () => void;
  onRollSecretD20: () => void;
  onRollRandomBatch: () => void;
  stickyBarEnabled: boolean;
  onToggleStickyBar: () => void;
  favoritePresets: Array<{ id: string; name: string }>;
  recentRollActions: Array<{ id: string; label: string; detail: string }>;
  onRunFavoritePreset: (presetId: string) => void;
  onRunRecentAction: (actionId: string) => void;
}

export function QuickActions({
  density = 'regular',
  onRollPublicD20,
  onRollSecretD20,
  onRollRandomBatch,
  stickyBarEnabled,
  onToggleStickyBar,
  favoritePresets,
  recentRollActions,
  onRunFavoritePreset,
  onRunRecentAction
}: QuickActionsProps): JSX.Element {
  const compact = density !== 'regular';
  const tiny = density === 'tiny';
  const publicLabel = tiny ? 'Public d20' : compact ? 'Roll d20' : 'Roll 1d20';
  const secretLabel = tiny ? 'Secret d20' : compact ? 'Secret d20' : 'Roll Secret';
  const randomLabel = tiny ? 'Random Set' : 'Random';

  return (
    <section className={`panel quick-actions-panel density-${density}`}>
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Quick Actions</h2>
            <InfoHint
              text="Fast public or secret checks, favorite shortcuts, and instant reruns from recent history."
              label="About quick actions"
            />
          </div>
        </div>
        <div className="quick-actions-header-controls">
          {!tiny ? (
            <div className="panel-header-badges">
              <span className="badge">{favoritePresets.length} favorites</span>
              <span className="badge">{recentRollActions.length} recent</span>
            </div>
          ) : null}
          <button
            type="button"
            className={`quick-actions-dock-toggle ${stickyBarEnabled ? 'active' : ''}`.trim()}
            aria-pressed={stickyBarEnabled}
            onClick={onToggleStickyBar}
          >
            {stickyBarEnabled ? (tiny ? 'Unpin Bar' : 'Unpin Bottom Bar') : tiny ? 'Pin Bar' : 'Pin Bottom Bar'}
          </button>
        </div>
      </div>
      <div className="quick-grid compact">
        <button
          type="button"
          onClick={onRollPublicD20}
          className="action-btn action-btn-compact action-btn-public"
          title="Roll public 1d20 (Alt+1)"
          aria-label="Roll public 1d20"
        >
          <span className="action-btn-title">{publicLabel}</span>
          {!tiny ? <span className="action-btn-sub">Public • Alt+1</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollSecretD20}
          className="action-btn action-btn-compact action-btn-secret"
          title="Roll secret 1d20 (Alt+2)"
          aria-label="Roll secret 1d20"
        >
          <span className="action-btn-title">{secretLabel}</span>
          {!tiny ? <span className="action-btn-sub">1d20 • Alt+2</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollRandomBatch}
          className="action-btn action-btn-compact action-btn-random"
          title="Roll random batch (Alt+3)"
          aria-label="Roll random batch"
        >
          <span className="action-btn-title">{randomLabel}</span>
          {!tiny ? <span className="action-btn-sub">Batch • Alt+3</span> : null}
        </button>
      </div>

      {favoritePresets.length > 0 ? (
        <div className="quick-subsection">
          <h3>{tiny ? 'Favorites' : 'Favorite Presets'}</h3>
          <div className="quick-chip-grid quick-chip-grid-favorites">
            {favoritePresets.map((preset) => (
              <button key={preset.id} type="button" className="quick-chip-btn" onClick={() => onRunFavoritePreset(preset.id)}>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      ) : !tiny ? (
        <div className="quick-empty-state panel-slab">
          <h3>Favorite Presets</h3>
          <p className="muted-text">Star saved presets to pin them here for one-tap rolling.</p>
        </div>
      ) : null}

      {recentRollActions.length > 0 ? (
        <div className="quick-subsection">
          <h3>Recent Rolls</h3>
          <div className="quick-chip-grid quick-chip-grid-recent">
            {recentRollActions.map((action) => (
              <button key={action.id} type="button" className="quick-chip-btn" onClick={() => onRunRecentAction(action.id)}>
                <span>{action.label}</span>
                {!tiny ? <small>{action.detail}</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : !tiny ? (
        <div className="quick-empty-state panel-slab">
          <h3>Recent Rolls</h3>
          <p className="muted-text">Your latest unique roll patterns appear here for instant reruns.</p>
        </div>
      ) : null}

    </section>
  );
}
