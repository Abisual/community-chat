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
  getChatSocketUrl(): Promise<string>;
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
  interface ChatMessage {
    id: number;
    user_id: number;
    username: string;
    content: string;
    created_at: string;
  }
}

export {};
