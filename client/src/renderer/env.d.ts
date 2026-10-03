interface DesktopSession {
  user: { id: number; username: string };
  accessToken: string;
}

interface DesktopApi {
  login(username: string, password: string): Promise<DesktopSession>;
  register(username: string, password: string): Promise<DesktopSession>;
  restoreSession(): Promise<DesktopSession | null>;
  refreshAccessToken(): Promise<DesktopSession | null>;
  logout(): Promise<void>;
  getVoiceRooms(accessToken: string): Promise<{ data: { rooms: VoiceRoom[] }; accessToken: string }>;
  getVoiceToken(accessToken: string, roomId: number): Promise<{ data: VoiceToken; accessToken: string }>;
  getChatHistory(accessToken: string, limit: number): Promise<{ data: { messages: ChatMessage[] }; accessToken: string }>;
  searchUsers(accessToken: string, query: string): Promise<{ data: { users: SocialUser[] }; accessToken: string }>;
  getFriendRequests(accessToken: string): Promise<{ data: { incoming: FriendRequest[]; outgoing: FriendRequest[] }; accessToken: string }>;
  getFriends(accessToken: string): Promise<{ data: { friends: SocialUser[] }; accessToken: string }>;
  createFriendRequest(accessToken: string, userId: number): Promise<{ data: unknown; accessToken: string }>;
  respondFriendRequest(accessToken: string, requestId: number, action: 'accept' | 'reject'): Promise<{ data: unknown; accessToken: string }>;
  removeFriend(accessToken: string, userId: number): Promise<{ data: unknown; accessToken: string }>;
  openConversation(accessToken: string, userId: number): Promise<{ data: { conversation: Conversation }; accessToken: string }>;
  getPrivateMessages(accessToken: string, conversationId: number, limit: number, before?: string): Promise<{ data: { messages: PrivateMessage[]; hasMore: boolean; nextBeforeId: string | null }; accessToken: string }>;
  sendPrivateMessage(accessToken: string, conversationId: number, content: string): Promise<{ data: { message: PrivateMessage }; accessToken: string }>;
  getChatSocketUrl(): Promise<string>;
  getScreenShareSources(): Promise<ScreenShareSource[]>;
  selectScreenShareSource(sourceId: string): Promise<void>;
  cancelScreenShareSelection(): Promise<void>;
  onToggleMute(callback: () => void): () => void;
}

declare global {
  interface Window { desktop: DesktopApi; }
  interface VoiceRoom {
    id: number;
    name: string;
    description: string;
    maxParticipants: number;
  }
  interface VoiceToken {
    url: string;
    token: string;
    room: { id: number; name: string; maxParticipants: number };
  }
  interface ScreenShareSource {
    id: string;
    name: string;
    kind: 'screen' | 'window';
    thumbnail: string;
  }
  interface ChatMessage {
    id: number;
    user_id: number;
    username: string;
    content: string;
    created_at: string;
  }
  interface SocialUser {
    id: number;
    username: string;
    status: 'online' | 'offline';
  }
  interface FriendRequest {
    id: number;
    user: { id: number; username: string };
    created_at: string;
  }
  interface Conversation {
    id: number;
    user: { id: number; username: string };
    created_at: string;
  }
  interface PrivateMessage {
    id: string;
    conversation_id: number;
    sender_id: number;
    sender_username: string;
    content: string;
    created_at: string;
  }
}

export {};
