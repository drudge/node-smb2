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

export const encodeNegotiationMessage = (h: string, d: string) => {
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

  const negotiateFlags = NegotiateFlag.UnicodeEncoding | NegotiateFlag.NTLMSessionSecurity | NegotiateFlag.AlwaysSign | NegotiateFlag.ExtendedSessionSecurity | NegotiateFlag.TargetInfo | NegotiateFlag.Version;
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
  negotiateFlags: number = NegotiateFlag.ExtendedSessionSecurity | NegotiateFlag.TargetInfo
) => {
  const hostname = h.toUpperCase();
  const domain = d.toUpperCase();

  const ntHash = createNtHash(password);
  let ntResponse: Buffer;
  let lmResponse: Buffer;

  if (isNTLMv1(negotiateFlags)) {
    // NTLMv1 mode
    ntResponse = createNTLMv1Response(ntHash, serverChallenge);
    lmResponse = createLMv1Response(password, serverChallenge);
  } else {
    // NTLMv2 mode
    const ntlmv2Hash = createNtlmV2Hash(username, domain, ntHash);
    const clientChallenge = crypto.randomBytes(8);
    const timestamp = Buffer.alloc(8);
    const now = new Date().getTime() + 11644473600000;
    timestamp.writeBigUInt64LE(BigInt(now * 10000));

    const targetInfo = createTargetInfo(hostname, domain);
    
    ntResponse = createNtlmV2Response(ntlmv2Hash, serverChallenge, clientChallenge, timestamp, targetInfo);
    lmResponse = createNtlmV2Response(ntlmv2Hash, serverChallenge, clientChallenge, Buffer.alloc(8), Buffer.alloc(0));
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
  lmResponse.copy(buffer, lmResponseOffset);
  ntResponse.copy(buffer, ntResponseOffset);

  return buffer;
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

  return Buffer.concat(bufArray.map(buf => new Uint8Array(buf)));
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
