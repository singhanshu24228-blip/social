type E2EEIdentity = {
  keyId: string;
  publicKey: string; // base64(raw)
};

export type E2EEPayloadV1 = {
  v: 1;
  alg: 'p256+hkdf-sha256+aes-256-gcm';
  nonce: string; // base64(12 bytes)
  ciphertext: string; // base64(bytes)
  senderKeyId?: string;
  receiverKeyId?: string;
};

export class E2EEPeerMissingKeyError extends Error {
  code = 'E2EE_PEER_MISSING_KEY' as const;
  peerUserId: string;

  constructor(peerUserId: string) {
    super('Peer has no E2EE key');
    this.peerUserId = peerUserId;
  }
}

export class E2EEPeerKeyChangedError extends Error {
  code = 'E2EE_PEER_KEY_CHANGED' as const;
  peerUserId: string;
  oldKeyId: string;
  newKeyId: string;

  constructor(peerUserId: string, oldKeyId: string, newKeyId: string) {
    super('E2EE key changed for this user');
    this.peerUserId = peerUserId;
    this.oldKeyId = oldKeyId;
    this.newKeyId = newKeyId;
  }
}

const STORAGE_PRIVATE_JWK = 'e2ee_identity_private_jwk';
const STORAGE_PUBLIC_B64 = 'e2ee_identity_public_raw_b64';
const STORAGE_KEY_ID = 'e2ee_identity_key_id';
const STORAGE_PEER_KEYID_PREFIX = 'e2ee_peer_keyid:';

function bytesToB64(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes: Uint8Array) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return new Uint8Array(digest);
}

function getStoredString(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

async function computeKeyIdFromRawPublicKey(rawPub: Uint8Array) {
  const digest = await sha256(rawPub);
  return bytesToB64Url(digest.subarray(0, 8));
}

async function importPrivateKeyFromStorage(): Promise<CryptoKey | null> {
  const jwkStr = getStoredString(STORAGE_PRIVATE_JWK);
  if (!jwkStr) return null;
  try {
    const jwk = JSON.parse(jwkStr);
    return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);
  } catch {
    return null;
  }
}

async function importPublicKeyRaw(rawB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(rawB64);
  return crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

async function createAndStoreIdentity(): Promise<E2EEIdentity> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);

  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const publicKey = bytesToB64(publicRaw);
  const keyId = await computeKeyIdFromRawPublicKey(publicRaw);

  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  setStoredString(STORAGE_PRIVATE_JWK, JSON.stringify(privateJwk));
  setStoredString(STORAGE_PUBLIC_B64, publicKey);
  setStoredString(STORAGE_KEY_ID, keyId);

  return { keyId, publicKey };
}

export async function getOrCreateIdentity(): Promise<E2EEIdentity> {
  const publicKey = getStoredString(STORAGE_PUBLIC_B64);
  const keyId = getStoredString(STORAGE_KEY_ID);
  if (!publicKey || !keyId) return createAndStoreIdentity();

  const priv = await importPrivateKeyFromStorage();
  if (!priv) return createAndStoreIdentity();

  // Light integrity check: recompute keyId from stored public key
  try {
    const computed = await computeKeyIdFromRawPublicKey(b64ToBytes(publicKey));
    if (computed !== keyId) return createAndStoreIdentity();
  } catch {
    return createAndStoreIdentity();
  }

  return { keyId, publicKey };
}

export async function registerMyE2EEPublicKey(api: { put: (url: string, body: any) => Promise<any> }) {
  const identity = await getOrCreateIdentity();
  const res = await api.put('/users/e2ee/key', { publicKey: identity.publicKey });
  const serverKeyId = String(res?.data?.keyId || '').trim();
  if (serverKeyId) setStoredString(STORAGE_KEY_ID, serverKeyId);
  return { ...identity, keyId: serverKeyId || identity.keyId };
}

export type PeerKey = { userId: string; keyId: string; publicKey: string };
export type GroupPeerKey = {
  userId: string;
  username?: string;
  name?: string;
  keyId: string | null;
  publicKey: string | null;
  updatedAt?: string | null;
};

export type GroupE2EERecipientV1 = {
  userId: string;
  receiverKeyId?: string;
  nonce: string;
  wrappedKey: string;
};

