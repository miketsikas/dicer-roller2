import { useMemo, useState } from 'react';
import type { FeedItem, RollEntry } from '../types';
import { poolsToReadableLabel } from '../lib/dice';

interface HistoryFeedProps {
  items: FeedItem[];
  mutedAliases: string[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function entryDetails(entry: RollEntry): string {
  const label = poolsToReadableLabel(entry.dicePools);
  const modifierLabel = entry.modifier !== 0 ? ` | modifier:${entry.modifier}` : '';
  return `${label}${modifierLabel}`;
}

export function HistoryFeed({ items, mutedAliases, hasMore, loadingMore, onLoadMore }: HistoryFeedProps): JSX.Element {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedBursts, setExpandedBursts] = useState<Record<string, boolean>>({});

  const mutedSet = useMemo(
    () => new Set(mutedAliases.map((alias) => alias.trim().toLowerCase())),
    [mutedAliases]
  );

  const toggleRow = (id: string): void => {
    setExpandedRows((previous) => ({ ...previous, [id]: !previous[id] }));
  };

  const toggleBurst = (id: string): void => {
    setExpandedBursts((previous) => ({ ...previous, [id]: !previous[id] }));
  };

  return (
    <section className="panel history-panel">
      <h2>Roll History</h2>
      <p className="panel-subtitle">Newest first. Long roll details and duplicate bursts can be expanded inline.</p>

      <div className="history-scroll">
        <ul className="history-list" aria-label="Roll history feed">
          {items.map((item) => {
            const entry = item.primary;
            const details = entryDetails(entry);
            const longDetails = details.length > 140;
            const isExpanded = !!expandedRows[entry.id];
            const isMuted = mutedSet.has(entry.playerAlias.trim().toLowerCase());
            const burstExpanded = !!expandedBursts[entry.id];

            return (
              <li key={entry.id} className={`history-item ${entry.secret ? 'secret' : ''} ${isMuted ? 'muted' : ''}`}>
                <header>
                  <strong>{entry.playerAlias}</strong>
                  <span>{entry.roomName}</span>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </header>

                <p>
                  Total: <strong>{entry.total}</strong>
                  {entry.secret ? ' (Secret)' : ''}
                  {item.duplicates.length > 0 ? ` | Burst x${item.duplicates.length + 1}` : ''}
                </p>
                <p className="muted-text">{entry.formula ? `Formula: ${entry.formula}` : `Source: ${entry.source}`}</p>

                <p className="mono">
                  {longDetails && !isExpanded ? `${details.slice(0, 140)}...` : details}
                </p>

                <div className="row wrap gap-sm">
                  {longDetails ? (
                    <button type="button" onClick={() => toggleRow(entry.id)}>
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  ) : null}

                  {item.duplicates.length > 0 ? (
                    <button type="button" onClick={() => toggleBurst(entry.id)}>
                      {burstExpanded ? 'Hide burst entries' : `Show ${item.duplicates.length} burst entries`}
                    </button>
                  ) : null}
                </div>

                {burstExpanded && item.duplicates.length > 0 ? (
                  <ul className="duplicate-list">
                    {item.duplicates.map((duplicate) => (
                      <li key={duplicate.id}>
                        <span>{new Date(duplicate.timestamp).toLocaleTimeString()}</span>
                        <span>Total {duplicate.total}</span>
                        <span className="mono">{poolsToReadableLabel(duplicate.dicePools)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {items.length === 0 ? <li className="muted-text">No rolls yet.</li> : null}
        </ul>
      </div>
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more (100 older)'}
        </button>
      ) : null}
    </section>
  );
}
