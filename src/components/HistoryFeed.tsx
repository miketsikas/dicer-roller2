import { useMemo, useState } from 'react';
import type { FeedItem, RollEntry } from '../types';
import { poolsToReadableLabel } from '../lib/dice';

interface HistoryFeedProps {
  density?: 'regular' | 'compact' | 'tiny';
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

export function HistoryFeed({ density = 'regular', items, mutedAliases, hasMore, loadingMore, onLoadMore }: HistoryFeedProps): JSX.Element {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedBursts, setExpandedBursts] = useState<Record<string, boolean>>({});
  const compact = density !== 'regular';
  const tiny = density === 'tiny';

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
    <section className={`panel history-panel density-${density}`}>
      <h2>Roll History</h2>
      {!compact ? <p className="panel-subtitle">Newest first. Long roll details and duplicate bursts can be expanded inline.</p> : null}

      <div className="history-scroll">
        <ul className="history-list" aria-label="Roll history feed">
          {items.map((item) => {
            const entry = item.primary;
            const details = entryDetails(entry);
            const detailsLimit = tiny ? 72 : compact ? 96 : 140;
            const longDetails = details.length > detailsLimit;
            const isExpanded = !!expandedRows[entry.id];
            const isMuted = mutedSet.has(entry.playerAlias.trim().toLowerCase());
            const burstExpanded = !!expandedBursts[entry.id];

            return (
              <li key={entry.id} className={`history-item ${entry.secret ? 'secret' : ''} ${isMuted ? 'muted' : ''}`}>
                <header>
                  <strong>{entry.playerAlias}</strong>
                  {!tiny ? <span>{entry.roomName}</span> : null}
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </header>

                <p>
                  Total: <strong>{entry.total}</strong>
                  {entry.secret ? ' (Secret)' : ''}
                  {item.duplicates.length > 0 ? ` | Burst x${item.duplicates.length + 1}` : ''}
                </p>
                <p className="muted-text">{entry.formula ? `Formula: ${entry.formula}` : `Source: ${entry.source}`}</p>

                <p className="mono">
                  {longDetails && !isExpanded ? `${details.slice(0, detailsLimit)}...` : details}
                </p>

                <div className="row wrap gap-sm">
                  {longDetails ? (
                    <button type="button" onClick={() => toggleRow(entry.id)}>
                      {isExpanded ? (compact ? 'Less' : 'Show less') : compact ? 'More' : 'Show more'}
                    </button>
                  ) : null}

                  {item.duplicates.length > 0 ? (
                    <button type="button" onClick={() => toggleBurst(entry.id)}>
                      {burstExpanded
                        ? compact
                          ? 'Hide Burst'
                          : 'Hide burst entries'
                        : compact
                          ? `Burst x${item.duplicates.length}`
                          : `Show ${item.duplicates.length} burst entries`}
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
          {loadingMore ? 'Loading...' : compact ? 'Load 100 more' : 'Load more (100 older)'}
        </button>
      ) : null}
    </section>
  );
}
