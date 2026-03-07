import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../types';
import { StorageManager } from '../storage';
import { ONE_DAY_MS } from '../storage/cleanup';

interface UseAppDataResult {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  storageKind: 'opfs' | 'idb' | null;
  commit: (updater: (prev: AppData) => AppData) => void;
  replaceData: (next: AppData) => void;
}

export function useAppData(): UseAppDataResult {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageKind, setStorageKind] = useState<'opfs' | 'idb' | null>(null);

  const managerRef = useRef<StorageManager | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const latestDataRef = useRef<AppData | null>(null);

  const queueSave = useCallback((next: AppData) => {
    latestDataRef.current = next;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const manager = managerRef.current;
      if (!manager || !latestDataRef.current) {
        return;
      }
      try {
        await manager.save(latestDataRef.current);
      } catch (saveError) {
        setError((saveError as Error).message);
      }
    }, 300);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async (): Promise<void> => {
      try {
        const manager = new StorageManager();
        managerRef.current = manager;
        const loaded = await manager.loadOrCreate();
        if (cancelled) {
          return;
        }

        latestDataRef.current = loaded.data;
        setStorageKind(loaded.backendKind);
        setData(loaded.data);
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [queueSave]);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const manager = managerRef.current;
      const snapshot = latestDataRef.current;
      if (!manager || !snapshot) {
        return;
      }

      try {
        const cleaned = await manager.runDailyCleanup(snapshot);
        latestDataRef.current = cleaned;
        setData(cleaned);
      } catch (cleanupError) {
        setError((cleanupError as Error).message);
      }
    }, ONE_DAY_MS);

    return () => window.clearInterval(interval);
  }, []);

  const commit = useCallback(
    (updater: (prev: AppData) => AppData) => {
      setData((prev) => {
        if (!prev) {
          return prev;
        }
        const next = updater(prev);
        const withTimestamp: AppData = {
          ...next,
          updatedAt: Date.now()
        };
        queueSave(withTimestamp);
        return withTimestamp;
      });
    },
    [queueSave]
  );

  const replaceData = useCallback(
    (next: AppData) => {
      const withTimestamp: AppData = {
        ...next,
        updatedAt: Date.now()
      };
      setData(withTimestamp);
      queueSave(withTimestamp);
    },
    [queueSave]
  );

  return {
    data,
    loading,
    error,
    storageKind,
    commit,
    replaceData
  };
}
