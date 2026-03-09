interface QuickActionsProps {
  density?: 'regular' | 'compact' | 'tiny';
  onRollPublicD20: () => void;
  onRollSecretD20: () => void;
  onRollRandomBatch: () => void;
}

export function QuickActions({ density = 'regular', onRollPublicD20, onRollSecretD20, onRollRandomBatch }: QuickActionsProps): JSX.Element {
  const compact = density !== 'regular';
  const tiny = density === 'tiny';

  return (
    <section className={`panel quick-actions-panel density-${density}`}>
      <h2>{tiny ? 'Actions' : 'Quick Actions'}</h2>
      <div className="quick-grid compact">
        <button
          type="button"
          onClick={onRollPublicD20}
          className="action-btn action-btn-compact"
          title="Roll public 1d20 (Alt+1)"
          aria-label="Roll public 1d20"
        >
          <span className="action-btn-title">{compact ? 'd20' : 'Roll 1d20'}</span>
          {!tiny ? <span className="action-btn-sub">Public • Alt+1</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollSecretD20}
          className="action-btn action-btn-compact"
          title="Roll secret 1d20 (Alt+2)"
          aria-label="Roll secret 1d20"
        >
          <span className="action-btn-title">{compact ? 'Secret' : 'Roll Secret'}</span>
          {!tiny ? <span className="action-btn-sub">1d20 • Alt+2</span> : null}
        </button>
        <button
          type="button"
          onClick={onRollRandomBatch}
          className="action-btn action-btn-compact"
          title="Roll random batch (Alt+3)"
          aria-label="Roll random batch"
        >
          <span className="action-btn-title">{tiny ? 'Rnd' : 'Random'}</span>
          {!tiny ? <span className="action-btn-sub">Batch • Alt+3</span> : null}
        </button>
      </div>
    </section>
  );
}
