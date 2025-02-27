import crypto from "crypto";
import desjs from "des.js";
import jsmd4 from "js-md4";
import NegotiateFlag from "./NegotiateFlag";

enum AvId {
  MsvAvEOL = 0x0000,
  MsvAvNbComputerName = 0x0001,
  MsvAvNbDomainName = 0x0002,
  MsvAvDnsComputerName = 0x0003,
  MsvAvDnsDomainName = 0x0004,
  MsvAvDnsTreeName = 0x0005,
  MsvAvFlags = 0x0006,
  MsvAvTimestamp = 0x0007,
  MsvAvRestrictions = 0x0008,
  MsvAvTargetName = 0x0009,
  MsvAvChannelBindings = 0x000A
}

// Check if we should use NTLMv1
const isNTLMv1 = (negotiateFlags: number): boolean => {
  return !(negotiateFlags & NegotiateFlag.ExtendedSessionSecurity);
};

// Create NTLM v1 response
const createNTLMv1Response = (ntHash: Buffer, serverChallenge: Buffer): Buffer => {
  return createResponse(ntHash, serverChallenge);
};

// Create LM v1 response
const createLMv1Response = (password: string, serverChallenge: Buffer): Buffer => {
  const lmHash = createLmHash(password);
  return createResponse(lmHash, serverChallenge);
};

const createTargetInfo = (hostname: string, domain: string): Buffer => {
  // Calculate required buffer size
  const hostnameLength = Buffer.byteLength(hostname, 'utf16le');
  const domainLength = Buffer.byteLength(domain, 'utf16le');
  // 4 bytes for each AvId+AvLen pair, plus string lengths, plus 4 bytes for EOL
  const bufferSize = (4 + hostnameLength) + (4 + domainLength) + 4;
  const buffer = Buffer.alloc(bufferSize);
  let offset = 0;
  // Add computer name
  buffer.writeUInt16LE(AvId.MsvAvNbComputerName, offset);
  buffer.writeUInt16LE(hostnameLength, offset + 2);
  buffer.write(hostname, offset + 4, hostnameLength, 'utf16le');
  offset += 4 + hostnameLength;
  // Add domain name
  buffer.writeUInt16LE(AvId.MsvAvNbDomainName, offset);
  buffer.writeUInt16LE(domainLength, offset + 2);
  buffer.write(domain, offset + 4, domainLength, 'utf16le');
  offset += 4 + domainLength;
  // Add terminator (MsvAvEOL)
  buffer.writeUInt16LE(AvId.MsvAvEOL, offset);
  buffer.writeUInt16LE(0, offset + 2);
  return buffer;
};

