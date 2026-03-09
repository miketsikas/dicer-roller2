interface RoomProfilePanelProps {
  playerAlias: string;
  defaultSecret: boolean;
  onPlayerAliasChange: (value: string) => void;
  onDefaultSecretChange: (value: boolean) => void;
}

export function RoomProfilePanel({
  playerAlias,
  defaultSecret,
  onPlayerAliasChange,
  onDefaultSecretChange
}: RoomProfilePanelProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Profile</h2>
      <p className="panel-subtitle">Alias is local and used when publishing to shared rooms.</p>
      <label htmlFor="player-alias">Player Alias</label>
      <input
        id="player-alias"
        value={playerAlias}
        onChange={(event) => onPlayerAliasChange(event.target.value)}
        maxLength={24}
        autoComplete="nickname"
      />

      <div className="row wrap gap-sm">
        <label className="inline-toggle" htmlFor="default-secret">
          <input
            id="default-secret"
            type="checkbox"
            checked={defaultSecret}
            onChange={(event) => onDefaultSecretChange(event.target.checked)}
          />
          Default secret roll
        </label>
      </div>
    </section>
  );
}