export type GroupE2EEPayloadV1 = {
  v: 1;
  alg: 'group-p256+hkdf-sha256+aes-256-gcm';
  nonce: string;
  ciphertext: string;
  senderKeyId?: string;
  recipients: GroupE2EERecipientV1[];
};

export class E2EEGroupMembersMissingKeysError extends Error {
  code = 'E2EE_GROUP_MEMBERS_MISSING_KEYS' as const;
  members: GroupPeerKey[];

  constructor(members: GroupPeerKey[]) {
    super('One or more group members do not have an E2EE key');
    this.members = members;
  }
}

export class E2EEGroupRecipientMissingError extends Error {
  code = 'E2EE_GROUP_RECIPIENT_MISSING' as const;
  groupId: string;
  userId: string;

  constructor(groupId: string, userId: string) {
    super('Missing encrypted group payload for this user');
    this.groupId = groupId;
    this.userId = userId;
  }
}

type PeerKeyLookupOptions = {
  allowKeyRefresh?: boolean;
};

export async function getPeerE2EEPublicKey(
  api: { get: (url: string) => Promise<any> },
  userId: string,
  options?: PeerKeyLookupOptions
): Promise<PeerKey | null> {
  const res = await api.get(`/users/e2ee/${userId}`);
  const publicKey = res?.data?.publicKey;
  const keyId = res?.data?.keyId;
  if (!publicKey || !keyId) return null;

  const storedKeyId = getStoredString(STORAGE_PEER_KEYID_PREFIX + userId);
  if (storedKeyId && storedKeyId !== keyId) {
    if (!options?.allowKeyRefresh) {
      throw new E2EEPeerKeyChangedError(String(userId), String(storedKeyId), String(keyId));
    }
  }
  if (!storedKeyId || options?.allowKeyRefresh) {
    setStoredString(STORAGE_PEER_KEYID_PREFIX + userId, String(keyId));
  }

  return { userId, publicKey: String(publicKey), keyId: String(keyId) };
}

async function deriveAesKey(myPrivate: CryptoKey, peerPublic: CryptoKey, info: string) {
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublic }, myPrivate, 256)
  );

  const hkdfBaseKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const salt = new Uint8Array(32); // all-zero salt (static-static ECDH)
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

async function importAesKeyFromRaw(raw: Uint8Array) {
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey('raw', copy.buffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function conversationInfo(aKeyId: string, bKeyId: string) {
  const [a, b] = [aKeyId, bKeyId].sort();
  return `contact-local:e2ee:v1:${a}:${b}`;
}

export async function encryptForPeer(
  api: { get: (url: string) => Promise<any> },
  peerUserId: string,
  plaintext: string
): Promise<{ e2ee: E2EEPayloadV1; identity: E2EEIdentity; peer: PeerKey }> {
  const identity = await getOrCreateIdentity();
  const peer = await getPeerE2EEPublicKey(api, peerUserId);
  if (!peer) throw new E2EEPeerMissingKeyError(String(peerUserId));

  const myPrivate = await importPrivateKeyFromStorage();
  if (!myPrivate) throw new Error('Missing local E2EE private key');

  const peerPub = await importPublicKeyRaw(peer.publicKey);
  const aesKey = await deriveAesKey(myPrivate, peerPub, conversationInfo(identity.keyId, peer.keyId));

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded));

  return {
    identity,
    peer,
    e2ee: {
      v: 1,
      alg: 'p256+hkdf-sha256+aes-256-gcm',
      nonce: bytesToB64(iv),
      ciphertext: bytesToB64(ciphertext),
      senderKeyId: identity.keyId,
      receiverKeyId: peer.keyId,
    },
  };
}

