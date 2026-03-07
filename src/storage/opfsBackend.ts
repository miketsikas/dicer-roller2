import type { AppData } from '../types';
import type { ClientStorageBackend } from './backend';

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && 'getDirectory' in navigator.storage;
}

export class OpfsBackend implements ClientStorageBackend {
  public readonly kind = 'opfs' as const;

  private root: FileSystemDirectoryHandle | null = null;

  async init(): Promise<void> {
    if (!isOpfsSupported()) {
      throw new Error('OPFS is not supported in this browser.');
    }
    this.root = await navigator.storage.getDirectory();
  }

  async listFileNames(): Promise<string[]> {
    const root = this.requireRoot();
    const names: string[] = [];

    // OPFS directory iteration is async iterable by spec.
    const entries = (root as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries();
    for await (const [name, handle] of entries) {
      if (handle.kind === 'file') {
        names.push(name);
      }
    }

    return names;
  }

  async readFile(fileName: string): Promise<AppData | null> {
    const root = this.requireRoot();
    try {
      const fileHandle = await root.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as AppData;
    } catch {
      return null;
    }
  }

  async writeFile(fileName: string, data: AppData): Promise<void> {
    const root = this.requireRoot();
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  }

  async deleteFile(fileName: string): Promise<void> {
    const root = this.requireRoot();
    try {
      await root.removeEntry(fileName);
    } catch {
      // Ignore missing files.
    }
  }

  private requireRoot(): FileSystemDirectoryHandle {
    if (!this.root) {
      throw new Error('OPFS backend not initialized.');
    }
    return this.root;
  }
}
