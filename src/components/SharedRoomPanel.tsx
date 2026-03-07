import type { RoomPresenceEvent, RoomPresenceMember } from '../realtime/roomService';

interface SharedRoomPanelProps {
  roomCode: string;
  connectedRoomCode: string | null;
  authUserId: string | null;
  realtimeReady: boolean;
  connecting: boolean;
  members: RoomPresenceMember[];
  recentPresenceEvents: RoomPresenceEvent[];
  onRoomCodeChange: (value: string) => void;
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
  recentPresenceEvents,
  onRoomCodeChange,
  onJoin,
  onLeave
}: SharedRoomPanelProps): JSX.Element {
  const isConnected = !!connectedRoomCode;

  return (
    <section className="panel">
      <h2>Shared Room (Realtime)</h2>
      <p className="panel-subtitle">Join a live room code to sync rolls across browsers/devices. Public rolls are shared; secret rolls stay private.</p>

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

      <div className="row wrap gap-sm">
        <span className="badge">Auth: {authUserId ? 'Anonymous user ready' : 'Not ready'}</span>
        <span className="badge">Connection: {connectedRoomCode ? `Connected to ${connectedRoomCode}` : 'Not connected'}</span>
      </div>

      {!realtimeReady ? (
        <p className="error-text">
          Supabase is not configured. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable real shared rooms.
        </p>
      ) : null}

      <h3>Presence</h3>
      <ul className="item-list" aria-label="Room presence">
        {members.map((member) => (
          <li key={member.userId} className="list-item compact">
            <span>
              {member.alias} ({member.userId.slice(0, 8)})
            </span>
            <span className="muted-text">Online</span>
          </li>
        ))}
        {members.length === 0 ? <li className="muted-text">No active room presence yet.</li> : null}
      </ul>

      <h3>Join/Leave Activity</h3>
      <ul className="item-list" aria-label="Presence activity">
        {recentPresenceEvents.map((event) => (
          <li key={`${event.userId}-${event.at}-${event.type}`} className="list-item compact">
            <span>
              {event.alias} {event.type === 'join' ? 'joined' : 'left'}
            </span>
            <span className="muted-text">{new Date(event.at).toLocaleTimeString()}</span>
          </li>
        ))}
        {recentPresenceEvents.length === 0 ? <li className="muted-text">No recent join/leave updates.</li> : null}
      </ul>
    </section>
  );
}
