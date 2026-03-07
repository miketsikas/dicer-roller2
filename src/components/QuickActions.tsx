interface QuickActionsProps {
  onRollPublicD20: () => void;
  onRollSecretD20: () => void;
  onRollRandomBatch: () => void;
}

export function QuickActions({ onRollPublicD20, onRollSecretD20, onRollRandomBatch }: QuickActionsProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Quick Actions</h2>
      <div className="row wrap gap-sm">
        <button type="button" onClick={onRollPublicD20}>
          Roll 1d20
        </button>
        <button type="button" onClick={onRollSecretD20}>
          Roll Secret 1d20
        </button>
        <button type="button" onClick={onRollRandomBatch}>
          Roll Random Batch
        </button>
      </div>
    </section>
  );
}
