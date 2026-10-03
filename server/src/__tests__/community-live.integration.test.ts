import { AddressInfo } from 'net';
import request from 'supertest';
import WebSocket from 'ws';
import { createHttpServer } from '../index';
import { pool } from '../database/connection';
import { runMigrations } from '../database/migrate';

const databaseUrl = process.env.DATABASE_URL;
const liveIntegration = databaseUrl ? describe : describe.skip;

interface Event { type: string; [key: string]: any; }
interface Client { socket: WebSocket; events: Event[]; waitFor: (type: string, from?: number) => Promise<Event>; }

liveIntegration('local PostgreSQL API and WebSocket smoke flow', () => {
  let server: ReturnType<typeof createHttpServer>;
  let baseUrl: string;
  const sockets: WebSocket[] = [];
  const suffix = Date.now().toString(36);
  const users = [
    { username: `smoke_${suffix}_alice`, password: 'smoke-password-123' },
    { username: `smoke_${suffix}_bob`, password: 'smoke-password-123' },
    { username: `smoke_${suffix}_carol`, password: 'smoke-password-123' }
  ];
  let userIds: number[] = [];

  function createClient(): Client {
    const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws/chat');
    sockets.push(socket);
    const events: Event[] = [];
    const waiters: Array<{ type: string; from: number; resolve: (event: Event) => void }> = [];
    socket.on('message', (data) => {
      const event = JSON.parse(data.toString()) as Event;
      const index = events.push(event) - 1;
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].type === event.type && index >= waiters[i].from) {
          const [waiter] = waiters.splice(i, 1);
          waiter.resolve(event);
        }
      }
    });
    return {
      socket,
      events,
      waitFor: (type, from = 0) => {
        const index = events.findIndex((event, i) => i >= from && event.type === type);
        if (index >= 0) return Promise.resolve(events[index]);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 3000);
          timer.unref();
          waiters.push({ type, from, resolve: (event) => { clearTimeout(timer); resolve(event); } });
        });
      }
    };
  }

  async function waitOpen(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  }

  async function closeAllSockets(): Promise<void> {
    await Promise.all(sockets.splice(0).map((socket) => socket.readyState === WebSocket.CLOSED
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      })));
  }

  function auth(accessToken: string) { return { Authorization: `Bearer ${accessToken}` }; }

  beforeAll(async () => {
    if (!databaseUrl) return;
    const parsed = new URL(databaseUrl);
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
      throw new Error('DATABASE_URL for live smoke tests must point to loopback PostgreSQL');
    }
    await runMigrations();
    server = createHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeAllSockets();
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::integer[])', [userIds]);
    await pool.end();
  });

  it('registers/logs in users and exercises chat, presence, voice, friends, privacy, and logout', async () => {
    const authResults = [] as Array<{ user: { id: number; username: string }; accessToken: string; refreshToken: string }>;
    for (const user of users) {
      const registered = await request(baseUrl).post('/auth/register').send(user).expect(201);
      expect(registered.body.user).not.toHaveProperty('password_hash');
      expect(registered.body.user).not.toHaveProperty('refresh_token_hash');
      const loggedIn = await request(baseUrl).post('/auth/login').send(user).expect(200);
      authResults.push(loggedIn.body);
    }
    userIds = authResults.map((result) => result.user.id);
    const [alice, bob, carol] = authResults;
    await request(baseUrl).get('/friends').expect(401);

    const rooms = await request(baseUrl).get('/voice/rooms').set(auth(alice.accessToken)).expect(200);
    expect(rooms.body.rooms.length).toBeGreaterThan(0);
    const voiceToken = await request(baseUrl).post(`/voice/rooms/${rooms.body.rooms[0].id}/token`).set(auth(alice.accessToken)).expect(200);
    expect(voiceToken.body).toMatchObject({ url: process.env.LIVEKIT_URL || 'ws://localhost:7880', token: expect.any(String) });

    const aliceSocket = createClient();
    await waitOpen(aliceSocket.socket);
    const aliceReady = aliceSocket.waitFor('authenticated');
    const aliceSnapshot = aliceSocket.waitFor('presence.snapshot');
    aliceSocket.socket.send(JSON.stringify({ type: 'authenticate', accessToken: alice.accessToken }));
    await Promise.all([aliceReady, aliceSnapshot]);

    const bobSocket = createClient();
    await waitOpen(bobSocket.socket);
    const bobOnline = aliceSocket.waitFor('presence.changed', aliceSocket.events.length);
    const bobReady = bobSocket.waitFor('authenticated');
    bobSocket.socket.send(JSON.stringify({ type: 'authenticate', accessToken: bob.accessToken }));
    await Promise.all([bobReady, bobOnline]);

    const carolSocket = createClient();
    await waitOpen(carolSocket.socket);
    const carolReady = carolSocket.waitFor('authenticated');
    carolSocket.socket.send(JSON.stringify({ type: 'authenticate', accessToken: carol.accessToken }));
    await carolReady;
    const globalToBob = bobSocket.waitFor('chat.message');
    aliceSocket.socket.send(JSON.stringify({ type: 'chat.send', content: 'local global smoke' }));
    await expect(globalToBob).resolves.toMatchObject({ message: { content: 'local global smoke', username: users[0].username } });

    const search = await request(baseUrl).get(`/users/search?q=${encodeURIComponent(`smoke_${suffix}_bo`)}`).set(auth(alice.accessToken)).expect(200);
    expect(search.body.users.map((user: { id: number }) => user.id)).toEqual([bob.user.id]);
    const sent = await request(baseUrl).post('/friends/requests').set(auth(alice.accessToken)).send({ userId: bob.user.id }).expect(201);
    await request(baseUrl).post('/friends/requests').set(auth(alice.accessToken)).send({ userId: bob.user.id }).expect(409);
    expect((await request(baseUrl).get('/friends/requests').set(auth(bob.accessToken)).expect(200)).body.incoming).toHaveLength(1);
    await request(baseUrl).post(`/friends/requests/${sent.body.request.id}/accept`).set(auth(bob.accessToken)).expect(200);
    expect((await request(baseUrl).get('/friends').set(auth(alice.accessToken)).expect(200)).body.friends[0]).toMatchObject({ id: bob.user.id, username: users[1].username, status: 'online' });

    const rejected = await request(baseUrl).post('/friends/requests').set(auth(alice.accessToken)).send({ userId: carol.user.id }).expect(201);
    await request(baseUrl).post(`/friends/requests/${rejected.body.request.id}/reject`).set(auth(carol.accessToken)).expect(200);

    const aliceBob = await request(baseUrl).post('/conversations').set(auth(alice.accessToken)).send({ userId: bob.user.id }).expect(200);
    const bobCarol = await request(baseUrl).post('/conversations').set(auth(bob.accessToken)).send({ userId: carol.user.id }).expect(200);
    await request(baseUrl).get(`/conversations/${bobCarol.body.conversation.id}/messages`).set(auth(alice.accessToken)).expect(404);
    const privateFromAlice = bobSocket.waitFor('private.message');
    await request(baseUrl).post(`/conversations/${aliceBob.body.conversation.id}/messages`).set(auth(alice.accessToken)).send({ content: 'local private smoke' }).expect(201);
    await expect(privateFromAlice).resolves.toMatchObject({ message: { sender_id: alice.user.id, content: 'local private smoke' } });
    expect(carolSocket.events.some((event) => event.type === 'private.message')).toBe(false);
    const history = await request(baseUrl).get(`/conversations/${aliceBob.body.conversation.id}/messages?limit=1`).set(auth(bob.accessToken)).expect(200);
    expect(history.body.messages).toHaveLength(1);
    expect(history.body.messages[0].content).toBe('local private smoke');

    const refreshed = await request(baseUrl).post('/auth/refresh').send({ refreshToken: alice.refreshToken }).expect(200);
    await request(baseUrl).post('/auth/logout').send({ refreshToken: refreshed.body.refreshToken }).expect(200);
    await request(baseUrl).post('/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }).expect(401);
  });
});
