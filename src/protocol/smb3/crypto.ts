import crypto from "crypto";

/**
 * AES-CMAC implementation per RFC 4493
 *
 * @param key - 16-byte key
 * @param data - Data to authenticate
 * @returns 16-byte MAC
 */
function aesCmac(key: Buffer, data: Buffer): Buffer {
  const blockSize = 16;

  // Generate subkeys K1 and K2
  const L = Buffer.alloc(blockSize);
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  cipher.update(L).copy(L);
  cipher.final();

  const K1 = leftShift(L);
  const K2 = leftShift(K1);

  // Determine if padding is needed
  const n = data.length === 0 ? 1 : Math.ceil(data.length / blockSize);
  const lastBlockComplete = (data.length !== 0) && (data.length % blockSize === 0);

  let M_last: Buffer;
  if (lastBlockComplete) {
    M_last = xor(data.slice((n - 1) * blockSize), K1);
  } else {
    const padding = Buffer.alloc(blockSize);
    const remainder = data.slice((n - 1) * blockSize);
    remainder.copy(padding);
    padding[remainder.length] = 0x80;
    M_last = xor(padding, K2);
  }

  // Process blocks
  const X = Buffer.alloc(blockSize);
  const blockCipher = crypto.createCipheriv('aes-128-ecb', key, null);
  blockCipher.setAutoPadding(false);

  for (let i = 0; i < n - 1; i++) {
    const block = data.slice(i * blockSize, (i + 1) * blockSize);
    xor(X, block).copy(X);
    blockCipher.update(X).copy(X);
  }

  xor(X, M_last).copy(X);
  blockCipher.update(X).copy(X);
  blockCipher.final();

  return X;
}

function leftShift(buffer: Buffer): Buffer {
  const shifted = Buffer.alloc(buffer.length);
  let overflow = 0;

  for (let i = buffer.length - 1; i >= 0; i--) {
    shifted[i] = (buffer[i] << 1) | overflow;
    overflow = (buffer[i] & 0x80) ? 1 : 0;
  }

  // Apply Rb constant if MSB was 1
  if (buffer[0] & 0x80) {
    shifted[shifted.length - 1] ^= 0x87;
  }

  return shifted;
}

function xor(a: Buffer, b: Buffer): Buffer {
  const result = Buffer.alloc(Math.max(a.length, b.length));
  for (let i = 0; i < result.length; i++) {
    result[i] = (a[i] || 0) ^ (b[i] || 0);
  }
  return result;
}

/**
 * SMB3KDF - Key Derivation Function for SMB 3.x
 * Implements NIST SP800-108 Counter Mode with HMAC-SHA256
 *
 * @param ki - Key Derivation Key (KDK), typically the session key
 * @param label - ASCII string label for the key purpose
 * @param context - ASCII string context for the key
 * @param l - Length of derived key in bits (128 for AES-128)
 * @returns Derived key buffer
 */
export function smb3KDF(ki: Buffer, label: string, context: string, l: number = 128): Buffer {
  // Per MS-SMB2 section 3.1.4.2
  // KDF in Counter Mode: PRF (Ki, [i]2 || Label || 0x00 || Context || [L]2)
  // where PRF is HMAC-SHA256

  // Label and Context already include null terminators as actual bytes
  const labelBuf = Buffer.from(label, 'binary');
  const contextBuf = Buffer.from(context, 'binary');

  // Counter (i) - 4 bytes, big-endian, starts at 1
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(1, 0);

  // Zero byte separator
  const zero = Buffer.from([0x00]);

  // Length in bits - 4 bytes, big-endian
  const length = Buffer.alloc(4);
  length.writeUInt32BE(l, 0);

  // Concatenate: [i]2 || Label || 0x00 || Context || [L]2
  const input = Buffer.concat([counter, labelBuf, zero, contextBuf, length]);

  // HMAC-SHA256
  const hmac = crypto.createHmac('sha256', ki);
  hmac.update(input);
  const output = hmac.digest();

  // Return only the requested number of bytes (l / 8)
  return output.slice(0, l / 8);
}

/**
 * Derive session key from NTLMv2 response
 * Per MS-NLMP section 3.4.5.2
 *
 * @param ntlmv2Hash - The NTLMv2 hash (NTOWFv2)
 * @param ntProofStr - The NTProofStr (first 16 bytes of NTLMv2 response)
 * @returns Session key buffer (16 bytes)
 */
export function deriveSessionKey(ntlmv2Hash: Buffer, ntProofStr: Buffer): Buffer {
  // KeyExchangeKey = HMAC_MD5(NTLMv2Hash, NTProofStr)
  const hmac = crypto.createHmac('md5', ntlmv2Hash);
  hmac.update(ntProofStr);
  return hmac.digest();
}

