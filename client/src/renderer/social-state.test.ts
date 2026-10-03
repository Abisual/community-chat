import { describe, expect, it } from 'vitest';
import { mergePrivateMessages, updateFriendPresence } from './social-state';

const message = (id: string, content = `message ${id}`) => ({
  id, conversation_id: 3, sender_id: 1, sender_username: 'alice', content, created_at: '2026-01-01T00:00:00.000Z'
});

describe('private message state', () => {
  it('merges history pages and realtime echoes in message ID order without duplicates', () => {
    const current = [message('9007199254740993'), message('9007199254740995')];
    const result = mergePrivateMessages(current, [message('9007199254740992'), message('9007199254740993', 'duplicate echo')]);
    expect(result.map((item) => item.id)).toEqual(['9007199254740992', '9007199254740993', '9007199254740995']);
    expect(result[1].content).toBe('duplicate echo');
  });

  it('updates presence only for the matching friend', () => {
    const friends = [
      { id: 1, username: 'alice', status: 'offline' as const },
      { id: 2, username: 'bob', status: 'offline' as const }
    ];
    expect(updateFriendPresence(friends, 2, 'online')).toEqual([
      friends[0], { id: 2, username: 'bob', status: 'online' }
    ]);
  });
});
