import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundCarousel } from './components/BackgroundCarousel';
import { HistoryFeed } from './components/HistoryFeed';
import { ModerationPanel } from './components/ModerationPanel';
import { PresetsPanel } from './components/PresetsPanel';
import { QuickActions } from './components/QuickActions';
import { RollComposer } from './components/RollComposer';
import { RoomProfilePanel } from './components/RoomProfilePanel';
import { SessionPanel } from './components/SessionPanel';
import { SharedRoomPanel } from './components/SharedRoomPanel';
import { BACKGROUNDS } from './constants/backgrounds';
import { useAppData } from './hooks/useAppData';
import { buildCountsLabel, buildSpamKey, createEmptyCounts, groupFeedEntries, rollCounts, rollRandomBatchTemplate } from './lib/dice';
import { downloadTextFile } from './lib/download';
import { historyToCsv, parseImportedSession, toSessionJson } from './lib/exporters';
import { evaluateFormula } from './lib/formula';
import { createPreset, deletePreset, renamePreset, updatePresetFromDraft, applyPreset } from './lib/presets';
import { createRng } from './lib/rng';
import { buildShareUrl, parseShareParams } from './lib/share';
import { createId } from './lib/uuid';
import { normalizeAlias, normalizeRoomCode, sanitizePositiveInt, validateAlias, validateRoomCode, validateRoomName } from './lib/validation';
import { mergeRollEntriesNewestFirst, oldestTimestamp } from './realtime/feed';
import {
  fetchAvailableRooms,
  ensureAnonymousUser,
  fetchRoomRollPage,
  insertRoomRoll,
  removeRoomMembership,
  subscribeRoom,
  unsubscribeRoom,
  upsertRoomMembership,
  type AvailableRoom,
  type RoomPresenceEvent,
  type RoomPresenceMember
} from './realtime/roomService';
import { getSupabaseClient, isRealtimeConfigured } from './realtime/supabaseClient';
import type { DiceCounts, RollEntry } from './types';

const CAROUSEL_INTERVAL_MS = 12_000;
const PAGE_SIZE = 100;
const ROOM_SYNC_INTERVAL_MS = 8_000;

function nextBackgroundId(currentId: string, direction: 1 | -1): string {
  const index = BACKGROUNDS.findIndex((background) => background.id === currentId);
  const currentIndex = index >= 0 ? index : 0;
  const nextIndex = (currentIndex + direction + BACKGROUNDS.length) % BACKGROUNDS.length;
  return BACKGROUNDS[nextIndex].id;
}

function dedupeAliasList(previous: string[], alias: string): string[] {
  const normalized = normalizeAlias(alias);
  if (!normalized) {
    return previous;
  }

  const lower = normalized.toLowerCase();
  if (previous.some((entry) => entry.toLowerCase() === lower)) {
    return previous;
  }
  return [...previous, normalized];
}

function removeAlias(previous: string[], alias: string): string[] {
  const lower = alias.toLowerCase();
  return previous.filter((entry) => entry.toLowerCase() !== lower);
}

