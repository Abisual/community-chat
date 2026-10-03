export interface PrivateMessageState {
  id: string;
  conversation_id: number;
  sender_id: number;
  sender_username: string;
  content: string;
  created_at: string;
}

export interface FriendPresenceState {
  id: number;
  username: string;
  status: 'online' | 'offline';
}

export function mergePrivateMessages(
  current: PrivateMessageState[],
  incoming: PrivateMessageState[]
): PrivateMessageState[] {
  const byId = new Map<string, PrivateMessageState>();
  for (const message of [...current, ...incoming]) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    const left = BigInt(a.id);
    const right = BigInt(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function updateFriendPresence(
  friends: FriendPresenceState[],
  userId: number,
  status: 'online' | 'offline'
): FriendPresenceState[] {
  return friends.map((friend) => friend.id === userId ? { ...friend, status } : friend);
}