export const encodeNegotiationMessage = (h: string, d: string, forceNtlmVersion?: 'v1' | 'v2') => {
  const hostname = h.toUpperCase();
  const domain = d.toUpperCase();

  const hostnameLength = Buffer.byteLength(hostname, "ascii");
  const domainLength = Buffer.byteLength(domain, "ascii");

  let offset = 0;
  const buffer = Buffer.alloc(32 + hostnameLength + domainLength);

  buffer.write("NTLMSSP", offset, 7, "ascii");
  offset += 7;
  buffer.writeUInt8(0, offset);
  offset += 1;

  buffer.writeUInt32LE(1, offset);
  offset += 4;

  // Base negotiate flags common to both versions
  let negotiateFlags = NegotiateFlag.UnicodeEncoding |
                      NegotiateFlag.NTLMSessionSecurity |
                      NegotiateFlag.AlwaysSign;
  // Add version-specific flags
  if (forceNtlmVersion === 'v2' || (!forceNtlmVersion && process.env.NODE_SMB2_DEFAULT_NTLM !== 'v1')) {
    // NTLMv2 flags - more secure
    negotiateFlags |= NegotiateFlag.ExtendedSessionSecurity |
                     NegotiateFlag.TargetInfo |
                     NegotiateFlag.Version;
  }
  buffer.writeUInt32LE(negotiateFlags, offset);
  offset += 4;

  buffer.writeUInt16LE(domainLength, offset);
  offset += 2;
  buffer.writeUInt16LE(domainLength, offset);
  offset += 2;

  const domainOffset = 0x20 + hostnameLength;
  buffer.writeUInt32LE(domainOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(hostnameLength, offset);
  offset += 2;
  buffer.writeUInt16LE(hostnameLength, offset);
  offset += 2;

  buffer.writeUInt32LE(0x20, offset);
  offset += 4;

  buffer.write(hostname, 0x20, hostnameLength, "ascii");
  buffer.write(domain, domainOffset, domainLength, "ascii");

  return buffer;
};

export const decodeNegotiationMessage = (buffer: Buffer) => {
  let offset = 0;

  const protocol = buffer.slice(0, 7).toString("ascii");
  if (
    protocol !== "NTLMSSP" ||
    buffer.readInt8(7) !== 0x00
  ) throw new Error("ntlmssp_header_not_found");
  offset += 8;

  const type = buffer.readUInt32LE(offset);
  if (type !== 0x01) throw new Error("ntlmssp_type_is_not_one");
  offset += 4;

  const negotiateFlags = buffer.readUInt32LE(offset);
  offset += 4;

  const domainLength = buffer.readUInt16LE(offset);
  offset += 2;
  const domainMaxLength = buffer.readUInt16LE(offset);
  offset += 2;
  const domainOffset = buffer.readUInt32LE(offset);
  offset += 4;

  const hostnameLength = buffer.readUInt16LE(offset);
  offset += 2;
  const hostnameMaxLength = buffer.readUInt16LE(offset);
  offset += 2;
  const hostnameOffset = buffer.readUInt32LE(offset);
  offset += 4;

  const domain = buffer.slice(domainOffset, domainOffset + domainLength).toString("ascii");
  const hostname = buffer.slice(hostnameOffset, hostnameOffset + hostnameLength).toString("ascii");

  return {
    negotiateFlags,
    domain,
    hostname
  };
};

export const encodeChallengeMessage = (negotiateFlags: number) => {
  let offset = 0;
  const buffer = Buffer.alloc(64);

  buffer.write("NTLMSSP", offset, 7, "ascii");
  offset += 7;
  buffer.writeUInt8(0, offset);
  offset += 1;

  buffer.writeUInt32LE(2, offset);
  offset += 4;

  buffer.writeUInt16LE(0, offset);
  offset += 2;

  buffer.writeUInt16LE(0, offset);
  offset += 2;

  buffer.writeUInt32LE(0, offset);
  offset += 4;

  buffer.writeUInt32LE(negotiateFlags, offset);
  offset += 4;

  generateServerChallenge().copy(new Uint8Array(buffer), offset);
  offset += 8;

  buffer.fill(0, offset, offset + 8);
  offset += 8;

  return buffer;
};

export const decodeChallengeMessage = (buffer: Buffer) => {
  let offset = 0;

  const protocol = buffer.slice(0, 7).toString("ascii");
  if (
    protocol !== "NTLMSSP" ||
    buffer.readInt8(7) !== 0x00
  ) throw new Error("ntlmssp_header_not_found");
  offset += 8;

  const type = buffer.readUInt32LE(offset);
  if (type !== 0x02) throw new Error("ntlmssp_type_is_not_two");
  offset += 4;

  const targetNameLength = buffer.readUInt16LE(offset);
  offset += 2;

  const targetNameMaxLength = buffer.readUInt16LE(offset);
  offset += 2;

  const targetNameOffset = buffer.readUInt32LE(offset);
  offset += 4;

  const negotiateFlags = buffer.readUInt32LE(offset);
  offset += 4;

  const serverChallenge = buffer.slice(offset, offset + 8);
  offset += 8;

  offset += 8; // Reserved

  return serverChallenge;
};

export const encodeAuthenticationMessage = (
  username: string,
  h: string,
  d: string,
  serverChallenge: Buffer,
  password: string,
  negotiateFlags: number = 0,
  forceNtlmVersion?: 'v1' | 'v2'
) => {
  const hostname = h.toUpperCase();
  const domain = d.toUpperCase();
  const ntHash = createNtHash(password);
  let ntResponse: Buffer;
  let lmResponse: Buffer;
  // Determine which NTLM version to use
  const useV1 = forceNtlmVersion === 'v1' ||
               (isNTLMv1(negotiateFlags) && forceNtlmVersion !== 'v2') ||
               (process.env.NODE_SMB2_DEFAULT_NTLM === 'v1' && !forceNtlmVersion);
  if (useV1) {
    // NTLMv1 mode (simpler, more compatible)
    console.log("Using NTLMv1 authentication");
    // Create padded hashes
    const lmHash = Buffer.alloc(21);
    createLmHash(password).copy(lmHash);
    lmHash.fill(0x00, 16);
    const ntHashPadded = Buffer.alloc(21);
    ntHash.copy(ntHashPadded);
    ntHashPadded.fill(0x00, 16);
    ntResponse = createResponse(ntHashPadded, serverChallenge);
    lmResponse = createResponse(lmHash, serverChallenge);
  } else {
    // NTLMv2 mode (more secure, newer servers)
    console.log("Using NTLMv2 authentication");
    try {
      const ntlmv2Hash = createNtlmV2Hash(username, domain, ntHash);
      const clientChallenge = crypto.randomBytes(8);
      // Create timestamp (Windows file time format)
      const timestamp = Buffer.alloc(8);
      const now = new Date().getTime() + 11644473600000; // Convert to Windows file time
      timestamp.writeBigUInt64LE(BigInt(now * 10000));
      const targetInfo = createTargetInfo(hostname, domain);
      ntResponse = createNtlmV2Response(ntlmv2Hash, serverChallenge, clientChallenge, timestamp, targetInfo);
      lmResponse = createLMv2Response(ntlmv2Hash, serverChallenge, clientChallenge);
    } catch (err) {
      console.error("Error creating NTLMv2 response, falling back to NTLMv1:", err);
      // Fall back to NTLMv1 if NTLMv2 creation fails
      const lmHash = Buffer.alloc(21);
      createLmHash(password).copy(lmHash);
      lmHash.fill(0x00, 16);
      const ntHashPadded = Buffer.alloc(21);
      ntHash.copy(ntHashPadded);
      ntHashPadded.fill(0x00, 16);
      ntResponse = createResponse(ntHashPadded, serverChallenge);
      lmResponse = createResponse(lmHash, serverChallenge);
    }
  }

  const usernameLength = Buffer.byteLength(username, "ucs2");
  const hostnameLength = Buffer.byteLength(hostname, "ucs2");
  const domainLength = Buffer.byteLength(domain, "ucs2");
  const lmResponseLength = lmResponse.length;
  const ntResponseLength = ntResponse.length;

  const domainOffset = 0x40;
  const usernameOffset = domainOffset + domainLength;
  const hostnameOffset = usernameOffset + usernameLength;
  const lmResponseOffset = hostnameOffset + hostnameLength;
  const ntResponseOffset = lmResponseOffset + lmResponseLength;

  let offset = 0;
  const buffer = Buffer.alloc(ntResponseOffset + ntResponseLength);

  buffer.write("NTLMSSP", offset, 7, "ascii");
  offset += 7;
  buffer.writeUInt8(0, offset);
  offset += 1;

  buffer.writeUInt32LE(3, offset);
  offset += 4;

  buffer.writeUInt16LE(lmResponseLength, offset);
  offset += 2;
  buffer.writeUInt16LE(lmResponseLength, offset);
  offset += 2;
  buffer.writeUInt32LE(lmResponseOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(ntResponseLength, offset);
  offset += 2;
  buffer.writeUInt16LE(ntResponseLength, offset);
  offset += 2;
  buffer.writeUInt32LE(ntResponseOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(domainLength, offset);
  offset += 2;
  buffer.writeUInt16LE(domainLength, offset);
  offset += 2;
  buffer.writeUInt32LE(domainOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(usernameLength, offset);
  offset += 2;
  buffer.writeUInt16LE(usernameLength, offset);
  offset += 2;
  buffer.writeUInt32LE(usernameOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(hostnameLength, offset);
  offset += 2;
  buffer.writeUInt16LE(hostnameLength, offset);
  offset += 2;
  buffer.writeUInt32LE(hostnameOffset, offset);
  offset += 4;

  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  buffer.writeUInt32LE(0, offset);
  offset += 4;

  buffer.writeUInt32LE(negotiateFlags, offset);
  offset += 4;

  // Write domain, username, hostname and responses
  buffer.write(domain, domainOffset, domainLength, "ucs2");
  buffer.write(username, usernameOffset, usernameLength, "ucs2");
  buffer.write(hostname, hostnameOffset, hostnameLength, "ucs2");
  // Copy responses safely to prevent buffer issues
  lmResponse.copy(buffer, lmResponseOffset, 0, lmResponseLength);
  ntResponse.copy(buffer, ntResponseOffset, 0, ntResponseLength);

  return buffer;
};

// Helper for creating LMv2 response (simplified for compatibility)
const createLMv2Response = (ntlmv2Hash: Buffer, serverChallenge: Buffer, clientChallenge: Buffer): Buffer => {
  const hmac = crypto.createHmac('md5', ntlmv2Hash);
  hmac.update(Buffer.concat([serverChallenge, clientChallenge]));
  return Buffer.concat([hmac.digest(), clientChallenge]);
};

export const generateServerChallenge = () => {
  return crypto.randomBytes(8);
};

const bytes2binaryArray = (buf: Buffer): number[] => {
  const hex2binary = {
    0: [0, 0, 0, 0],
    1: [0, 0, 0, 1],
    2: [0, 0, 1, 0],
    3: [0, 0, 1, 1],
    4: [0, 1, 0, 0],
    5: [0, 1, 0, 1],
    6: [0, 1, 1, 0],
    7: [0, 1, 1, 1],
    8: [1, 0, 0, 0],
    9: [1, 0, 0, 1],
    A: [1, 0, 1, 0],
    B: [1, 0, 1, 1],
    C: [1, 1, 0, 0],
    D: [1, 1, 0, 1],
    E: [1, 1, 1, 0],
    F: [1, 1, 1, 1],
  };

  const hexString = buf.toString("hex").toUpperCase();
  let array: number[] = [];
  for (let i = 0; i < hexString.length; i++) {
    const hexchar = hexString.charAt(i);
    array = array.concat(hex2binary[hexchar]);
  }
  return array;
};

const binaryArray2bytes = (array: number[]): Buffer => {
  const binary2hex = {
    "0000": 0,
    "0001": 1,
    "0010": 2,
    "0011": 3,
    "0100": 4,
    "0101": 5,
    "0110": 6,
    "0111": 7,
    "1000": 8,
    "1001": 9,
    "1010": "A",
    "1011": "B",
    "1100": "C",
    "1101": "D",
    "1110": "E",
    "1111": "F",
  };

  const bufArray: Buffer[] = [];

  for (let i = 0; i < array.length; i += 8) {
    if (i + 7 > array.length) break;

    const binString1 =
      `${array[i]}${array[i + 1]}${array[i + 2]}${array[i + 3]}`;
    const binString2 =
      `${array[i + 4]}${array[i + 5]}${array[i + 6]}${array[i + 7]}`;
    const hexchar1 = binary2hex[binString1];
    const hexchar2 = binary2hex[binString2];

    const buf = Buffer.from(`${hexchar1}${hexchar2}`, "hex");
    bufArray.push(buf);
  }

  return Buffer.concat(bufArray);
};

const insertZerosEvery7Bits = (buf: Buffer): Buffer => {
  const binaryArray = bytes2binaryArray(buf);
  const newBinaryArray = [];
  for (let i = 0; i < binaryArray.length; i++) {
    newBinaryArray.push(binaryArray[i]);

    if ((i + 1) % 7 === 0) {
      newBinaryArray.push(0);
    }
  }
  return binaryArray2bytes(newBinaryArray);
};

const createLmHash = (p: string): Buffer => {
  const password = p.toUpperCase();
  const passwordBytes = Buffer.from(password, "ascii");

  const passwordBytesPadded = Buffer.alloc(14);
  passwordBytesPadded.fill("\0");
  let sourceEnd = 14;
  if (passwordBytes.length < 14) sourceEnd = passwordBytes.length;
  passwordBytes.copy(new Uint8Array(passwordBytesPadded), 0, 0, sourceEnd);

  const firstPart = passwordBytesPadded.slice(0, 7);
  const secondPart = passwordBytesPadded.slice(7);

  function encrypt(buf) {
    const key = insertZerosEvery7Bits(buf);
    const des = desjs.DES.create({ type: "encrypt", key });
    const magicKey = Buffer.from("KGS!@#$%", "ascii");
    const encrypted = des.update(magicKey);
    return Buffer.from(encrypted);
  }

  const firstPartEncrypted = encrypt(firstPart);
  const secondPartEncrypted = encrypt(secondPart);

  return Buffer.concat([new Uint8Array(firstPartEncrypted), new Uint8Array(secondPartEncrypted)]);
};

const createNtHash = (password: string): Buffer => {
  const buf = Buffer.from(password, "utf16le");
  const md4 = jsmd4.create();
  md4.update(buf);
  return Buffer.from(md4.digest());
};

const createNtlmV2Hash = (username: string, domain: string, ntHash: Buffer): Buffer => {
  const identity = Buffer.from(username.toUpperCase() + domain.toUpperCase(), 'ucs2');
  const hmac = crypto.createHmac('md5', ntHash);
  return hmac.update(identity).digest();
};

const createNtlmV2Response = (ntlmv2Hash: Buffer, serverChallenge: Buffer, clientChallenge: Buffer, timestamp: Buffer, targetInfo: Buffer): Buffer => {
  const temp = Buffer.concat([
    Buffer.from([0x01, 0x01]), // Signature for NTLMv2
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Reserved
    timestamp,
    clientChallenge,
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // Reserved
    targetInfo
  ]);

  const hmac = crypto.createHmac('md5', ntlmv2Hash);
  hmac.update(serverChallenge);
  hmac.update(temp);
  return Buffer.concat([hmac.digest(), temp]);
};

const createResponse = (hash: Buffer, nonce: Buffer) => {
  const passHashPadded = Buffer.alloc(21);
  passHashPadded.fill("\0");
  hash.copy(new Uint8Array(passHashPadded), 0, 0, hash.length);

  const resArray = [];

  const des1 = desjs.DES.create({
    type: "encrypt",
    key: insertZerosEvery7Bits(passHashPadded.slice(0, 7)),
  });
  resArray.push(Buffer.from(des1.update(nonce.slice(0, 8))));

  const des2 = desjs.DES.create({
    type: "encrypt",
    key: insertZerosEvery7Bits(passHashPadded.slice(7, 14)),
  });
  resArray.push(Buffer.from(des2.update(nonce.slice(0, 8))));

  const des3 = desjs.DES.create({
    type: "encrypt",
    key: insertZerosEvery7Bits(passHashPadded.slice(14, 21)),
  });
  resArray.push(Buffer.from(des3.update(nonce.slice(0, 8))));

  return Buffer.concat(resArray);
};