/**
 * Calculate AES-128-CMAC signature for Transform header
 * Per MS-SMB2 section 3.1.4.1
 *
 * @param signingKey - Signing key (16 bytes)
 * @param data - Data to sign (Transform header + encrypted message)
 * @returns Signature (16 bytes)
 */
export function calculateSignature(signingKey: Buffer, data: Buffer): Buffer {
  // AES-128-CMAC per MS-SMB2 spec (RFC 4493)
  return aesCmac(signingKey, data);
}

/**
 * Derive SMB3 signing key from session key (for signature calculation)
 *
 * @param sessionKey - The session key
 * @param direction - "ServerIn" or "ServerOut"
 * @returns Signing key (16 bytes)
 */
export function deriveSigningKey(sessionKey: Buffer, direction: 'ServerIn' | 'ServerOut'): Buffer {
  // Per MS-SMB2: Label = "SMB2AESCMAC" + 0x00, Context = "ServerIn " or "ServerOut " (with space) + 0x00
  const label = 'SMB2AESCMAC' + String.fromCharCode(0);
  const context = direction + ' ' + String.fromCharCode(0); // Note the space before null!
  return smb3KDF(sessionKey, label, context, 128);
}

/**
 * Derive SMB3 encryption key from session key
 *
 * @param sessionKey - The session key
 * @param direction - "ServerIn" or "ServerOut"
 * @returns Encryption key (16 bytes)
 */
export function deriveEncryptionKey(sessionKey: Buffer, direction: 'ServerIn' | 'ServerOut'): Buffer {
  // Per MS-SMB2: Label = "SMB2AESCCM" + 0x00, Context = "ServerIn " or "ServerOut " (with space) + 0x00
  const label = 'SMB2AESCCM' + String.fromCharCode(0);
  const context = direction + ' ' + String.fromCharCode(0); // Note the space before null!
  return smb3KDF(sessionKey, label, context, 128);
}

/**
 * Derive SMB3 decryption key from session key
 *
 * @param sessionKey - The session key
 * @param direction - "ServerIn" or "ServerOut"
 * @returns Decryption key (16 bytes)
 */
export function deriveDecryptionKey(sessionKey: Buffer, direction: 'ServerIn' | 'ServerOut'): Buffer {
  // Decryption key is the opposite direction's encryption key
  const opposite = direction === 'ServerIn' ? 'ServerOut' : 'ServerIn';
  return deriveEncryptionKey(sessionKey, opposite);
}

/**
 * Encrypt SMB3 message using AES-128-CCM
 *
 * @param key - Encryption key (16 bytes)
 * @param nonce - Nonce (11 bytes for CCM)
 * @param plaintext - Message to encrypt
 * @param aad - Additional Authenticated Data (32 bytes from transform header)
 * @returns Encrypted ciphertext with authentication tag
 */
export function encryptAES128CCM(
  key: Buffer,
  nonce: Buffer,
  plaintext: Buffer,
  aad: Buffer
): Buffer {
  // AES-128-CCM with 16-byte authentication tag
  // Tag length = 16 bytes per MS-SMB2 spec
  const cipher = crypto.createCipheriv('aes-128-ccm', key, nonce, {
    authTagLength: 16
  });

  cipher.setAAD(aad, {
    plaintextLength: plaintext.length
  });

  const encrypted = cipher.update(plaintext);
  cipher.final(); // Finalize encryption
  const tag = cipher.getAuthTag();

  // Return encrypted data + auth tag
  return Buffer.concat([encrypted, tag]);
}

/**
 * Decrypt SMB3 message using AES-128-CCM
 *
 * @param key - Decryption key (16 bytes)
 * @param nonce - Nonce (11 bytes for CCM)
 * @param ciphertext - Encrypted message with auth tag
 * @param aad - Additional Authenticated Data (32 bytes from transform header)
 * @returns Decrypted plaintext
 */
export function decryptAES128CCM(
  key: Buffer,
  nonce: Buffer,
  ciphertext: Buffer,
  aad: Buffer
): Buffer {
  // Split ciphertext and auth tag (last 16 bytes)
  const encrypted = ciphertext.slice(0, -16);
  const tag = ciphertext.slice(-16);

  const decipher = crypto.createDecipheriv('aes-128-ccm', key, nonce, {
    authTagLength: 16
  });

  decipher.setAuthTag(tag);
  decipher.setAAD(aad, {
    plaintextLength: encrypted.length
  });

  const decrypted = decipher.update(encrypted);
  decipher.final(); // Verify authentication tag

  return decrypted;
}
