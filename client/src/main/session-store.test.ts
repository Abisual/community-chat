import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EncryptedSessionStore, SessionEncryption } from './session-store';
import { createSingleFlight } from './single-flight';
import { isTrustedRendererUrl, mayAccessMedia, mayAccessMicrophone, mayCaptureScreen } from './security';

const temporaryPaths: string[] = [];

async function createStore(encryptionAvailable = true) {
  const directory = await mkdtemp(join(tmpdir(), 'community-chat-session-'));
  temporaryPaths.push(directory);
  const filePath = join(directory, 'session.bin');
  const encryption: SessionEncryption = {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value) => value.toString().split('').reverse().join('')
  };
  return { store: new EncryptedSessionStore(filePath, encryption), filePath, encryption };
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('EncryptedSessionStore', () => {
  it('delegates persistence to the encryption adapter and restores the session', async () => {
    const { store, filePath, encryption } = await createStore();
    const session = { user: { id: 3, username: 'alice' }, refreshToken: 'long-lived-secret' };
    await store.save(session);

    const fileContent = await readFile(filePath, 'utf8');
    expect(fileContent).not.toContain(session.refreshToken);
    const restored = new EncryptedSessionStore(filePath, encryption);
    await expect(restored.load()).resolves.toEqual(session);
    await restored.clear();
  });

  it('keeps a session only in memory when operating-system encryption is unavailable', async () => {
    const { store, filePath } = await createStore(false);
    const session = { user: { id: 4, username: 'bob' }, refreshToken: 'do-not-write-plaintext' };
    await store.save(session);

    await expect(store.load()).resolves.toEqual(session);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('createSingleFlight', () => {
  it('shares one refresh operation among concurrent callers', async () => {
    let complete: ((value: string) => void) | undefined;
    const operation = vi.fn(() => new Promise<string>((resolve) => { complete = resolve; }));
    const refresh = createSingleFlight(operation);

    const first = refresh();
    const second = refresh();
    expect(operation).toHaveBeenCalledTimes(1);
    complete?.('rotated-token');
    await expect(Promise.all([first, second])).resolves.toEqual(['rotated-token', 'rotated-token']);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('Electron renderer permissions', () => {
  it('allows microphone access only to the trusted main frame', () => {
    const request = {
      isMainWindow: true,
      isMainFrame: true,
      requestingUrl: 'file:///app/out/renderer/index.html',
      mediaTypes: ['audio']
    };
    expect(mayAccessMicrophone(request)).toBe(true);
    expect(mayAccessMicrophone({ ...request, mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(mayAccessMicrophone({ ...request, isMainFrame: false })).toBe(false);
    expect(mayAccessMicrophone({ ...request, isMainWindow: false })).toBe(false);
    expect(mayAccessMicrophone({ ...request, requestingUrl: 'https://untrusted.example/' })).toBe(false);
  });

  it('allows capture-video permission only for the trusted main frame with a selected screen source', () => {
    const request = {
      isMainWindow: true,
      isMainFrame: true,
      requestingUrl: 'file:///app/out/renderer/index.html',
      mediaTypes: ['video'],
      selectedSourceAvailable: true
    };
    expect(mayAccessMedia(request)).toBe(true);
    expect(mayAccessMedia({ ...request, mediaTypes: [] })).toBe(true);
    expect(mayAccessMedia({ ...request, mediaTypes: [], selectedSourceAvailable: false })).toBe(false);
    expect(mayAccessMedia({ ...request, selectedSourceAvailable: false })).toBe(false);
    expect(mayAccessMedia({ ...request, isMainFrame: false })).toBe(false);
    expect(mayAccessMedia({ ...request, isMainWindow: false })).toBe(false);
    expect(mayAccessMedia({ ...request, requestingUrl: 'https://untrusted.example/' })).toBe(false);
    expect(mayAccessMedia({ ...request, mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(mayAccessMedia({ ...request, mediaTypes: ['camera'] })).toBe(false);
  });

  it('limits development permissions to the configured renderer origin', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/login', 'http://localhost:5173')).toBe(true);
    expect(isTrustedRendererUrl('http://evil.example/login', 'http://localhost:5173')).toBe(false);
  });

  it('allows screen capture only from a trusted main-frame video request with a user gesture and selected source', () => {
    const request = {
      isMainWindow: true,
      isMainFrame: true,
      requestingUrl: 'file:///app/out/renderer/index.html',
      videoRequested: true,
      userGesture: true,
      selectedSourceAvailable: true
    };
    expect(mayCaptureScreen(request)).toBe(true);
    expect(mayCaptureScreen({ ...request, isMainFrame: false })).toBe(false);
    expect(mayCaptureScreen({ ...request, requestingUrl: 'https://untrusted.example/' })).toBe(false);
    expect(mayCaptureScreen({ ...request, userGesture: false })).toBe(false);
    expect(mayCaptureScreen({ ...request, selectedSourceAvailable: false })).toBe(false);
  });
});
