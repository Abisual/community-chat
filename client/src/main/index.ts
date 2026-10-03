import { app, BrowserWindow, globalShortcut, ipcMain, IpcMainInvokeEvent, safeStorage } from 'electron';
import { join } from 'path';
import { EncryptedSessionStore, SessionUser } from './session-store';
import { createSingleFlight } from './single-flight';
import { isTrustedRendererUrl, mayAccessMicrophone } from './security';

const API_BASE_URL = (process.env.COMMUNITY_CHAT_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const sessionStore = new EncryptedSessionStore(
  join(app.getPath('userData'), 'session.bin'),
  safeStorage
);

interface AuthResponse {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'Request failed', response.status);
  return body as T;
}

async function rotateSession(): Promise<{ accessToken: string; user: SessionUser } | null> {
  const stored = await sessionStore.load();
  if (!stored) return null;

  try {
    const response = await requestJson<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: stored.refreshToken })
    });
    await sessionStore.save({ user: stored.user, refreshToken: response.refreshToken });
    return { user: stored.user, accessToken: response.accessToken };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await sessionStore.clear();
      return null;
    }
    throw error;
  }
}

const refreshSession = createSingleFlight(rotateSession);

async function authenticatedRequest<T>(
  path: string,
  accessToken: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ data: T; accessToken: string }> {
  const perform = (token: string) => requestJson<T>(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  try {
    return { data: await perform(accessToken), accessToken };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await refreshSession();
    if (!refreshed) throw error;
    return { data: await perform(refreshed.accessToken), accessToken: refreshed.accessToken };
  }
}

function exposeError(error: unknown): never {
  throw new Error(error instanceof Error ? error.message : 'Request failed');
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow
    || event.sender !== mainWindow.webContents
    || event.senderFrame !== event.sender.mainFrame
    || !isTrustedRendererUrl(event.sender.getURL(), process.env.ELECTRON_RENDERER_URL)) {
    throw new Error('Untrusted IPC sender');
  }
}

ipcMain.handle('auth:login', async (event, username: string, password: string) => {
  assertTrustedIpcSender(event);
  try {
    const response = await requestJson<AuthResponse>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
    await sessionStore.save({ user: response.user, refreshToken: response.refreshToken });
    return { user: response.user, accessToken: response.accessToken };
  } catch (error) { return exposeError(error); }
});

ipcMain.handle('auth:register', async (event, username: string, password: string) => {
  assertTrustedIpcSender(event);
  try {
    const response = await requestJson<AuthResponse>('/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
    await sessionStore.save({ user: response.user, refreshToken: response.refreshToken });
    return { user: response.user, accessToken: response.accessToken };
  } catch (error) { return exposeError(error); }
});

ipcMain.handle('auth:restore', async (event) => { assertTrustedIpcSender(event); return refreshSession(); });
ipcMain.handle('auth:refresh', async (event) => { assertTrustedIpcSender(event); return refreshSession(); });
ipcMain.handle('auth:logout', async (event) => {
  assertTrustedIpcSender(event);
  const stored = await sessionStore.load();
  try {
    if (stored) {
      await requestJson('/auth/logout', {
        method: 'POST', body: JSON.stringify({ refreshToken: stored.refreshToken })
      });
    }
  } finally {
    await sessionStore.clear();
  }
});

ipcMain.handle('api:voice-rooms', async (event, accessToken: string) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest('/voice/rooms', accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:voice-token', async (event, accessToken: string, roomId: number) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest(`/voice/rooms/${roomId}/token`, accessToken, 'POST'); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:chat-history', async (event, accessToken: string, limit: number) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest(`/chat/history?limit=${encodeURIComponent(limit)}`, accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:user-search', async (event, accessToken: string, query: string) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest(`/users/search?q=${encodeURIComponent(query)}`, accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:friend-requests', async (event, accessToken: string) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest('/friends/requests', accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:friends', async (event, accessToken: string) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest('/friends', accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:friend-request-create', async (event, accessToken: string, userId: number) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest('/friends/requests', accessToken, 'POST', { userId }); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:friend-request-respond', async (event, accessToken: string, requestId: number, action: 'accept' | 'reject') => {
  assertTrustedIpcSender(event);
  if (action !== 'accept' && action !== 'reject') throw new Error('Invalid friend request action');
  try { return await authenticatedRequest(`/friends/requests/${encodeURIComponent(requestId)}/${action}`, accessToken, 'POST'); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:friend-remove', async (event, accessToken: string, userId: number) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest(`/friends/${encodeURIComponent(userId)}`, accessToken, 'DELETE'); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:conversation-open', async (event, accessToken: string, userId: number) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest('/conversations', accessToken, 'POST', { userId }); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:conversation-history', async (event, accessToken: string, conversationId: number, limit: number, before?: string) => {
  assertTrustedIpcSender(event);
  const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
  try { return await authenticatedRequest(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=${encodeURIComponent(limit)}${cursor}`, accessToken); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('api:private-message-send', async (event, accessToken: string, conversationId: number, content: string) => {
  assertTrustedIpcSender(event);
  try { return await authenticatedRequest(`/conversations/${encodeURIComponent(conversationId)}/messages`, accessToken, 'POST', { content }); }
  catch (error) { return exposeError(error); }
});
ipcMain.handle('chat:socket-url', (event) => {
  assertTrustedIpcSender(event);
  return `${API_BASE_URL.replace(/^http/, 'ws')}/ws/chat`;
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: '#11131a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const rendererSession = mainWindow.webContents.session;
  rendererSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    permission === 'media'
      && details.mediaType === 'audio'
      && details.isMainFrame
      && !!mainWindow
      && webContents === mainWindow.webContents
      && isTrustedRendererUrl(details.requestingUrl || requestingOrigin, process.env.ELECTRON_RENDERER_URL)
  );
  rendererSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes || [] : [];
    const allowed = permission === 'media' && !!mainWindow && mayAccessMicrophone({
      isMainWindow: webContents === mainWindow.webContents,
      isMainFrame: details.isMainFrame,
      requestingUrl: details.requestingUrl,
      mediaTypes
    }, process.env.ELECTRON_RENDERER_URL);
    callback(allowed);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, process.env.ELECTRON_RENDERER_URL)) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  const registered = globalShortcut.register('CommandOrControl+Shift+M', () => {
    mainWindow?.webContents.send('audio:toggle-mute');
  });
  if (!registered) console.warn('Global mute shortcut could not be registered');

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
