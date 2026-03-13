import { useMemo, useState } from 'react';
import type { FeedItem, RollEntry } from '../types';
import { poolsToReadableLabel } from '../lib/dice';
import { InfoHint } from './InfoHint';

export interface HistoryFilters {
  searchText: string;
  mineOnly: boolean;
  showPublic: boolean;
  showSecret: boolean;
  formulaOnly: boolean;
}

interface HistoryFeedProps {
  density?: 'regular' | 'compact' | 'tiny';
  items: FeedItem[];
  filters: HistoryFilters;
  activeAlias: string;
  mutedAliases: string[];
  hasMore: boolean;
  loadingMore: boolean;
  onFiltersChange: (next: HistoryFilters) => void;
  onLoadMore: () => void;
}

function entryDetails(entry: RollEntry): string {
  const label = poolsToReadableLabel(entry.dicePools);
  const modifierLabel = entry.modifier !== 0 ? ` | modifier:${entry.modifier}` : '';
  return `${label}${modifierLabel}`;
}

export function HistoryFeed({
  density = 'regular',
  items,
  filters,
  activeAlias,
  mutedAliases,
  hasMore,
  loadingMore,
  onFiltersChange,
  onLoadMore
}: HistoryFeedProps): JSX.Element {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedBursts, setExpandedBursts] = useState<Record<string, boolean>>({});
  const compact = density !== 'regular';
  const tiny = density === 'tiny';
  const activeFilterCount =
    Number(filters.mineOnly) +
    Number(!filters.showPublic) +
    Number(!filters.showSecret) +
    Number(filters.formulaOnly) +
    Number(filters.searchText.trim().length > 0);
  const noVisibilityFilters = !filters.showPublic && !filters.showSecret;

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

  const setSearchText = (value: string): void => {
    onFiltersChange({
      ...filters,
      searchText: value
    });
  };

  const toggleMineOnly = (): void => {
    onFiltersChange({
      ...filters,
      mineOnly: !filters.mineOnly
    });
  };

  const togglePublic = (): void => {
    onFiltersChange({
      ...filters,
      showPublic: !filters.showPublic
    });
  };

  const toggleSecret = (): void => {
    onFiltersChange({
      ...filters,
      showSecret: !filters.showSecret
    });
  };

  const toggleFormulaOnly = (): void => {
    onFiltersChange({
      ...filters,
      formulaOnly: !filters.formulaOnly
    });
  };

  const mineLabel = tiny ? 'Me' : 'Mine';
  const publicLabel = tiny ? 'Pub' : 'Public';
  const secretLabel = tiny ? 'Sec' : 'Secret';
  const formulaLabel = tiny ? 'Fx' : 'Formula';

  return (
    <section className={`panel history-panel density-${density}`}>
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Roll History</h2>
            <InfoHint
              text="Newest first. Long roll details and duplicate bursts can be expanded inline."
              label="About roll history"
            />
          </div>
        </div>
        {!tiny ? (
          <div className="panel-header-badges">
            <span className="badge">{items.length} visible</span>
            {filters.formulaOnly ? <span className="badge">Formula filter</span> : null}
            {activeFilterCount > 0 ? <span className="badge badge-accent">{activeFilterCount} active filters</span> : null}
          </div>
        ) : null}
      </div>
      <div className="history-filter-row">
        <button
          type="button"
          className={`filter-chip filter-chip-mine ${filters.mineOnly ? 'active' : ''}`}
          aria-pressed={filters.mineOnly}
          onClick={toggleMineOnly}
        >
          {mineLabel}
        </button>
        <button
          type="button"
          className={`filter-chip filter-chip-public ${filters.showPublic ? 'active' : ''}`}
          aria-pressed={filters.showPublic}
          onClick={togglePublic}
        >
          {publicLabel}
        </button>
        <button
          type="button"
          className={`filter-chip filter-chip-secret ${filters.showSecret ? 'active' : ''}`}
          aria-pressed={filters.showSecret}
          onClick={toggleSecret}
        >
          {secretLabel}
        </button>
        <button
          type="button"
          className={`filter-chip filter-chip-formula ${filters.formulaOnly ? 'active' : ''}`}
          aria-pressed={filters.formulaOnly}
          onClick={toggleFormulaOnly}
        >
          {formulaLabel}
        </button>
      </div>
      <input
        value={filters.searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={tiny ? 'Search rolls' : 'Search by alias or formula'}
        aria-label="Search history by alias or formula"
      />

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
            const isMine = entry.playerAlias.trim().toLowerCase() === activeAlias;
            const screenReaderSummary = `${entry.playerAlias} rolled total ${entry.total}${entry.secret ? ' in secret' : ' in public'}${entry.formula ? ` with formula ${entry.formula}` : ''}${item.duplicates.length > 0 ? ` and ${item.duplicates.length} burst duplicates` : ''}`;

            return (
              <li
                key={entry.id}
                className={`history-item ${entry.secret ? 'secret' : ''} ${isMuted ? 'muted' : ''} ${isMine ? 'mine' : ''}`}
                aria-label={screenReaderSummary}
              >
                <header>
                  <strong>{entry.playerAlias}</strong>
                  {!compact ? <span>{entry.roomName}</span> : null}
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </header>

                <p>
                  {tiny ? 'Total' : 'Total:'} <strong>{entry.total}</strong>
                  {entry.secret ? (tiny ? ' • Secret' : ' (Secret)') : ''}
                  {item.duplicates.length > 0 ? (tiny ? ` • Burst x${item.duplicates.length + 1}` : ` | Burst x${item.duplicates.length + 1}`) : ''}
                </p>
                <p className="muted-text">{entry.formula ? `${tiny ? 'Fx' : 'Formula'}: ${entry.formula}` : `${tiny ? 'From' : 'Source'}: ${entry.source}`}</p>

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
          {items.length === 0 ? (
            <li className="panel-slab history-empty-state">
              <h3>{noVisibilityFilters ? 'Visibility filters are off' : 'No matching rolls yet'}</h3>
              <p className="muted-text">
                {noVisibilityFilters ? 'Enable Public or Secret to show results again.' : 'Try adjusting search text or toggles to widen the feed.'}
              </p>
            </li>
          ) : null}
        </ul>
      </div>
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : tiny ? 'Load More' : compact ? 'Load 100 more' : 'Load more (100 older)'}
        </button>
      ) : null}
    </section>
  );
}
