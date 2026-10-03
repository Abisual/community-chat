import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import { up as createUsers } from '../database/migrations/001_create_users_table';
import { up as createSocialTables } from '../database/migrations/006_create_social_messaging_tables';
import { SocialDatabase, SocialError } from '../database/models/Social';

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresIntegration = databaseUrl ? describe : describe.skip;

postgresIntegration('social repository with PostgreSQL', () => {
  let adminPool: Pool;
  let scopedPool: Pool;
  let schemaName: string;
  let social: SocialDatabase;

  beforeAll(async () => {
    if (!databaseUrl) return;
    const parsed = new URL(databaseUrl);
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '::1') {
      throw new Error('TEST_DATABASE_URL must point to a loopback PostgreSQL instance');
    }

    adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
    schemaName = `social_test_${randomBytes(6).toString('hex')}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schemaName},public`
    });
    await createUsers(scopedPool);
    await createSocialTables(scopedPool);
    await createSocialTables(scopedPool); // migrations remain safe to retry on server startup
    await scopedPool.query(`
      INSERT INTO users (id, username, password_hash)
      VALUES (1, 'alice', 'test-hash'), (2, 'bob', 'test-hash'), (3, 'carol', 'test-hash')
    `);
    await scopedPool.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), 3, true)`);
    social = new SocialDatabase(scopedPool);
  });

  afterAll(async () => {
    if (scopedPool) await scopedPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it('enforces request/friend constraints and supports direct-message history queries', async () => {
    const found = await social.searchUsers(1, 'bo%', 20);
    expect(found).toEqual([{ id: 2, username: 'bob' }]);

    const friendRequest = await social.createFriendRequest(1, 2);
    expect(friendRequest).toMatchObject({ requester_id: 1, recipient_id: 2, status: 'pending' });
    await expect(social.createFriendRequest(2, 1)).rejects.toMatchObject({ code: 'request_pending' });
    await expect(social.createFriendRequest(1, 1)).rejects.toThrow();

    const accepted = await social.acceptFriendRequest(2, friendRequest.id);
    expect(accepted.userIds).toEqual([1, 2]);
    await expect(social.createFriendRequest(1, 2)).rejects.toMatchObject({ code: 'already_friends' });
    expect(await social.listFriends(1)).toEqual([{ id: 2, username: 'bob' }]);
    expect(await social.listFriends(3)).toEqual([]);

    const conversation = await social.openConversation(1, 2);
    expect(conversation).toMatchObject({ user_id: 2, username: 'bob' });
    expect(await social.getConversationForUser(conversation.id, 1)).toMatchObject({ user_low_id: 1, user_high_id: 2 });
    expect(await social.getConversationForUser(conversation.id, 3)).toBeNull();
    await expect(social.createPrivateMessage(conversation.id, 3, 'IDOR')).rejects.toMatchObject({ code: 'conversation_not_found' });

    const first = await social.createPrivateMessage(conversation.id, 1, 'one');
    const second = await social.createPrivateMessage(conversation.id, 2, 'two');
    const third = await social.createPrivateMessage(conversation.id, 1, 'three');
    const recent = await social.listMessages(conversation.id, 2);
    expect(recent.map((message) => message.id)).toEqual([third.id, second.id]);
    const older = await social.listMessages(conversation.id, 2, second.id);
    expect(older.map((message) => message.id)).toEqual([first.id]);
  });

  it('rejects invalid participant rows at the database layer', async () => {
    await expect(scopedPool.query('INSERT INTO friendships (user_low_id, user_high_id) VALUES (1, 1)')).rejects.toMatchObject({ code: '23514' });
    await expect(scopedPool.query("INSERT INTO friend_requests (requester_id, recipient_id) VALUES (1, 1)")).rejects.toMatchObject({ code: '23514' });
  });
});