export async function decryptFromPeer(
  api: { get: (url: string) => Promise<any> },
  peerUserId: string,
  payload: E2EEPayloadV1
): Promise<string> {
  const identity = await getOrCreateIdentity();
  const peer = await getPeerE2EEPublicKey(api, peerUserId, { allowKeyRefresh: true });
  if (!peer) throw new E2EEPeerMissingKeyError(String(peerUserId));

  const myPrivate = await importPrivateKeyFromStorage();
  if (!myPrivate) throw new Error('Missing local E2EE private key');

  const peerPub = await importPublicKeyRaw(peer.publicKey);
  const aesKey = await deriveAesKey(myPrivate, peerPub, conversationInfo(identity.keyId, peer.keyId));

  const iv = b64ToBytes(payload.nonce);
  const ciphertext = b64ToBytes(payload.ciphertext);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

export async function getGroupE2EEPublicKeys(
  api: { get: (url: string) => Promise<any> },
  groupId: string
): Promise<GroupPeerKey[]> {
  const res = await api.get(`/groups/${groupId}/e2ee-keys`);
  return (res?.data?.members || []).map((member: any) => ({
    userId: String(member.userId || member._id || ''),
    username: member.username ? String(member.username) : undefined,
    name: member.name ? String(member.name) : undefined,
    publicKey: member.publicKey ? String(member.publicKey) : null,
    keyId: member.keyId ? String(member.keyId) : null,
    updatedAt: member.updatedAt ? String(member.updatedAt) : null,
  }));
}

export async function encryptForGroup(
  api: { get: (url: string) => Promise<any> },
  groupId: string,
  plaintext: string
): Promise<{ e2ee: GroupE2EEPayloadV1; identity: E2EEIdentity; members: GroupPeerKey[] }> {
  const identity = await getOrCreateIdentity();
  const members = await getGroupE2EEPublicKeys(api, groupId);
  const missing = members.filter((member) => !member.publicKey || !member.keyId);
  if (missing.length > 0) throw new E2EEGroupMembersMissingKeysError(missing);

  const myPrivate = await importPrivateKeyFromStorage();
  if (!myPrivate) throw new Error('Missing local E2EE private key');

  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const contentKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', contentKey));

  const contentIv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: contentIv }, contentKey, encoded));

  const recipients = await Promise.all(
    members.map(async (member) => {
      const peerPub = await importPublicKeyRaw(String(member.publicKey));
      const wrapKey = await deriveAesKey(myPrivate, peerPub, conversationInfo(identity.keyId, String(member.keyId)));
      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedKey = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKey, contentKeyRaw)
      );

      return {
        userId: member.userId,
        receiverKeyId: String(member.keyId),
        nonce: bytesToB64(wrapIv),
        wrappedKey: bytesToB64(wrappedKey),
      };
    })
  );

  return {
    identity,
    members,
    e2ee: {
      v: 1,
      alg: 'group-p256+hkdf-sha256+aes-256-gcm',
      nonce: bytesToB64(contentIv),
      ciphertext: bytesToB64(ciphertext),
      senderKeyId: identity.keyId,
      recipients,
    },
  };
}

export async function decryptFromGroup(
  api: { get: (url: string) => Promise<any> },
  groupId: string,
  senderUserId: string,
  selfUserId: string,
  payload: GroupE2EEPayloadV1
): Promise<string> {
  const identity = await getOrCreateIdentity();
  const myPrivate = await importPrivateKeyFromStorage();
  if (!myPrivate) throw new Error('Missing local E2EE private key');

  const recipient = (payload.recipients || []).find((entry) => String(entry.userId) === String(selfUserId));
  if (!recipient) throw new E2EEGroupRecipientMissingError(groupId, selfUserId);

  const senderPublicKey =
    String(senderUserId) === String(selfUserId)
      ? identity.publicKey
      : String((await getPeerE2EEPublicKey(api, senderUserId, { allowKeyRefresh: true }))?.publicKey || '');
  if (!senderPublicKey) throw new Error('Missing sender E2EE public key');

  const senderPub = await importPublicKeyRaw(senderPublicKey);
  const wrapKey = await deriveAesKey(
    myPrivate,
    senderPub,
    conversationInfo(String(payload.senderKeyId || identity.keyId), String(recipient.receiverKeyId || identity.keyId))
  );

  const wrappedIv = b64ToBytes(recipient.nonce);
  const wrappedKey = b64ToBytes(recipient.wrappedKey);
  const rawContentKey = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wrappedIv }, wrapKey, wrappedKey)
  );
  const contentKey = await importAesKeyFromRaw(rawContentKey);

  const iv = b64ToBytes(payload.nonce);
  const ciphertext = b64ToBytes(payload.ciphertext);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, contentKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}
