interface QuickActionsProps {
  density?: 'regular' | 'compact' | 'tiny';
  onRollPublicD20: () => void;
  onRollSecretD20: () => void;
  onRollRandomBatch: () => void;
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
      <h2>Quick Actions</h2>
      <div className="quick-grid compact">
        <button
          type="button"
          onClick={onRollPublicD20}
          className="action-btn action-btn-compact"
          title="Roll public 1d20 (Alt+1)"
          aria-label="Roll public 1d20"
        >
          <span className="action-btn-title">{publicLabel}</span>
          {!tiny ? <span className="action-btn-sub">Public • Alt+1</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollSecretD20}
          className="action-btn action-btn-compact"
          title="Roll secret 1d20 (Alt+2)"
          aria-label="Roll secret 1d20"
        >
          <span className="action-btn-title">{secretLabel}</span>
          {!tiny ? <span className="action-btn-sub">1d20 • Alt+2</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollRandomBatch}
          className="action-btn action-btn-compact"
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
      ) : null}

    </section>
  );
}
