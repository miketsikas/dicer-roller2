import type { SessionReplay } from '../types';
import { InfoHint } from './InfoHint';

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
  const storageLabel = storageKind === 'opfs' ? 'OPFS JSON file' : storageKind === 'idb' ? 'IndexedDB fallback' : 'Loading...';
  const replaying = !!activeReplayId;

  return (
    <section className="panel session-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Session Replay / Export</h2>
            <InfoHint
              text="Capture local snapshots, import/export sessions, and share context state."
              label="About session replay and export"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className="badge">Storage: {storageLabel}</span>
          <span className={`badge ${replaying ? 'badge-accent' : ''}`}>{replaying ? 'Replay active' : 'Live mode'}</span>
        </div>
      </div>

      <div className="panel-slab session-action-grid">
        <button type="button" onClick={onSaveReplay} className="primary-btn">
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
        {activeReplayId ? <button type="button" onClick={onExitReplay}>Exit Replay Mode</button> : null}
      </div>

      <div className="panel-slab session-import-row">
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
        <p className="muted-text">Import replaces current local state with the selected snapshot.</p>
      </div>

      <div className="panel-slab">
        <h3>Saved Replays</h3>
        <ul className="item-list session-replay-list" aria-label="Saved replays">
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
      </div>
    </section>
  );
}
