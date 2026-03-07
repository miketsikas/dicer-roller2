import type { AppData } from '../types';
import type { ClientStorageBackend } from './backend';

const DB_NAME = 'dice-workspace-storage';
const STORE_NAME = 'client-files';

interface FileRecord {
  name: string;
  content: string;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbBackend implements ClientStorageBackend {
  public readonly kind = 'idb' as const;

  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'name' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async listFileNames(): Promise<string[]> {
    const store = this.getStore('readonly');
    const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
    return keys.map((key) => String(key));
  }

  async readFile(fileName: string): Promise<AppData | null> {
    const store = this.getStore('readonly');
    const record = await requestToPromise<FileRecord | undefined>(store.get(fileName));
    if (!record) {
      return null;
    }

    try {
      return JSON.parse(record.content) as AppData;
    } catch {
      return null;
    }
  }

  async writeFile(fileName: string, data: AppData): Promise<void> {
    const store = this.getStore('readwrite');
    await requestToPromise(store.put({ name: fileName, content: JSON.stringify(data) } satisfies FileRecord));
  }

  async deleteFile(fileName: string): Promise<void> {
    const store = this.getStore('readwrite');
    await requestToPromise(store.delete(fileName));
  }

  private getStore(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDB backend not initialized.');
    }
    return this.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }
}
