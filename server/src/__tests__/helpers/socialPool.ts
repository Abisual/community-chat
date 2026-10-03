interface User { id: number; username: string; }
interface RequestRow {
  id: number; requester_id: number; recipient_id: number;
  status: 'pending' | 'accepted' | 'rejected'; created_at: Date;
}
interface Conversation { id: number; user_low_id: number; user_high_id: number; created_at: Date; }
interface PrivateMessage {
  id: string; conversation_id: number; sender_id: number; sender_username: string;
  content: string; created_at: Date; recipient_id?: number;
}

const users = new Map<number, User>();
const requests = new Map<number, RequestRow>();
const friendships = new Set<string>();
const conversations = new Map<number, Conversation>();
const privateMessages: PrivateMessage[] = [];
let nextRequestId = 1;
let nextConversationId = 1;
let nextMessageId = 1n;

function pairKey(a: number, b: number): string { return `${Math.min(a, b)}:${Math.max(a, b)}`; }
function withNames(row: RequestRow) {
  return {
    ...row,
    requester_username: users.get(row.requester_id)?.username,
    recipient_username: users.get(row.recipient_id)?.username
  };
}
function messageRow(message: PrivateMessage) {
  const conversation = conversations.get(message.conversation_id)!;
  return { ...message, recipient_id: message.sender_id === conversation.user_low_id ? conversation.user_high_id : conversation.user_low_id };
}

export function seedSocialUser(id: number, username: string): void { users.set(id, { id, username }); }

export function resetSocialData(): void {
  users.clear(); requests.clear(); friendships.clear(); conversations.clear(); privateMessages.splice(0);
  nextRequestId = 1; nextConversationId = 1; nextMessageId = 1n;
}

export const pool = {
  query: async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    const marker = sql.match(/\/\* (social\.[A-Za-z]+) \*\//)?.[1];
    const [p1, p2, p3] = params as [number, number, number];

    switch (marker) {
      case 'social.searchUsers': {
        const prefix = params[1] as string;
        const plainPrefix = prefix.slice(0, -1).replace(/\\([\\%_])/g, '$1').toLowerCase();
        const rows = [...users.values()].filter((u) => u.id !== p1 && u.username.toLowerCase().startsWith(plainPrefix))
          .sort((a, b) => a.username.localeCompare(b.username)).slice(0, p3);
        return { rows, rowCount: rows.length };
      }
      case 'social.createFriendRequest': {
        const target = users.get(p2);
        const duplicate = [...requests.values()].some((r) => r.status === 'pending' && pairKey(r.requester_id, r.recipient_id) === pairKey(p1, p2));
        if (!target || friendships.has(pairKey(p1, p2)) || duplicate) return { rows: [], rowCount: 0 };
        const row: RequestRow = { id: nextRequestId++, requester_id: p1, recipient_id: p2, status: 'pending', created_at: new Date() };
        requests.set(row.id, row);
        return { rows: [row], rowCount: 1 };
      }
      case 'social.requestDetails': return { rows: requests.has(p1) ? [withNames(requests.get(p1)!)] : [], rowCount: 1 };
      case 'social.requestState': return { rows: [{
        requester_exists: users.has(p1), recipient_exists: users.has(p2), already_friends: friendships.has(pairKey(p1, p2)),
        request_pending: [...requests.values()].some((r) => r.status === 'pending' && pairKey(r.requester_id, r.recipient_id) === pairKey(p1, p2))
      }], rowCount: 1 };
      case 'social.incomingRequests':
      case 'social.outgoingRequests': {
        const incoming = marker === 'social.incomingRequests';
        const rows = [...requests.values()].filter((r) => r.status === 'pending' && (incoming ? r.recipient_id === p1 : r.requester_id === p1))
          .sort((a, b) => b.id - a.id).map(withNames);
        return { rows, rowCount: rows.length };
      }
      case 'social.acceptFriendRequest': {
        const row = requests.get(p1);
        if (!row || row.recipient_id !== p2 || row.status !== 'pending') return { rows: [], rowCount: 0 };
        row.status = 'accepted';
        for (const reverse of requests.values()) {
          if (reverse.id !== row.id && reverse.status === 'pending' && pairKey(reverse.requester_id, reverse.recipient_id) === pairKey(row.requester_id, row.recipient_id)) reverse.status = 'rejected';
        }
        friendships.add(pairKey(row.requester_id, row.recipient_id));
        return { rows: [withNames(row)], rowCount: 1 };
      }
      case 'social.rejectFriendRequest': {
        const row = requests.get(p1);
        if (!row || row.recipient_id !== p2 || row.status !== 'pending') return { rows: [], rowCount: 0 };
        row.status = 'rejected';
        return { rows: [withNames(row)], rowCount: 1 };
      }
      case 'social.listFriends': {
        const ids = [...friendships].map((key) => key.split(':').map(Number)).filter(([a, b]) => a === p1 || b === p1).map(([a, b]) => a === p1 ? b : a);
        const rows = ids.map((id) => users.get(id)).filter(Boolean).sort((a, b) => a!.username.localeCompare(b!.username));
        return { rows, rowCount: rows.length };
      }
      case 'social.removeFriendship': {
        const key = pairKey(p1, p2);
        const existed = friendships.delete(key);
        return { rows: existed ? [{ user_low_id: Math.min(p1, p2) }] : [], rowCount: existed ? 1 : 0 };
      }
      case 'social.openConversation': {
        const ownerId = params[2] as number;
        const peerId = ownerId === p1 ? p2 : p1;
        if (!users.has(ownerId) || !users.has(peerId)) return { rows: [], rowCount: 0 };
        const existing = [...conversations.values()].find((c) => c.user_low_id === p1 && c.user_high_id === p2);
        if (existing) return { rows: [{ id: existing.id, created_at: existing.created_at, user_id: peerId, username: users.get(peerId)!.username }], rowCount: 1 };
        const conversation = { id: nextConversationId++, user_low_id: p1, user_high_id: p2, created_at: new Date() };
        conversations.set(conversation.id, conversation);
        return { rows: [{ id: conversation.id, created_at: conversation.created_at, user_id: peerId, username: users.get(peerId)!.username }], rowCount: 1 };
      }
      case 'social.getConversation': {
        const row = conversations.get(p1);
        const rows = row && (row.user_low_id === p2 || row.user_high_id === p2) ? [row] : [];
        return { rows, rowCount: rows.length };
      }
      case 'social.listMessages': {
        const before = params[1] === null ? undefined : BigInt(params[1] as string);
        const rows = privateMessages.filter((m) => m.conversation_id === p1 && (!before || BigInt(m.id) < before))
          .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, p3);
        return { rows, rowCount: rows.length };
      }
      case 'social.createPrivateMessage': {
        const conversation = conversations.get(p1);
        if (!conversation || (conversation.user_low_id !== p2 && conversation.user_high_id !== p2)) return { rows: [], rowCount: 0 };
        const row: PrivateMessage = {
          id: String(nextMessageId++), conversation_id: p1, sender_id: p2,
          sender_username: users.get(p2)?.username ?? '', content: params[2] as string, created_at: new Date()
        };
        privateMessages.push(row);
        return { rows: [messageRow(row)], rowCount: 1 };
      }
      default:
        if (sql.startsWith('SELECT id, user_id, username, content, created_at FROM (')) return { rows: [], rowCount: 0 };
        throw new Error(`Unhandled social mock query ${marker ?? sql}`);
    }
  },
  end: async () => undefined,
  connect: async () => { throw new Error('connect() is not used by the current social queries'); }
};

export const testConnection = async () => undefined;
