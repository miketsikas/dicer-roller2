import type { AvailableRoom, RoomPresenceMember } from '../realtime/roomService';
import { InfoHint } from './InfoHint';

interface SharedRoomPanelProps {
  roomCode: string;
  connectedRoomCode: string | null;
  authUserId: string | null;
  realtimeReady: boolean;
  connecting: boolean;
  members: RoomPresenceMember[];
  availableRooms: AvailableRoom[];
  loadingRooms: boolean;
  onRoomCodeChange: (value: string) => void;
  onSelectExistingRoom: (roomCode: string) => void;
  onRefreshRooms: () => void;
  onJoin: () => void;
  onLeave: () => void;
}

export function SharedRoomPanel({
  roomCode,
  connectedRoomCode,
  authUserId,
  realtimeReady,
  connecting,
  members,
  availableRooms,
  loadingRooms,
  onRoomCodeChange,
  onSelectExistingRoom,
  onRefreshRooms,
  onJoin,
  onLeave
}: SharedRoomPanelProps): JSX.Element {
  const isConnected = !!connectedRoomCode;

  return (
    <section className="panel shared-room-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Shared Room (Realtime)</h2>
            <InfoHint
              text="Join a live room code to sync rolls across browsers/devices. Public rolls are shared; secret rolls stay private."
              label="About shared room"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className={`badge ${isConnected ? 'badge-positive' : 'badge-neutral'}`}>{isConnected ? 'Connected' : 'Disconnected'}</span>
          <span className="badge">{members.length} online</span>
        </div>
      </div>

      <div className="panel-slab">
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
            {connecting ? 'Joining...' : 'Join Room'}
          </button>
          <button type="button" onClick={onLeave} disabled={!isConnected || connecting}>
            Leave Room
          </button>
        </div>
      </div>

      <div className="panel-slab">
        <label htmlFor="room-picker">Existing Rooms</label>
        <div className="row wrap gap-sm">
          <select
            id="room-picker"
            value=""
            onChange={(event) => {
              const selected = event.target.value;
              if (selected) {
                onSelectExistingRoom(selected);
              }
            }}
            disabled={!realtimeReady || connecting || loadingRooms || availableRooms.length === 0}
          >
            <option value="">Select a room to join...</option>
            {availableRooms.map((room) => (
              <option key={room.roomCode} value={room.roomCode}>
                {room.roomCode} ({room.activeMembers} online)
              </option>
            ))}
          </select>
          <button type="button" onClick={onRefreshRooms} disabled={!realtimeReady || loadingRooms || connecting}>
            {loadingRooms ? 'Refreshing...' : 'Refresh Rooms'}
          </button>
        </div>
      </div>

      <div className="room-status-grid">
        <span className={`badge ${authUserId ? 'badge-positive' : 'badge-neutral'}`}>Auth: {authUserId ? 'Anonymous user ready' : 'Not ready'}</span>
        <span className={`badge ${connectedRoomCode ? 'badge-positive' : 'badge-neutral'}`}>
          Connection: {connectedRoomCode ? `Connected to ${connectedRoomCode}` : 'Not connected'}
        </span>
        <span className="badge">Presence: {members.length}</span>
      </div>

      {!realtimeReady ? (
        <p className="error-text">
          Supabase is not configured. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable real shared rooms.
        </p>
      ) : null}

      <div className="panel-slab">
        <h3>Presence</h3>
        <ul className="item-list presence-list" aria-label="Room presence">
          {members.map((member) => (
            <li key={member.userId} className="list-item compact presence-item">
              <span>
                {member.alias} ({member.userId.slice(0, 8)})
              </span>
              <span className="muted-text">Online</span>
            </li>
          ))}
          {members.length === 0 ? <li className="muted-text">No active room presence yet.</li> : null}
        </ul>
      </div>
    </section>
  );
}
