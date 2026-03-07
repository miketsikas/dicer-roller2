import type { AppData } from '../types';

export interface ClientStorageBackend {
  kind: 'opfs' | 'idb';
  init(): Promise<void>;
  listFileNames(): Promise<string[]>;
  readFile(fileName: string): Promise<AppData | null>;
  writeFile(fileName: string, data: AppData): Promise<void>;
  deleteFile(fileName: string): Promise<void>;
}
