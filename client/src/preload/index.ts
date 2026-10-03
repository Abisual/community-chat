import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  register: (username: string, password: string) => ipcRenderer.invoke('auth:register', username, password),
  restoreSession: () => ipcRenderer.invoke('auth:restore'),
  refreshAccessToken: () => ipcRenderer.invoke('auth:refresh'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getVoiceRooms: (accessToken: string) => ipcRenderer.invoke('api:voice-rooms', accessToken),
  getVoiceToken: (accessToken: string, roomId: number) => ipcRenderer.invoke('api:voice-token', accessToken, roomId),
  getChatHistory: (accessToken: string, limit: number) => ipcRenderer.invoke('api:chat-history', accessToken, limit),
  getChatSocketUrl: () => ipcRenderer.invoke('chat:socket-url'),
  onToggleMute: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('audio:toggle-mute', listener);
    return () => ipcRenderer.removeListener('audio:toggle-mute', listener);
  }
});
