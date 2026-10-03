import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname } from 'path';

export interface SessionUser {
  id: number;
  username: string;
}

export interface StoredSession {
  user: SessionUser;
  refreshToken: string;
}

export interface SessionEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class EncryptedSessionStore {
  private session: StoredSession | null = null;

  constructor(private readonly filePath: string, private readonly encryption: SessionEncryption) {}

  async load(): Promise<StoredSession | null> {
    if (this.session) return this.session;
    if (!this.encryption.isEncryptionAvailable()) return null;

    try {
      const encrypted = await readFile(this.filePath);
      const parsed: unknown = JSON.parse(this.encryption.decryptString(encrypted));
      if (!this.isStoredSession(parsed)) {
        await this.clear();
        return null;
      }
      this.session = parsed;
      return this.session;
    } catch {
      return null;
    }
  }

  async save(session: StoredSession): Promise<void> {
    this.session = session;
    if (!this.encryption.isEncryptionAvailable()) return;

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, this.encryption.encryptString(JSON.stringify(session)), { mode: 0o600 });
  }

  async clear(): Promise<void> {
    this.session = null;
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private isStoredSession(value: unknown): value is StoredSession {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredSession>;
    return typeof candidate.refreshToken === 'string'
      && !!candidate.user
      && Number.isSafeInteger(candidate.user.id)
      && typeof candidate.user.username === 'string';
  }
}
