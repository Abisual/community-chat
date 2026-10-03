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
  searchUsers: (accessToken: string, query: string) => ipcRenderer.invoke('api:user-search', accessToken, query),
  getFriendRequests: (accessToken: string) => ipcRenderer.invoke('api:friend-requests', accessToken),
  getFriends: (accessToken: string) => ipcRenderer.invoke('api:friends', accessToken),
  createFriendRequest: (accessToken: string, userId: number) => ipcRenderer.invoke('api:friend-request-create', accessToken, userId),
  respondFriendRequest: (accessToken: string, requestId: number, action: 'accept' | 'reject') => ipcRenderer.invoke('api:friend-request-respond', accessToken, requestId, action),
  removeFriend: (accessToken: string, userId: number) => ipcRenderer.invoke('api:friend-remove', accessToken, userId),
  openConversation: (accessToken: string, userId: number) => ipcRenderer.invoke('api:conversation-open', accessToken, userId),
  getPrivateMessages: (accessToken: string, conversationId: number, limit: number, before?: string) => ipcRenderer.invoke('api:conversation-history', accessToken, conversationId, limit, before),
  sendPrivateMessage: (accessToken: string, conversationId: number, content: string) => ipcRenderer.invoke('api:private-message-send', accessToken, conversationId, content),
  getChatSocketUrl: () => ipcRenderer.invoke('chat:socket-url'),
  onToggleMute: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('audio:toggle-mute', listener);
    return () => ipcRenderer.removeListener('audio:toggle-mute', listener);
  }
});
