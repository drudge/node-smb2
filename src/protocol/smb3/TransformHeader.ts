/**
 * SMB2 TRANSFORM_HEADER
 * Used for encrypted messages in SMB 3.0+
 * Total size: 52 bytes
 *
 * Per MS-SMB2 section 2.2.41
 */
export interface TransformHeader {
  protocolId: Buffer;         // 4 bytes: 0xFD, 'S', 'M', 'B'
  signature: Buffer;          // 16 bytes: AES-128-CMAC or AES-128-GMAC
  nonce: Buffer;              // 16 bytes: Unique nonce for this message (only first 11 bytes used for CCM)
  originalMessageSize: number; // 4 bytes: Size of encrypted SMB2 message
  reserved: number;           // 2 bytes: Should be 0
  flags: number;              // 2 bytes: Encryption flags (0x0001 = Encrypted)
  sessionId: string;          // 8 bytes: Session ID (as hex string)
}

export class TransformHeaderUtil {
  static readonly PROTOCOL_ID = Buffer.from([0xFD, 0x53, 0x4D, 0x42]); // 0xFD 'S' 'M' 'B'
  static readonly SIZE = 52;
  static readonly FLAG_ENCRYPTED = 0x0001;

  /**
   * Serialize transform header to buffer
   */
  static serialize(header: TransformHeader): Buffer {
    const buffer = Buffer.alloc(TransformHeaderUtil.SIZE);
    let offset = 0;

    // ProtocolId (4 bytes)
    header.protocolId.copy(buffer, offset);
    offset += 4;

    // Signature (16 bytes) - initially zeros, filled after encryption
    header.signature.copy(buffer, offset);
    offset += 16;

    // Nonce (16 bytes)
    header.nonce.copy(buffer, offset);
    offset += 16;

    // OriginalMessageSize (4 bytes)
    buffer.writeUInt32LE(header.originalMessageSize, offset);
    offset += 4;

    // Reserved (2 bytes)
    buffer.writeUInt16LE(header.reserved, offset);
    offset += 2;

    // Flags (2 bytes)
    buffer.writeUInt16LE(header.flags, offset);
    offset += 2;

    // SessionId (8 bytes)
    const sessionIdBuf = Buffer.from(header.sessionId, 'hex');
    sessionIdBuf.copy(buffer, offset);
    offset += 8;

    return buffer;
  }

  /**
   * Parse transform header from buffer
   */
  static parse(buffer: Buffer): TransformHeader {
    let offset = 0;

    // ProtocolId (4 bytes)
    const protocolId = buffer.slice(offset, offset + 4);
    offset += 4;

    // Verify protocol ID
    if (!protocolId.equals(TransformHeaderUtil.PROTOCOL_ID)) {
      throw new Error('Invalid Transform Header Protocol ID');
    }

    // Signature (16 bytes)
    const signature = buffer.slice(offset, offset + 16);
    offset += 16;

    // Nonce (16 bytes)
    const nonce = buffer.slice(offset, offset + 16);
    offset += 16;

    // OriginalMessageSize (4 bytes)
    const originalMessageSize = buffer.readUInt32LE(offset);
    offset += 4;

    // Reserved (2 bytes)
    const reserved = buffer.readUInt16LE(offset);
    offset += 2;

    // Flags (2 bytes)
    const flags = buffer.readUInt16LE(offset);
    offset += 2;

    // SessionId (8 bytes)
    const sessionId = buffer.slice(offset, offset + 8).toString('hex');
    offset += 8;

    return {
      protocolId,
      signature,
      nonce,
      originalMessageSize,
      reserved,
      flags,
      sessionId
    };
  }

  /**
   * Create a new transform header for encryption
   */
  static create(sessionId: string, messageSize: number): TransformHeader {
    return {
      protocolId: TransformHeaderUtil.PROTOCOL_ID,
      signature: Buffer.alloc(16), // Will be filled after encryption
      nonce: crypto.randomBytes(16),
      originalMessageSize: messageSize,
      reserved: 0,
      flags: TransformHeaderUtil.FLAG_ENCRYPTED,
      sessionId
    };
  }

  /**
   * Get AAD (Additional Authenticated Data) from transform header
   * Per MS-SMB2: AAD is the 32 bytes starting from Nonce field
   */
  static getAAD(headerBuffer: Buffer): Buffer {
    // Skip ProtocolId (4 bytes) and Signature (16 bytes)
    // AAD starts at Nonce (byte 20) and is 32 bytes
    return headerBuffer.slice(20, 52);
  }

  /**
   * Get nonce for AES-CCM (first 11 bytes of the 16-byte nonce field)
   */
  static getCCMNonce(nonce: Buffer): Buffer {
    return nonce.slice(0, 11);
  }
}

import crypto from "crypto";

export default TransformHeaderUtil;
