import type { AvailableRoom, RoomPresenceMember } from '../realtime/roomService';
import { InfoHint } from './InfoHint';

interface PlayerRoomPanelProps {
  playerAlias: string;
  defaultSecret: boolean;
  roomCode: string;
  connectedRoomCode: string | null;
  authUserId: string | null;
  realtimeReady: boolean;
  connecting: boolean;
  members: RoomPresenceMember[];
  availableRooms: AvailableRoom[];
  loadingRooms: boolean;
  onPlayerAliasChange: (value: string) => void;
  onDefaultSecretChange: (value: boolean) => void;
  onRoomCodeChange: (value: string) => void;
  onSelectExistingRoom: (roomCode: string) => void;
  onRefreshRooms: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onExportSetupJson: () => void;
  onImportSetupJson: (file: File) => void;
}

export function PlayerRoomPanel({
  playerAlias,
  defaultSecret,
  roomCode,
  connectedRoomCode,
  authUserId,
  realtimeReady,
  connecting,
  members,
  availableRooms,
  loadingRooms,
  onPlayerAliasChange,
  onDefaultSecretChange,
  onRoomCodeChange,
  onSelectExistingRoom,
  onRefreshRooms,
  onJoin,
  onLeave,
  onExportSetupJson,
  onImportSetupJson
}: PlayerRoomPanelProps): JSX.Element {
  const isConnected = !!connectedRoomCode;

  return (
    <section className="panel player-room-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Player & Shared Room</h2>
            <InfoHint
              text="Set your alias, default secrecy, and jump between live room codes without leaving the workspace."
              label="About player and shared room"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className={`badge ${isConnected ? 'badge-positive' : 'badge-neutral'}`}>{isConnected ? 'Connected' : 'Local only'}</span>
          <span className="badge">{members.length} online</span>
        </div>
      </div>

      <div className="panel-slab">
        <div className="two-col player-room-profile-row">
          <label className="player-room-alias-field" htmlFor="player-alias">
            Alias
            <input
              id="player-alias"
              value={playerAlias}
              onChange={(event) => onPlayerAliasChange(event.target.value)}
              maxLength={24}
              autoComplete="nickname"
            />
          </label>

          <label className="inline-toggle player-room-secret-toggle" htmlFor="default-secret">
            <input
              id="default-secret"
              type="checkbox"
              checked={defaultSecret}
              onChange={(event) => onDefaultSecretChange(event.target.checked)}
            />
            Default secret
          </label>
        </div>
      </div>

      <div className="panel-slab">
        <label htmlFor="shared-room-code">Room Code</label>
        <div className="row wrap gap-sm room-code-row">
          <input
            id="shared-room-code"
            value={roomCode}
            placeholder="e.g. TAVERN-01"
            onChange={(event) => onRoomCodeChange(event.target.value)}
            maxLength={24}
          />
          <button type="button" onClick={onJoin} disabled={!realtimeReady || connecting || roomCode.trim().length < 3}>
            {connecting ? 'Joining...' : 'Join'}
          </button>
          <button type="button" onClick={onLeave} disabled={!isConnected || connecting}>
            Leave
          </button>
        </div>

        <div className="row wrap gap-sm room-select-row">
          <select
            aria-label="Existing rooms"
            value=""
            onChange={(event) => {
              const selected = event.target.value;
              if (selected) {
                onSelectExistingRoom(selected);
              }
            }}
            disabled={!realtimeReady || connecting || loadingRooms || availableRooms.length === 0}
          >
            <option value="">Join existing room...</option>
            {availableRooms.map((room) => (
              <option key={room.roomCode} value={room.roomCode}>
                {room.roomCode} ({room.activeMembers} online)
              </option>
            ))}
          </select>

          <button type="button" onClick={onRefreshRooms} disabled={!realtimeReady || loadingRooms || connecting}>
            {loadingRooms ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="room-status-grid">
        <span className={`badge ${authUserId ? 'badge-positive' : 'badge-neutral'}`}>Auth: {authUserId ? 'Ready' : 'Not ready'}</span>
        <span className={`badge ${connectedRoomCode ? 'badge-positive' : 'badge-neutral'}`}>Room: {connectedRoomCode ? connectedRoomCode : 'Not connected'}</span>
        <span className="badge">Presence: {members.length}</span>
      </div>

      <div className="panel-slab player-room-setup-transfer">
        <div className="panel-title-row">
          <h3>Setup Backup</h3>
          <InfoHint
            text="Export or import your HUD layout, stats/saves setups, current formula+dice inputs, and presets as JSON."
            label="About setup backup"
          />
        </div>
        <div className="row wrap gap-sm player-room-setup-actions">
          <button type="button" onClick={onExportSetupJson}>
            Export Setup JSON
          </button>
          <div className="player-room-setup-import-field">
            <label htmlFor="player-setup-import">Import Setup JSON</label>
            <input
              id="player-setup-import"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportSetupJson(file);
                }
                event.target.value = '';
              }}
            />
          </div>
        </div>
        <p className="muted-text">Import updates local setup only and keeps your roll history intact.</p>
      </div>

      {!realtimeReady ? (
        <p className="error-text">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable shared rooms.</p>
      ) : null}

      <div className="panel-slab">
        <div className="panel-header-row">
          <div>
            <div className="panel-title-row">
              <h3>Room Presence</h3>
              <InfoHint text="Everyone currently visible in this room session." label="About room presence" />
            </div>
          </div>
        </div>
        {members.length > 0 ? (
          <ul className="item-list presence-list" aria-label="Room presence">
            {members.map((member) => (
              <li key={member.userId} className="list-item compact presence-item">
                <strong>{member.alias}</strong>
                <span className="muted-text">{member.userId.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text presence-empty">No active room presence yet.</p>
        )}
      </div>
    </section>
  );
}
