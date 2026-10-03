import { describe, expect, it } from 'vitest';
import { loadRecentConversations, mergeRecentConversation, saveRecentConversations } from './recent-conversations';

describe('local recent conversation shortcuts', () => {
  it('stores only non-secret conversation metadata under a per-user key', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value)
    };
    const conversations = [{ id: 8, user: { id: 4, username: 'friend', status: 'online' as const } }];
    saveRecentConversations(2, conversations, storage);
    expect(data.get('community-chat:recent-conversations:2')).not.toContain('accessToken');
    expect(loadRecentConversations(2, storage)).toEqual(conversations);
    expect(loadRecentConversations(3, storage)).toEqual([]);
  });

  it('moves a reopened conversation to the front without duplicates', () => {
    const a = { id: 1, user: { id: 3, username: 'alice' } };
    const b = { id: 2, user: { id: 4, username: 'bob' } };
    expect(mergeRecentConversation([a, b], a)).toEqual([a, b]);
  });

  it('ignores invalid persisted metadata', () => {
    const storage = { getItem: () => '[{"id":0,"user":{"id":2,"username":"bad"}},{"id":4,"user":{"id":2,"username":"ok"}}]' };
    expect(loadRecentConversations(1, storage)).toEqual([{ id: 4, user: { id: 2, username: 'ok' } }]);
  });
});
