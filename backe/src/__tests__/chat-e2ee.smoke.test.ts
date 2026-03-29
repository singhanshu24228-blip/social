import http from 'http';
import { cookieHeader, extractSetCookies, listen, parseCookies } from './helpers/http.js';

jest.setTimeout(20000);

async function resetStores() {
  const { default: User } = await import('../models/User.js');
  const { default: RefreshToken } = await import('../models/RefreshToken.js');
  const { default: Group } = await import('../models/Group.js');
  const { default: PrivateMessage } = await import('../models/PrivateMessage.js');
  const { default: GroupMessage } = await import('../models/GroupMessage.js');
  const { default: Notification } = await import('../models/Notification.js');

  User.__resetForTests?.();
  RefreshToken.__resetForTests?.();
  Group.__resetForTests?.();
  PrivateMessage.__resetForTests?.();
  GroupMessage.__resetForTests?.();
  Notification.__resetForTests?.();
}

async function startAppServer() {
  const { createApp } = await import('../index.js');
  const { initSocket } = await import('../socket/index.js');
  const { app } = createApp();
  const server = http.createServer(app);
  initSocket(server);
  const handle = await listen(server);
  return { handle, close: handle.close };
}

async function signup(baseUrl: string, user: { username: string; name: string; email: string; password: string }) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...user,
      location: { type: 'Point', coordinates: [0, 0] },
    }),
  });
  expect(res.status).toBe(201);
  const jar = parseCookies(extractSetCookies(res));
  const { default: User } = await import('../models/User.js');
  const created = await User.findOne({ email: user.email });
  expect(created).toBeTruthy();
  return { jar, user: created };
}

function authHeaders(jar: Record<string, string>) {
  return {
    'content-type': 'application/json',
    'x-csrf-token': jar.csrf_token,
    cookie: cookieHeader(jar),
  };
}

async function registerKey(baseUrl: string, jar: Record<string, string>, fillByte: number) {
  const publicKey = Buffer.alloc(32, fillByte).toString('base64');
  const res = await fetch(`${baseUrl}/api/users/e2ee/key`, {
    method: 'PUT',
    headers: authHeaders(jar),
    body: JSON.stringify({ publicKey }),
  });
  expect(res.status).toBe(200);
}

function once<T = any>(socket: any, event: string, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };

    socket.once(event, onEvent);
  });
}