// e2ee.ts

// type E2EEIdentity = {
//   keyId: string;
//   publicKey: string;
// };

// export type E2EEPayloadV1 = {
//   v: 1;
//   alg: 'p256+hkdf-sha256+aes-256-gcm';
//   nonce: string;
//   ciphertext: string;
//   senderKeyId: string;
//   receiverKeyId: string;
// };

// const encoder = new TextEncoder();
// const decoder = new TextDecoder();

// function bytesToB64(bytes: Uint8Array) {
//   return btoa(String.fromCharCode(...bytes));
// }

// function b64ToBytes(b64: string) {
//   return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
// }

// async function sha256(data: Uint8Array) {
//   const hash = await crypto.subtle.digest('SHA-256', data);
//   return new Uint8Array(hash);
// }

// async function computeKeyId(rawPub: Uint8Array) {
//   const digest = await sha256(rawPub);
//   return bytesToB64(digest.slice(0, 8));
// }

// // 🔐 Derive AES key (FIXED: dynamic salt + AAD)
// async function deriveAesKey(
//   myPrivate: CryptoKey,
//   peerPublic: CryptoKey,
//   info: string
// ) {
//   const sharedBits = new Uint8Array(
//     await crypto.subtle.deriveBits(
//       { name: 'ECDH', public: peerPublic },
//       myPrivate,
//       256
//     )
//   );

//   const baseKey = await crypto.subtle.importKey(
//     'raw',
//     sharedBits,
//     'HKDF',
//     false,
//     ['deriveKey']
//   );

//   // ✅ FIX: dynamic salt (based on conversation)
//   const salt = await sha256(encoder.encode(info));

//   return crypto.subtle.deriveKey(
//     {
//       name: 'HKDF',
//       hash: 'SHA-256',
//       salt,
//       info: encoder.encode(info),
//     },
//     baseKey,
//     { name: 'AES-GCM', length: 256 },
//     false,
//     ['encrypt', 'decrypt']
//   );
// }

// function conversationInfo(a: string, b: string) {
//   return `e2ee:v1:${[a, b].sort().join(':')}`;
// }

// // 🔐 ENCRYPT
// export async function encryptMessage(
//   plaintext: string,
//   myPrivate: CryptoKey,
//   peerPublic: CryptoKey,
//   myKeyId: string,
//   peerKeyId: string
// ): Promise<E2EEPayloadV1> {
//   const info = conversationInfo(myKeyId, peerKeyId);
//   const aesKey = await deriveAesKey(myPrivate, peerPublic, info);

//   const iv = crypto.getRandomValues(new Uint8Array(12));

//   // ✅ FIX: Add AAD (bind metadata)
//   const aad = encoder.encode(`${myKeyId}:${peerKeyId}`);

//   const encrypted = await crypto.subtle.encrypt(
//     {
//       name: 'AES-GCM',
//       iv,
//       additionalData: aad,
//     },
//     aesKey,
//     encoder.encode(plaintext)
//   );

//   return {
//     v: 1,
//     alg: 'p256+hkdf-sha256+aes-256-gcm',
//     nonce: bytesToB64(iv),
//     ciphertext: bytesToB64(new Uint8Array(encrypted)),
//     senderKeyId: myKeyId,
//     receiverKeyId: peerKeyId,
//   };
// }

// // 🔓 DECRYPT
// export async function decryptMessage(
//   payload: E2EEPayloadV1,
//   myPrivate: CryptoKey,
//   peerPublic: CryptoKey
// ): Promise<string> {
//   if (payload.v !== 1) throw new Error('Unsupported version');

//   const info = conversationInfo(payload.senderKeyId, payload.receiverKeyId);
//   const aesKey = await deriveAesKey(myPrivate, peerPublic, info);

//   const iv = b64ToBytes(payload.nonce);
//   const ciphertext = b64ToBytes(payload.ciphertext);

//   const aad = encoder.encode(`${payload.senderKeyId}:${payload.receiverKeyId}`);

//   const decrypted = await crypto.subtle.decrypt(
//     {
//       name: 'AES-GCM',
//       iv,
//       additionalData: aad,
//     },
//     aesKey,
//     ciphertext
//   );

//   return decoder.decode(decrypted);
// }
