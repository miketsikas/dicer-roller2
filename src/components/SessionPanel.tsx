import type { SessionReplay } from '../types';

interface SessionPanelProps {
  storageKind: 'opfs' | 'idb' | null;
  replays: SessionReplay[];
  activeReplayId: string | null;
  onSaveReplay: () => void;
  onLoadReplay: (id: string) => void;
  onExitReplay: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportJson: (file: File) => void;
  onShareContext: () => void;
}

export function SessionPanel({
  storageKind,
  replays,
  activeReplayId,
  onSaveReplay,
  onLoadReplay,
  onExitReplay,
  onExportJson,
  onExportCsv,
  onImportJson,
  onShareContext
}: SessionPanelProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Session Replay / Export</h2>
      <p className="panel-subtitle">
        Storage backend: <strong>{storageKind === 'opfs' ? 'OPFS JSON file' : storageKind === 'idb' ? 'IndexedDB fallback' : 'Loading...'}</strong>
      </p>

      <div className="row wrap gap-sm">
        <button type="button" onClick={onSaveReplay}>
          Save Replay Snapshot
        </button>
        <button type="button" onClick={onExportJson}>
          Export Session JSON
        </button>
        <button type="button" onClick={onExportCsv}>
          Export Roll CSV
        </button>
        <button type="button" onClick={onShareContext}>
          Share URL Context
        </button>
        {activeReplayId ? (
          <button type="button" onClick={onExitReplay}>
            Exit Replay Mode
          </button>
        ) : null}
      </div>

      <label htmlFor="session-import">Import Session JSON</label>
      <input
        id="session-import"
        type="file"
        accept="application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onImportJson(file);
          }
          event.target.value = '';
        }}
      />

      <h3>Saved Replays</h3>
      <ul className="item-list" aria-label="Saved replays">
        {replays.map((replay) => (
          <li key={replay.id} className="list-item">
            <div>
              <strong>{replay.name}</strong>
              <p className="muted-text">
                {new Date(replay.createdAt).toLocaleString()} | {replay.entries.length} rolls
              </p>
            </div>
            <button type="button" onClick={() => onLoadReplay(replay.id)}>
              Replay
            </button>
          </li>
        ))}
        {replays.length === 0 ? <li className="muted-text">No replay snapshots saved.</li> : null}
      </ul>
    </section>
  );
}
