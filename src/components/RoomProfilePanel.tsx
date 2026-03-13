import { InfoHint } from './InfoHint';

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
    <section className="panel room-profile-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Profile</h2>
            <InfoHint text="Alias is local and used when publishing to shared rooms." label="About profile" />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className={`badge ${defaultSecret ? 'badge-accent' : ''}`}>{defaultSecret ? 'Secret default' : 'Public default'}</span>
        </div>
      </div>

      <div className="panel-slab">
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
      </div>
    </section>
  );
}
