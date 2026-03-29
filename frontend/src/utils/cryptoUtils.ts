
export function generateConversationKey(userId1: string, userId2: string): string {
  const [id1, id2] = [userId1, userId2].sort();
  
  const combined = id1 + id2 + 'secret_salt'; // Add a salt
  return btoa(combined).slice(0, 32); // Base64 encode and take first 32 chars for AES-256
}

// Encrypt a message using AES
export async function encryptMessage(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// Decrypt a message using AES
export async function decryptMessage(encryptedMessage: string, key: string): Promise<string> {
  const decoder = new TextDecoder();
  const combined = new Uint8Array(atob(encryptedMessage).split('').map(c => c.charCodeAt(0)));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );

  return decoder.decode(decrypted);
}
// simple-encryption.ts

// const encoder = new TextEncoder();
// const decoder = new TextDecoder();

// // 🔐 Proper key derivation using PBKDF2
// async function deriveKey(password: string, salt: Uint8Array) {
//   const keyMaterial = await crypto.subtle.importKey(
//     'raw',
//     encoder.encode(password),
//     'PBKDF2',
//     false,
//     ['deriveKey']
//   );

//   return crypto.subtle.deriveKey(
//     {
//       name: 'PBKDF2',
//       salt,
//       iterations: 100000,
//       hash: 'SHA-256',
//     },
//     keyMaterial,
//     { name: 'AES-GCM', length: 256 },
//     false,
//     ['encrypt', 'decrypt']
//   );
// }

// // 🔐 Generate conversation key (FIXED)
// export async function generateConversationKey(
//   userId1: string,
//   userId2: string
// ) {
//   const [a, b] = [userId1, userId2].sort();
//   return `${a}:${b}:secure-chat`;
// }

// // 🔐 ENCRYPT
// export async function encryptMessage(
//   message: string,
//   conversationKey: string
// ): Promise<string> {
//   const salt = crypto.getRandomValues(new Uint8Array(16));
//   const key = await deriveKey(conversationKey, salt);

//   const iv = crypto.getRandomValues(new Uint8Array(12));

//   const encrypted = await crypto.subtle.encrypt(
//     { name: 'AES-GCM', iv },
//     key,
//     encoder.encode(message)
//   );

//   // Combine salt + iv + ciphertext
//   const combined = new Uint8Array(
//     salt.length + iv.length + encrypted.byteLength
//   );

//   combined.set(salt, 0);
//   combined.set(iv, salt.length);
//   combined.set(new Uint8Array(encrypted), salt.length + iv.length);

//   return btoa(String.fromCharCode(...combined));
// }

// // 🔓 DECRYPT
// export async function decryptMessage(
//   encryptedMessage: string,
//   conversationKey: string
// ): Promise<string> {
//   const data = new Uint8Array(
//     atob(encryptedMessage).split('').map(c => c.charCodeAt(0))
//   );

//   const salt = data.slice(0, 16);
//   const iv = data.slice(16, 28);
//   const ciphertext = data.slice(28);

//   const key = await deriveKey(conversationKey, salt);

//   const decrypted = await crypto.subtle.decrypt(
//     { name: 'AES-GCM', iv },
//     key,
//     ciphertext
//   );

//   return decoder.decode(decrypted);
// }