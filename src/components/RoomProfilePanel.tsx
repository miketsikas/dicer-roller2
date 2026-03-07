interface RoomProfilePanelProps {
  playerAlias: string;
  roomName: string;
  ownerMode: boolean;
  roomLocked: boolean;
  defaultSecret: boolean;
  onPlayerAliasChange: (value: string) => void;
  onRoomNameChange: (value: string) => void;
  onOwnerModeChange: (value: boolean) => void;
  onRoomLockedChange: (value: boolean) => void;
  onDefaultSecretChange: (value: boolean) => void;
}

export function RoomProfilePanel({
  playerAlias,
  roomName,
  ownerMode,
  roomLocked,
  defaultSecret,
  onPlayerAliasChange,
  onRoomNameChange,
  onOwnerModeChange,
  onRoomLockedChange,
  onDefaultSecretChange
}: RoomProfilePanelProps): JSX.Element {
  const canEditRoom = !roomLocked;

  return (
    <section className="panel">
      <h2>Profile & Roll Label</h2>
      <p className="panel-subtitle">This profile is local. The room display name is included with rolls you publish to shared rooms.</p>
      <label htmlFor="player-alias">Player Alias</label>
      <input
        id="player-alias"
        value={playerAlias}
        onChange={(event) => onPlayerAliasChange(event.target.value)}
        maxLength={24}
        autoComplete="nickname"
      />

      <label htmlFor="room-name">Room Display Name</label>
      <input
        id="room-name"
        value={roomName}
        onChange={(event) => onRoomNameChange(event.target.value)}
        maxLength={32}
        disabled={!canEditRoom}
      />

      <div className="row wrap gap-sm">
        <label className="inline-toggle" htmlFor="owner-mode">
          <input
            id="owner-mode"
            type="checkbox"
            checked={ownerMode}
            onChange={(event) => onOwnerModeChange(event.target.checked)}
          />
          Owner mode
        </label>

        <label className="inline-toggle" htmlFor="room-lock">
          <input
            id="room-lock"
            type="checkbox"
            checked={roomLocked}
            onChange={(event) => onRoomLockedChange(event.target.checked)}
            disabled={!ownerMode}
          />
          Lock room settings
        </label>

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
