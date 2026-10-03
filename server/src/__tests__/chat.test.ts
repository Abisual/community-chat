import { AddressInfo } from 'net';
import request from 'supertest';
import WebSocket from 'ws';
import { AuthService } from '../auth/auth.service';
import { createHttpServer } from '../index';
import { pool, resetChatData, seedChatUser } from './helpers/chatPool';

jest.mock('../database/connection', () => require('./helpers/chatPool'));

interface ChatEvent {
  type: string;
  [key: string]: any;
}

interface TestChatClient {
  socket: WebSocket;
  events: ChatEvent[];
  waitFor: (type: string, fromIndex?: number) => Promise<ChatEvent>;
}

let server: ReturnType<typeof createHttpServer>;
let baseUrl: string;
const sockets: WebSocket[] = [];

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function createClient(): TestChatClient {
  const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws/chat');
  sockets.push(socket);
  const events: ChatEvent[] = [];
  const waiters: Array<{ type: string; fromIndex: number; resolve: (event: ChatEvent) => void; reject: (error: Error) => void }> = [];
  socket.on('message', (data) => {
    const event = JSON.parse(data.toString()) as ChatEvent;
    events.push(event);
    const index = events.length - 1;
    for (let waiterIndex = waiters.length - 1; waiterIndex >= 0; waiterIndex--) {
      const waiter = waiters[waiterIndex];
      if (waiter.type === event.type && index >= waiter.fromIndex) {
        waiters.splice(waiterIndex, 1);
        waiter.resolve(event);
      }
    }
  });

  const waitFor = (type: string, fromIndex = 0) => {
    const existingIndex = events.findIndex((event, index) => index >= fromIndex && event.type === type);
    if (existingIndex >= 0) return Promise.resolve(events[existingIndex]);
    return new Promise<ChatEvent>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 3000);
      timeout.unref();
      waiters.push({
        type,
        fromIndex,
        resolve: (event) => { clearTimeout(timeout); resolve(event); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });
    });
  };

  return { socket, events, waitFor };
}

async function connectAs(username: string, userId: number): Promise<TestChatClient> {
  const client = createClient();
  const authenticated = client.waitFor('authenticated');
  await waitForOpen(client.socket);
  client.socket.send(JSON.stringify({
    type: 'authenticate',
    accessToken: AuthService.generateAccessToken(userId, username)
  }));
  await authenticated;
  return client;
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  });
}

describe('Global chat and presence', () => {
  beforeAll(async () => {
    server = createHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(() => {
    resetChatData();
    seedChatUser(1, 'alice');
    seedChatUser(2, 'bob');
  });

  afterEach(async () => {
    await Promise.all(sockets.splice(0).map(closeSocket));
    await pool.query('DELETE FROM chat_messages');
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('requires access-token authentication before accepting chat events', async () => {
    const client = createClient();
    const closed = new Promise<number>((resolve) => client.socket.once('close', (code) => resolve(code)));
    await waitForOpen(client.socket);
    client.socket.send(JSON.stringify({ type: 'authenticate', accessToken: 'invalid-token' }));
    await expect(closed).resolves.toBe(4401);
  });

  it('serves authenticated, bounded persistent chat history over REST', async () => {
    const alice = await connectAs('alice', 1);
    await alice.waitFor('chat.history');
    alice.socket.send(JSON.stringify({ type: 'chat.send', content: 'first message' }));
    await alice.waitFor('chat.message');
    const secondMessage = alice.waitFor('chat.message', alice.events.length);
    alice.socket.send(JSON.stringify({ type: 'chat.send', content: 'second message' }));
    await secondMessage;

    const response = await request(baseUrl)
      .get('/chat/history?limit=1')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(1, 'alice')}`)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({ username: 'alice', content: 'second message' });
  });

  it('persists and broadcasts messages, and tracks first/last connections as presence', async () => {
    const alice = await connectAs('alice', 1);
    await alice.waitFor('presence.snapshot');
    const bobOnline = alice.waitFor('presence.changed');
    const bob = await connectAs('bob', 2);
    await bob.waitFor('chat.history');
    await expect(bobOnline).resolves.toMatchObject({
      user: { id: 2, username: 'bob', status: 'online' }
    });

    const aliceMessage = alice.waitFor('chat.message');
    const bobMessage = bob.waitFor('chat.message');
    bob.socket.send(JSON.stringify({ type: 'chat.send', content: ' hello community ' }));
    const [toAlice, toBob] = await Promise.all([aliceMessage, bobMessage]);
    expect(toAlice.message).toMatchObject({ username: 'bob', content: 'hello community' });
    expect(toBob.message).toMatchObject({ id: toAlice.message.id, content: 'hello community' });

    const offline = alice.waitFor('presence.changed', alice.events.length);
    await closeSocket(bob.socket);
    await expect(offline).resolves.toMatchObject({
      user: { id: 2, username: 'bob', status: 'offline' }
    });
  });

  it('does not mark a user offline while another authenticated connection remains', async () => {
    const alice = await connectAs('alice', 1);
    await alice.waitFor('presence.snapshot');
    const bob = await connectAs('bob', 2);
    await bob.waitFor('presence.snapshot');
    const bobSecondConnection = await connectAs('bob', 2);
    await bobSecondConnection.waitFor('presence.snapshot');

    const startAt = alice.events.length;
    await closeSocket(bob.socket);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(alice.events.slice(startAt).some((event) =>
      event.type === 'presence.changed' && event.user?.id === 2 && event.user?.status === 'offline'
    )).toBe(false);
  });

  it('rejects blank and oversized messages without broadcasting them', async () => {
    const alice = await connectAs('alice', 1);
    await alice.waitFor('chat.history');

    const firstError = alice.waitFor('error');
    alice.socket.send(JSON.stringify({ type: 'chat.send', content: '   ' }));
    await expect(firstError).resolves.toMatchObject({ code: 'invalid_content' });

    const secondError = alice.waitFor('error', alice.events.length);
    alice.socket.send(JSON.stringify({ type: 'chat.send', content: 'x'.repeat(2001) }));
    await expect(secondError).resolves.toMatchObject({ code: 'invalid_content' });
  });
});