function updateRoomParam(roomCode: string | null): void {
  const url = new URL(window.location.href);
  if (roomCode) {
    url.searchParams.set('room', roomCode);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

export default function App(): JSX.Element {
  const { data, loading, error, storageKind, commit, replaceData } = useAppData();
  const realtimeReady = isRealtimeConfigured();

  const [counts, setCounts] = useState<DiceCounts>(createEmptyCounts());
  const [formula, setFormula] = useState('');
  const [secretRoll, setSecretRoll] = useState(false);
  const [activeReplayId, setActiveReplayId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [pendingAutoJoinCode, setPendingAutoJoinCode] = useState<string | null>(null);
  const [roomConnecting, setRoomConnecting] = useState(false);
  const [connectedRoomCode, setConnectedRoomCode] = useState<string | null>(null);
  const [roomEntries, setRoomEntries] = useState<RollEntry[]>([]);
  const [hasMoreRoomHistory, setHasMoreRoomHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [presenceMembers, setPresenceMembers] = useState<RoomPresenceMember[]>([]);
  const [presenceEvents, setPresenceEvents] = useState<RoomPresenceEvent[]>([]);

  const initializedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const clearMessages = useCallback((): void => {
    setLocalError(null);
    setStatusMessage(null);
  }, []);

  const handlePresenceEvent = useCallback((event: RoomPresenceEvent): void => {
    setPresenceEvents((previous) => [event, ...previous].slice(0, 20));
  }, []);

  const refreshAvailableRooms = useCallback(
    async (silent = false): Promise<void> => {
      if (!realtimeReady) {
        setAvailableRooms([]);
        return;
      }

      setLoadingRooms(true);
      try {
        const rooms = await fetchAvailableRooms(75);
        setAvailableRooms(rooms);
        if (!silent) {
          setStatusMessage('Room list refreshed.');
        }
      } catch (roomError) {
        if (!silent) {
          setLocalError((roomError as Error).message);
        }
      } finally {
        setLoadingRooms(false);
      }
    },
    [realtimeReady]
  );

  const leaveConnectedRoom = useCallback(
    async (silent = false): Promise<void> => {
      if (!connectedRoomCode && !channelRef.current) {
        return;
      }

      try {
        const previousCode = connectedRoomCode;
        if (channelRef.current) {
          await unsubscribeRoom(channelRef.current);
          channelRef.current = null;
        }

        if (previousCode) {
          await removeRoomMembership(previousCode);
        }

        setConnectedRoomCode(null);
        setRoomEntries([]);
        setPresenceMembers([]);
        setPresenceEvents([]);
        setHasMoreRoomHistory(false);
        updateRoomParam(null);
        void refreshAvailableRooms(true);
        if (!silent) {
          setStatusMessage('Left shared room.');
        }
      } catch (leaveError) {
        setLocalError((leaveError as Error).message);
      }
    },
    [connectedRoomCode, refreshAvailableRooms]
  );

  const connectToRoom = useCallback(
    async (explicitCode?: string, silent = false): Promise<void> => {
      if (!data) {
        return;
      }
      if (!realtimeReady) {
        setLocalError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }

      clearMessages();

      const normalizedCode = normalizeRoomCode(explicitCode ?? data.preferences.roomCode);
      const roomCodeError = validateRoomCode(normalizedCode);
      if (roomCodeError) {
        setLocalError(roomCodeError);
        return;
      }

      const alias = normalizeAlias(data.preferences.playerAlias);
      const aliasError = validateAlias(alias);
      if (aliasError) {
        setLocalError(aliasError);
        return;
      }

      setRoomConnecting(true);

      try {
        const user = await ensureAnonymousUser();
        setAuthUserId(user.id);

        if (channelRef.current) {
          await unsubscribeRoom(channelRef.current);
          channelRef.current = null;
        }

        if (connectedRoomCode) {
          await removeRoomMembership(connectedRoomCode);
        }

        await upsertRoomMembership(normalizedCode, alias);

        const channel = await subscribeRoom({
          roomCode: normalizedCode,
          userId: user.id,
          alias,
          handlers: {
            onRoll: (entry) => {
              setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, [entry]));
            },
            onPresenceSync: (members) => {
              setPresenceMembers(members);
            },
            onPresenceEvent: handlePresenceEvent
          }
        });

        channelRef.current = channel;
        setConnectedRoomCode(normalizedCode);
        setPendingAutoJoinCode(null);
        setActiveReplayId(null);

        const page = await fetchRoomRollPage({ roomCode: normalizedCode, limit: PAGE_SIZE });
        setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, page));
        setHasMoreRoomHistory(page.length === PAGE_SIZE);

        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            roomCode: normalizedCode
          }
        }));

        updateRoomParam(normalizedCode);
        void refreshAvailableRooms(true);

        if (!silent) {
          setStatusMessage(`Joined room ${normalizedCode}.`);
        }
      } catch (connectError) {
        setLocalError((connectError as Error).message);
      } finally {
        setRoomConnecting(false);
      }
    },
    [clearMessages, commit, connectedRoomCode, data, handlePresenceEvent, realtimeReady, refreshAvailableRooms]
  );

  const loadMoreRoomHistory = useCallback(async (): Promise<void> => {
    if (!connectedRoomCode || loadingMoreHistory || !hasMoreRoomHistory) {
      return;
    }

    setLoadingMoreHistory(true);
    try {
      const beforeCreatedAt = oldestTimestamp(roomEntries);
      const page = await fetchRoomRollPage({
        roomCode: connectedRoomCode,
        beforeCreatedAt,
        limit: PAGE_SIZE
      });

      setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, page));
      setHasMoreRoomHistory(page.length === PAGE_SIZE);
    } catch (pageError) {
      setLocalError((pageError as Error).message);
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [connectedRoomCode, hasMoreRoomHistory, loadingMoreHistory, roomEntries]);

  const syncLatestRoomEntries = useCallback(async (): Promise<void> => {
    if (!connectedRoomCode || activeReplayId) {
      return;
    }

    try {
      const latestPage = await fetchRoomRollPage({
        roomCode: connectedRoomCode,
        limit: PAGE_SIZE
      });
      setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, latestPage));
    } catch {
      // Ignore: this is a best-effort fallback when realtime events are missed.
    }
  }, [activeReplayId, connectedRoomCode]);

  useEffect(() => {
    if (!data || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    setSecretRoll(data.preferences.defaultSecret);

    const share = parseShareParams(window.location.search);
    const sharedRoomCode = share.roomCode ? normalizeRoomCode(share.roomCode) : '';

    if (share.player || sharedRoomCode || share.replayId) {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          playerAlias: share.player ?? previous.preferences.playerAlias,
          roomCode: sharedRoomCode || previous.preferences.roomCode
        }
      }));

      if (share.replayId) {
        setActiveReplayId(share.replayId);
      }

      if (sharedRoomCode) {
        setPendingAutoJoinCode(sharedRoomCode);
      }

      setStatusMessage('Share context loaded from URL.');
      return;
    }

    if (data.preferences.roomCode) {
      setPendingAutoJoinCode(normalizeRoomCode(data.preferences.roomCode));
    }
  }, [commit, data]);

  useEffect(() => {
    if (!realtimeReady) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!cancelled) {
          setAuthUserId(user.id);
        }
      } catch (authError) {
        if (!cancelled) {
          setLocalError((authError as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [realtimeReady]);

  useEffect(() => {
    if (!realtimeReady) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void client.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [realtimeReady]);

  useEffect(() => {
    if (!authUserId || !realtimeReady) {
      return;
    }
    void refreshAvailableRooms(true);
  }, [authUserId, connectedRoomCode, realtimeReady, refreshAvailableRooms]);

  useEffect(() => {
    if (!connectedRoomCode || activeReplayId) {
      return;
    }

    const interval = window.setInterval(() => {
      void syncLatestRoomEntries();
    }, ROOM_SYNC_INTERVAL_MS);

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void syncLatestRoomEntries();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeReplayId, connectedRoomCode, syncLatestRoomEntries]);

  useEffect(() => {
    if (!data?.preferences.autoCarousel) {
      return;
    }

    const timer = window.setInterval(() => {
      if (data.moderation.roomLocked) {
        return;
      }

      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          backgroundId: nextBackgroundId(previous.preferences.backgroundId, 1)
        }
      }));
    }, CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [commit, data]);

  useEffect(() => {
    if (!pendingAutoJoinCode || !authUserId || connectedRoomCode || roomConnecting) {
      return;
    }
    const nextCode = pendingAutoJoinCode;
    setPendingAutoJoinCode(null);
    void connectToRoom(nextCode, true);
  }, [authUserId, connectToRoom, connectedRoomCode, pendingAutoJoinCode, roomConnecting]);

  useEffect(
    () => () => {
      if (channelRef.current) {
        void unsubscribeRoom(channelRef.current);
        channelRef.current = null;
      }
      if (connectedRoomCode) {
        void removeRoomMembership(connectedRoomCode);
      }
    },
    [connectedRoomCode]
  );

  const currentBackground = useMemo(
    () => BACKGROUNDS.find((background) => background.id === data?.preferences.backgroundId) ?? BACKGROUNDS[0],
    [data?.preferences.backgroundId]
  );

  const defaultFeedEntries = useMemo(() => (connectedRoomCode ? roomEntries : data?.rollHistory ?? []), [connectedRoomCode, data?.rollHistory, roomEntries]);

  const replayEntries = useMemo(() => {
    if (!data) {
      return [];
    }

    if (!activeReplayId) {
      return defaultFeedEntries;
    }

    const replay = data.sessionReplays.find((entry) => entry.id === activeReplayId);
    return replay ? replay.entries : defaultFeedEntries;
  }, [activeReplayId, data, defaultFeedEntries]);

  const visibleEntries = useMemo(() => {
    if (!data) {
      return [];
    }

    const hiddenSet = new Set(data.moderation.hiddenAliases.map((alias) => alias.toLowerCase()));
    return replayEntries.filter((entry) => !hiddenSet.has(entry.playerAlias.toLowerCase()));
  }, [data, replayEntries]);

  const feedItems = useMemo(() => {
    if (!data) {
      return [];
    }
    return groupFeedEntries(visibleEntries, data.moderation.spamWindowMs);
  }, [data, visibleEntries]);

  const joinableRooms = useMemo(
    () => availableRooms.filter((room) => room.roomCode !== connectedRoomCode),
    [availableRooms, connectedRoomCode]
  );

  const runRoll = (options: {
    source: RollEntry['source'];
    forcedFormula?: string;
    forcedCounts?: DiceCounts;
    forcedSecret?: boolean;
    note?: string;
  }): void => {
    if (!data) {
      return;
    }

    clearMessages();

    const aliasError = validateAlias(data.preferences.playerAlias);
    const roomNameError = validateRoomName(data.preferences.roomName);

    if (aliasError) {
      setLocalError(aliasError);
      return;
    }
    if (roomNameError) {
      setLocalError(roomNameError);
      return;
    }

    const finalFormula = options.forcedFormula ?? formula.trim();
    const finalCounts = options.forcedCounts ?? counts;
    const finalSecret = options.forcedSecret ?? secretRoll;

    const rng = createRng(data.preferences.rngMode);

    let total = 0;
    let dicePools: RollEntry['dicePools'] = [];
    let modifier = 0;
    let normalizedFormula: string | null = null;

    try {
      if (finalFormula) {
        const result = evaluateFormula(finalFormula, rng);
        total = result.total;
        dicePools = result.dicePools;
        modifier = result.modifierTotal;
        normalizedFormula = result.parsed.normalized;
      } else {
        const countsLabel = buildCountsLabel(finalCounts);
        if (!countsLabel) {
          setLocalError('Choose at least one die quantity or enter a formula.');
          return;
        }
        const result = rollCounts(finalCounts, rng);
        total = result.total;
        dicePools = result.dicePools;
      }
    } catch (rollError) {
      setLocalError((rollError as Error).message);
      return;
    }

    const countsLabel = buildCountsLabel(finalCounts);
    const roomCode = connectedRoomCode ?? (normalizeRoomCode(data.preferences.roomCode) || 'LOCAL');
    const entry: RollEntry = {
      id: createId('roll'),
      timestamp: Date.now(),
      playerAlias: normalizeAlias(data.preferences.playerAlias),
      roomName: normalizeAlias(data.preferences.roomName),
      roomCode,
      secret: finalSecret,
      source: options.source,
      formula: normalizedFormula,
      modifier,
      total,
      dicePools,
      spamKey: buildSpamKey({
        playerAlias: data.preferences.playerAlias,
        roomName: data.preferences.roomName,
        roomCode,
        secret: finalSecret,
        formula: normalizedFormula,
        countsLabel
      }),
      note: options.note
    };

    commit((previous) => ({
      ...previous,
      rollHistory: [entry, ...previous.rollHistory]
    }));

    if (connectedRoomCode) {
      void (async () => {
        try {
          const inserted = await insertRoomRoll({
            roomCode: connectedRoomCode,
            roomName: normalizeAlias(data.preferences.roomName),
            playerAlias: normalizeAlias(data.preferences.playerAlias),
            secret: finalSecret,
            source: options.source,
            formula: normalizedFormula,
            modifier,
            total,
            dicePools,
            note: options.note
          });

          setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, [inserted]));
        } catch (publishError) {
          setLocalError(`Roll stored locally but publish failed: ${(publishError as Error).message}`);
        }
      })();
    }

    setStatusMessage(connectedRoomCode ? 'Roll published to shared room.' : 'Roll recorded locally.');
  };

  if (loading || !data) {
    return <main className="app-shell">Loading workspace...</main>;
  }

  const replaySource = connectedRoomCode ? roomEntries : data.rollHistory;

  const onSaveReplay = (): void => {
    if (replaySource.length === 0) {
      setLocalError('Cannot save replay before at least one roll exists.');
      return;
    }

    const replay = {
      id: createId('replay'),
      name: `${connectedRoomCode ?? data.preferences.roomName} ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      playerAlias: data.preferences.playerAlias,
      roomName: connectedRoomCode ?? data.preferences.roomName,
      entries: replaySource
    };

    commit((previous) => ({
      ...previous,
      sessionReplays: [replay, ...previous.sessionReplays]
    }));

    setStatusMessage('Replay snapshot saved.');
  };

  const onImportJson = async (file: File): Promise<void> => {
    clearMessages();
    try {
      const raw = await file.text();
      const imported = parseImportedSession(raw);
      replaceData(imported);
      setCounts(createEmptyCounts());
      setFormula('');
      setSecretRoll(imported.preferences.defaultSecret);
      setStatusMessage('Session imported.');
    } catch (importError) {
      setLocalError((importError as Error).message);
    }
  };

  const onShareContext = async (): Promise<void> => {
    clearMessages();
    const shareCode = connectedRoomCode ?? normalizeRoomCode(data.preferences.roomCode);

    if (!shareCode) {
      setLocalError('Enter or join a room code before sharing.');
      return;
    }

    const url = buildShareUrl(
      {
        roomCode: shareCode,
        player: data.preferences.playerAlias,
        replayId: activeReplayId ?? undefined
      },
      window.location.href
    );

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setStatusMessage('Share URL copied to clipboard.');
      } else {
        window.prompt('Copy share URL', url);
      }
    } catch {
      window.prompt('Copy share URL', url);
    }
  };

  const canPaginateRoomHistory = !activeReplayId && !!connectedRoomCode;
  const connectedMode = Boolean(connectedRoomCode);

  const renderPresetsPanel = (className?: string): JSX.Element => (
    <PresetsPanel
      className={className}
      presets={data.presets}
      onCreate={(name) => {
        clearMessages();
        try {
          commit((previous) => ({
            ...previous,
            presets: createPreset(previous.presets, {
              name,
              counts,
              formula,
              secret: secretRoll
            })
          }));
          setStatusMessage('Preset created.');
        } catch (presetError) {
          setLocalError((presetError as Error).message);
        }
      }}
      onRename={(presetId, name) => {
        clearMessages();
        try {
          commit((previous) => ({
            ...previous,
            presets: renamePreset(previous.presets, presetId, name)
          }));
          setStatusMessage('Preset renamed.');
        } catch (renameError) {
          setLocalError((renameError as Error).message);
        }
      }}
      onUpdate={(presetId) => {
        clearMessages();
        commit((previous) => ({
          ...previous,
          presets: updatePresetFromDraft(previous.presets, presetId, {
            counts,
            formula,
            secret: secretRoll
          })
        }));
        setStatusMessage('Preset updated from current setup.');
      }}
      onDelete={(presetId) => {
        commit((previous) => ({
          ...previous,
          presets: deletePreset(previous.presets, presetId)
        }));
        setStatusMessage('Preset deleted.');
      }}
      onApply={(presetId) => {
        clearMessages();
        try {
          const preset = applyPreset(data.presets, presetId);
          setCounts({ ...preset.counts });
          setFormula(preset.formula);
          setSecretRoll(preset.secret);
          setStatusMessage(`Preset "${preset.name}" applied.`);
        } catch (applyError) {
          setLocalError((applyError as Error).message);
        }
      }}
    />
  );

  return (
    <main className="app-shell" style={{ backgroundImage: currentBackground.image }}>
      <div className="overlay" />
      <div className="content">
        <header className="hero">
          <h1>Dice Workspace Roller</h1>
          <p>Frontend tabletop roller with managed realtime shared rooms, secure RNG mode, local OPFS persistence, presets, and replay/export tools.</p>
          <div className="badge-row">
            <span className="badge">Storage: {storageKind === 'opfs' ? 'OPFS file' : 'IndexedDB fallback'}</span>
            <span className="badge">RNG: {data.preferences.rngMode === 'crypto' ? 'Fairness mode (crypto)' : 'Math.random mode'}</span>
            <span className="badge">Realtime: {realtimeReady ? 'Supabase enabled' : 'Not configured'}</span>
          </div>
        </header>

        {(error || localError || statusMessage) && (
          <section className="panel status-panel" aria-live="polite">
            {error ? <p className="error-text">Storage error: {error}</p> : null}
            {localError ? <p className="error-text">{localError}</p> : null}
            {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
          </section>
        )}

        <section className="panel">
          <h2>Randomness Mode</h2>
          <div className="row wrap gap-sm">
            <label className="inline-toggle" htmlFor="rng-crypto">
              <input
                id="rng-crypto"
                type="radio"
                name="rng-mode"
                checked={data.preferences.rngMode === 'crypto'}
                onChange={() =>
                  commit((previous) => ({
                    ...previous,
                    preferences: {
                      ...previous.preferences,
                      rngMode: 'crypto'
                    }
                  }))
                }
              />
              Fairness mode (crypto.getRandomValues)
            </label>
            <label className="inline-toggle" htmlFor="rng-math">
              <input
                id="rng-math"
                type="radio"
                name="rng-mode"
                checked={data.preferences.rngMode === 'math'}
                onChange={() =>
                  commit((previous) => ({
                    ...previous,
                    preferences: {
                      ...previous.preferences,
                      rngMode: 'math'
                    }
                  }))
                }
              />
              Standard mode (Math.random)
            </label>
          </div>
        </section>

        <div className={`layout-grid ${connectedMode ? 'layout-grid-connected' : ''}`}>
          <div className="column sidebar-column">
            {connectedMode ? renderPresetsPanel('presets-emphasis sidebar-presets-top') : null}

            <RoomProfilePanel
              playerAlias={data.preferences.playerAlias}
              roomName={data.preferences.roomName}
              ownerMode={data.moderation.ownerMode}
              roomLocked={data.moderation.roomLocked}
              defaultSecret={data.preferences.defaultSecret}
              onPlayerAliasChange={(value) =>
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    playerAlias: value.replace(/[^A-Za-z0-9 _'\-]/g, '').slice(0, 24)
                  }
                }))
              }
              onRoomNameChange={(value) => {
                if (data.moderation.roomLocked) {
                  return;
                }
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    roomName: value.replace(/[^A-Za-z0-9 _'\-]/g, '').slice(0, 32)
                  }
                }));
              }}
              onOwnerModeChange={(value) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    ownerMode: value,
                    roomLocked: value ? previous.moderation.roomLocked : false
                  }
                }))
              }
              onRoomLockedChange={(value) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    roomLocked: previous.moderation.ownerMode ? value : false
                  }
                }))
              }
              onDefaultSecretChange={(value) => {
                setSecretRoll(value);
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    defaultSecret: value
                  }
                }));
              }}
            />

            <SharedRoomPanel
              roomCode={data.preferences.roomCode}
              connectedRoomCode={connectedRoomCode}
              authUserId={authUserId}
              realtimeReady={realtimeReady}
              connecting={roomConnecting}
              members={presenceMembers}
              recentPresenceEvents={presenceEvents}
              availableRooms={joinableRooms}
              loadingRooms={loadingRooms}
              onRoomCodeChange={(value) =>
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    roomCode: normalizeRoomCode(value)
                  }
                }))
              }
              onSelectExistingRoom={(roomCode) => {
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    roomCode
                  }
                }));
                void connectToRoom(roomCode);
              }}
              onRefreshRooms={() => {
                void refreshAvailableRooms();
              }}
              onJoin={() => {
                void connectToRoom();
              }}
              onLeave={() => {
                void leaveConnectedRoom();
              }}
            />

            <BackgroundCarousel
              currentId={data.preferences.backgroundId}
              autoCarousel={data.preferences.autoCarousel}
              disabled={data.moderation.roomLocked}
              onSelect={(id) => {
                if (data.moderation.roomLocked) {
                  return;
                }
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    backgroundId: id
                  }
                }));
              }}
              onNext={() => {
                if (data.moderation.roomLocked) {
                  return;
                }
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    backgroundId: nextBackgroundId(previous.preferences.backgroundId, 1)
                  }
                }));
              }}
              onPrev={() => {
                if (data.moderation.roomLocked) {
                  return;
                }
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    backgroundId: nextBackgroundId(previous.preferences.backgroundId, -1)
                  }
                }));
              }}
              onToggleAuto={(value) =>
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    autoCarousel: value
                  }
                }))
              }
            />

            {!connectedMode ? renderPresetsPanel() : null}

            <ModerationPanel
              moderation={data.moderation}
              onAddMuted={(alias) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    mutedAliases: dedupeAliasList(previous.moderation.mutedAliases, alias)
                  }
                }))
              }
              onRemoveMuted={(alias) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    mutedAliases: removeAlias(previous.moderation.mutedAliases, alias)
                  }
                }))
              }
              onAddHidden={(alias) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    hiddenAliases: dedupeAliasList(previous.moderation.hiddenAliases, alias)
                  }
                }))
              }
              onRemoveHidden={(alias) =>
                commit((previous) => ({
                  ...previous,
                  moderation: {
                    ...previous.moderation,
                    hiddenAliases: removeAlias(previous.moderation.hiddenAliases, alias)
                  }
                }))
              }
            />
          </div>

          <div className="column rolling-column">
            <section className={`rolling-spotlight ${connectedMode ? 'connected' : ''}`}>
              <QuickActions
                onRollPublicD20={() => runRoll({ source: 'quick', forcedFormula: '1d20', forcedSecret: false, note: 'Quick 1d20' })}
                onRollSecretD20={() => runRoll({ source: 'quick', forcedFormula: '1d20', forcedSecret: true, note: 'Quick secret 1d20' })}
              onRollRandomBatch={() => {
                const template = rollRandomBatchTemplate(createRng(data.preferences.rngMode));
                runRoll({ source: 'quick', forcedCounts: template, forcedFormula: '', note: 'Random batch' });
              }}
            />

              <RollComposer
                counts={counts}
                formula={formula}
                secretRoll={secretRoll}
                onCountChange={(sides, value) => {
                  setCounts((previous) => ({
                    ...previous,
                    [sides]: sanitizePositiveInt(value, 99)
                  }));
                }}
                onFormulaChange={(value) => {
                  setFormula(value);
                }}
                onSecretRollChange={(value) => setSecretRoll(value)}
                onRoll={() => runRoll({ source: formula.trim() ? 'formula' : 'manual' })}
                onReset={() => {
                  setCounts(createEmptyCounts());
                  setFormula('');
                  setSecretRoll(data.preferences.defaultSecret);
                  setStatusMessage('Inputs reset.');
                  setLocalError(null);
                }}
              />
            </section>

            <HistoryFeed
              items={feedItems}
              mutedAliases={data.moderation.mutedAliases}
              hasMore={canPaginateRoomHistory && hasMoreRoomHistory}
              loadingMore={loadingMoreHistory}
              onLoadMore={() => {
                void loadMoreRoomHistory();
              }}
            />

            <SessionPanel
              storageKind={storageKind}
              replays={data.sessionReplays}
              activeReplayId={activeReplayId}
              onSaveReplay={onSaveReplay}
              onLoadReplay={(id) => {
                setActiveReplayId(id);
                setStatusMessage('Replay mode enabled.');
              }}
              onExitReplay={() => {
                setActiveReplayId(null);
                setStatusMessage('Replay mode disabled.');
              }}
              onExportJson={() => {
                downloadTextFile(`dice-session-${Date.now()}.json`, toSessionJson(data), 'application/json');
                setStatusMessage('Session JSON exported.');
              }}
              onExportCsv={() => {
                const csv = historyToCsv(replaySource);
                downloadTextFile(`dice-rolls-${Date.now()}.csv`, csv, 'text/csv');
                setStatusMessage('Roll CSV exported.');
              }}
              onImportJson={(file) => {
                void onImportJson(file);
              }}
              onShareContext={() => {
                void onShareContext();
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
