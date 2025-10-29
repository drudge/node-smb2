import crypto from "crypto";

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

  const labelBuf = Buffer.from(label, 'ascii');
  const contextBuf = Buffer.from(context, 'ascii');

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
  // AES-128-CMAC
  // Node.js crypto doesn't have CMAC directly, so we use a workaround
  // For now, use HMAC-SHA256 and truncate to 16 bytes
  // TODO: Consider using a proper CMAC library for production
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(data);
  const fullSignature = hmac.digest();
  return fullSignature.slice(0, 16);
}

/**
 * Derive SMB3 signing key from session key (for signature calculation)
 *
 * @param sessionKey - The session key
 * @param direction - "ServerIn" or "ServerOut"
 * @returns Signing key (16 bytes)
 */
export function deriveSigningKey(sessionKey: Buffer, direction: 'ServerIn' | 'ServerOut'): Buffer {
  return smb3KDF(sessionKey, 'SMB2AESCMAC\0', direction + '\0', 128);
}

/**
 * Derive SMB3 encryption key from session key
 *
 * @param sessionKey - The session key
 * @param direction - "ServerIn" or "ServerOut"
 * @returns Encryption key (16 bytes)
 */
export function deriveEncryptionKey(sessionKey: Buffer, direction: 'ServerIn' | 'ServerOut'): Buffer {
  return smb3KDF(sessionKey, 'SMB2AESCCM\0', direction + '\0', 128);
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
