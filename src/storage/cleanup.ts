import type { AppData } from '../types';
import type { ClientStorageBackend } from './backend';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

function touchedAt(data: AppData): number {
  return data.updatedAt || data.createdAt || 0;
}

export function isStale(data: AppData, now = Date.now()): boolean {
  return now - touchedAt(data) > NINETY_DAYS_MS;
}

export function shouldRunDailyCleanup(lastCleanupAt: number, now = Date.now()): boolean {
  return now - lastCleanupAt >= ONE_DAY_MS;
}

export async function cleanupStaleClientFiles(
  backend: ClientStorageBackend,
  options: { now?: number; keepFileName?: string } = {}
): Promise<string[]> {
  const now = options.now ?? Date.now();
  const removed: string[] = [];
  const names = await backend.listFileNames();

  for (const name of names) {
    if (!name.startsWith('client-') || !name.endsWith('.json')) {
      continue;
    }

    if (options.keepFileName && name === options.keepFileName) {
      continue;
    }

    const data = await backend.readFile(name);
    if (!data || isStale(data, now)) {
      await backend.deleteFile(name);
      removed.push(name);
    }
  }

  return removed;
}
