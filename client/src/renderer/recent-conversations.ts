export interface RecentConversation {
  id: number;
  user: { id: number; username: string; status?: 'online' | 'offline' };
  created_at?: string;
}

const storageKey = (userId: number) => `community-chat:recent-conversations:${userId}`;

export function mergeRecentConversation(current: readonly RecentConversation[], next: RecentConversation): RecentConversation[] {
  return [next, ...current.filter((item) => item.id !== next.id)].slice(0, 100);
}

export function loadRecentConversations(userId: number, storage: Pick<Storage, 'getItem'> = localStorage): RecentConversation[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(userId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentConversation =>
      !!item && Number.isSafeInteger(item.id) && item.id > 0
      && !!item.user && Number.isSafeInteger(item.user.id) && item.user.id > 0
      && typeof item.user.username === 'string'
    ).slice(0, 100);
  } catch {
    return [];
  }
}

export function saveRecentConversations(userId: number, conversations: readonly RecentConversation[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(storageKey(userId), JSON.stringify(conversations.slice(0, 100)));
  } catch {
    // Conversation shortcuts remain usable for the current session if storage is unavailable.
  }
}