describe('chat e2ee smoke', () => {
  beforeEach(async () => {
    await resetStores();
  });

  test('private encrypted text is stored without plaintext and plaintext is rejected', async () => {
    const appServer = await startAppServer();

    try {
      const alice = await signup(appServer.handle.baseUrl, {
        username: 'alicechat',
        name: 'Alice Chat',
        email: 'alice-chat@example.com',
        password: 'pw',
      });
      const bob = await signup(appServer.handle.baseUrl, {
        username: 'bobchat',
        name: 'Bob Chat',
        email: 'bob-chat@example.com',
        password: 'pw',
      });

      await registerKey(appServer.handle.baseUrl, alice.jar, 1);
      await registerKey(appServer.handle.baseUrl, bob.jar, 2);

      const encryptedRes = await fetch(`${appServer.handle.baseUrl}/api/chats/private/send`, {
        method: 'POST',
        headers: authHeaders(alice.jar),
        body: JSON.stringify({
          toUserId: String(bob.user!._id),
          message: '',
          e2ee: {
            v: 1,
            alg: 'p256+hkdf-sha256+aes-256-gcm',
            nonce: Buffer.from('nonce-private').toString('base64'),
            ciphertext: Buffer.from('cipher-private').toString('base64'),
            senderKeyId: 'sender-key',
            receiverKeyId: 'receiver-key',
          },
        }),
      });

      expect(encryptedRes.status).toBe(200);

      const { default: PrivateMessage } = await import('../models/PrivateMessage.js');
      const storedEncrypted = PrivateMessage.__allForTests();
      expect(storedEncrypted).toHaveLength(1);
      expect(storedEncrypted[0].message).toBeUndefined();
      expect(storedEncrypted[0].e2ee?.ciphertext).toBeTruthy();

      const plaintextRes = await fetch(`${appServer.handle.baseUrl}/api/chats/private/send`, {
        method: 'POST',
        headers: authHeaders(alice.jar),
        body: JSON.stringify({
          toUserId: String(bob.user!._id),
          message: 'hello in plaintext',
        }),
      });

      expect(plaintextRes.status).toBe(400);
      await expect(plaintextRes.json()).resolves.toMatchObject({
        message: expect.stringContaining('Plaintext private messages are disabled'),
      });
      expect(PrivateMessage.__allForTests()).toHaveLength(1);
    } finally {
      await appServer.close();
    }
  });

  test('group encrypted text is stored without plaintext and plaintext is rejected', async () => {
    const appServer = await startAppServer();

    try {
      const alice = await signup(appServer.handle.baseUrl, {
        username: 'alicegroup',
        name: 'Alice Group',
        email: 'alice-group@example.com',
        password: 'pw',
      });
      const bob = await signup(appServer.handle.baseUrl, {
        username: 'bobgroup',
        name: 'Bob Group',
        email: 'bob-group@example.com',
        password: 'pw',
      });

      await registerKey(appServer.handle.baseUrl, alice.jar, 3);
      await registerKey(appServer.handle.baseUrl, bob.jar, 4);

      const { default: Group } = await import('../models/Group.js');
      const group = new Group({
        groupName: 'Encrypted Group',
        groupType: 'PUBLIC',
        createdBy: String(alice.user!._id),
        members: [String(alice.user!._id), String(bob.user!._id)],
      });
      await group.save();

      const { io: ioClient } = await import('../../../frontend/node_modules/socket.io-client/build/cjs/index.js');
      const socket = ioClient(appServer.handle.baseUrl, {
        transports: ['websocket'],
        extraHeaders: {
          cookie: `access_token=${alice.jar.access_token}`,
        },
      });

      try {
        await once(socket, 'connect');

        const plaintextErrorPromise = once<any>(socket, 'group:message:error');
        socket.emit('group:message', {
          groupId: String(group._id),
          message: 'plaintext-group-message',
        });

        const plaintextError = await plaintextErrorPromise;
        expect(String(plaintextError?.message || '')).toMatch(/Plaintext group messages are disabled/);

        const { default: GroupMessage } = await import('../models/GroupMessage.js');
        expect(GroupMessage.__allForTests()).toHaveLength(0);

        const sentPromise = once<any>(socket, 'group:message:sent');
        socket.emit('group:message', {
          groupId: String(group._id),
          message: '',
          localId: 'local-group-1',
          e2ee: {
            v: 1,
            alg: 'group-p256+hkdf-sha256+aes-256-gcm',
            nonce: Buffer.from('group-nonce').toString('base64'),
            ciphertext: Buffer.from('group-cipher').toString('base64'),
            senderKeyId: 'group-sender-key',
            recipients: [
              {
                userId: String(alice.user!._id),
                receiverKeyId: 'alice-key',
                nonce: Buffer.from('alice-wrap').toString('base64'),
                wrappedKey: Buffer.from('alice-wrapped-key').toString('base64'),
              },
              {
                userId: String(bob.user!._id),
                receiverKeyId: 'bob-key',
                nonce: Buffer.from('bob-wrap').toString('base64'),
                wrappedKey: Buffer.from('bob-wrapped-key').toString('base64'),
              },
            ],
          },
        });

        const sent = await sentPromise;
        expect(String(sent?.localId || '')).toBe('local-group-1');

        const storedEncrypted = GroupMessage.__allForTests();
        expect(storedEncrypted).toHaveLength(1);
        expect(storedEncrypted[0].message).toBeUndefined();
        expect(storedEncrypted[0].e2ee?.ciphertext).toBeTruthy();
        expect(storedEncrypted[0].e2ee?.recipients).toHaveLength(2);

        const groupMessagesRes = await fetch(`${appServer.handle.baseUrl}/api/groups/${group._id}/messages`, {
          headers: {
            cookie: cookieHeader(alice.jar),
          },
        });
        expect(groupMessagesRes.status).toBe(200);
        const groupMessagesJson = await groupMessagesRes.json();
        expect(groupMessagesJson.messages).toHaveLength(1);
        expect(groupMessagesJson.messages[0].message).toBeUndefined();
        expect(groupMessagesJson.messages[0].e2ee?.ciphertext).toBeTruthy();
      } finally {
        socket.close();
      }
    } finally {
      await appServer.close();
    }
  });
});
