import type { AvailableRoom, RoomPresenceMember } from '../realtime/roomService';

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
  onLeave
}: PlayerRoomPanelProps): JSX.Element {
  const isConnected = !!connectedRoomCode;

  return (
    <section className="panel">
      <h2>Player & Shared Room</h2>
      <p className="panel-subtitle">One profile, one room flow.</p>

      <div className="two-col">
        <label htmlFor="player-alias">
          Alias
          <input
            id="player-alias"
            value={playerAlias}
            onChange={(event) => onPlayerAliasChange(event.target.value)}
            maxLength={24}
            autoComplete="nickname"
          />
        </label>

        <label className="inline-toggle" htmlFor="default-secret">
          <input
            id="default-secret"
            type="checkbox"
            checked={defaultSecret}
            onChange={(event) => onDefaultSecretChange(event.target.checked)}
          />
          Default secret
        </label>
      </div>

      <label htmlFor="shared-room-code">Room Code</label>
      <div className="row wrap gap-sm">
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

      <div className="row wrap gap-sm">
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

      <div className="row wrap gap-sm">
        <span className="badge">Auth: {authUserId ? 'Ready' : 'Not ready'}</span>
        <span className="badge">Room: {connectedRoomCode ? connectedRoomCode : 'Not connected'}</span>
        <span className="badge">Presence: {members.length}</span>
      </div>

      {!realtimeReady ? (
        <p className="error-text">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable shared rooms.</p>
      ) : null}

      {members.length > 0 ? (
        <ul className="item-list" aria-label="Room presence">
          {members.map((member) => (
            <li key={member.userId} className="list-item compact">
              <span>{member.alias}</span>
              <span className="muted-text">{member.userId.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
