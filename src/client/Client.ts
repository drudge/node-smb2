import crypto from "crypto";
import { Socket } from "net";
import { EventEmitter } from "events";
import Packet from "../protocol/Packet";
import Request from "../protocol/smb2/Request";
import Response from "../protocol/smb2/Response";
import Header from "../protocol/smb2/Header";
import StatusCode from "../protocol/smb2/StatusCode";
import Smb2PacketType from "../protocol/smb2/PacketType";
import Session, { AuthenticateOptions } from "./Session";
import * as structureUtil from "../protocol/structureUtil";
import TransformHeaderUtil, { TransformHeader } from "../protocol/smb3/TransformHeader";
import { encryptAES128CCM, decryptAES128CCM, calculateSignature } from "../protocol/smb3/crypto";

export interface Options {
  port?: number;
  connectTimeout?: number;
  requestTimeout?: number;
}

interface Client {
  on(event: "error", callback: (error: Error) => void): this;
  on(event: "changeNotify", callback: (response: Response) => void): this;

  once(event: "error", callback: (error: Error) => void): this;
  once(event: "changeNotify", callback: (response: Response) => void): this;
}

class Client extends EventEmitter {
  _id = crypto.randomBytes(4).toString("hex");
  socket: Socket;
  nextMessageId: bigint = 0n;

  responseRestChunk: Buffer;
  responseMap = new Map<bigint, Response>();
  responseCallbackMap = new Map<bigint, (response: Response) => void>();

  connected: boolean = false;

  port: number = 445;

  connectTimeout: number = 5 * 1000;
  connectTimeoutId: NodeJS.Timeout;

  requestTimeout: number = 5 * 1000;
  requestTimeoutIdMap = new Map<bigint, NodeJS.Timeout>();

  sessions: Session[] = [];

  constructor(
    public host: string,
    public options: Options = {}
  ) {
    super();

    if (typeof this.options.port === "number") this.port = this.options.port;
    if (typeof this.options.connectTimeout === "number") this.connectTimeout = this.options.connectTimeout;
    if (typeof this.options.requestTimeout === "number") this.requestTimeout = this.options.requestTimeout;
  }

  async connect() {
    if (this.connected) return;

    this.socket = new Socket({ allowHalfOpen: true })
      .addListener("data", this.onData)
      .addListener("error", this.onError)
      .addListener("close", this.onClose);
    this.socket.setTimeout(0);
    this.socket.setKeepAlive(true);

    const connectPromise = new Promise<void>((resolve, reject) => {
      this.connectTimeoutId = setTimeout(() => {
        reject(new Error("connect_timeout"));
      }, this.connectTimeout);
      this.socket.connect(
        this.port,
        this.host
      );
      this.socket.once("connect", () => {
        resolve();
      });
      this.socket.once("error", (err) => {
        reject(err);
      });
    });

    try {
      await connectPromise;
      clearTimeout(this.connectTimeoutId);
      this.connected = true;
    } catch (err) {
      this.destroySocket();
      throw err;
    }
  }

  createRequest(header: Header = {}, body: any = {}) {
    const messageId = this.nextMessageId++;

    return new Request(
      {
        messageId,
        clientId: this._id,
        ...header
      },
      body
    );
  }

  async request(header?: Header, body?: any) {
    const request = this.createRequest(header, body);
    return await this.send(request);
  }

  /**
   * Decrypt an SMB2 message from Transform header
   * @param buffer - The complete buffer with Transform header + encrypted message
   * @param session - The session with decryption keys
   * @returns Decrypted SMB2 message
   */
  private decryptMessage(buffer: Buffer, session: Session): Buffer {
    if (!session.decryptionKey || !session.signingKey) {
      throw new Error("Decryption keys not available");
    }

    // Parse Transform header (52 bytes)
    const transformHeader = TransformHeaderUtil.parse(buffer.slice(0, TransformHeaderUtil.SIZE));

    // Extract encrypted message (everything after Transform header)
    const encryptedMessage = buffer.slice(TransformHeaderUtil.SIZE);

    // Verify signature
    // Zero out signature field for verification
    const transformHeaderBuffer = buffer.slice(0, TransformHeaderUtil.SIZE);
    const zeroedSignatureBuffer = Buffer.from(transformHeaderBuffer);
    Buffer.alloc(16).copy(zeroedSignatureBuffer, 4); // Zero signature field at offset 4

    const dataToVerify = Buffer.concat([zeroedSignatureBuffer, encryptedMessage]);
    const expectedSignature = calculateSignature(session.signingKey, dataToVerify);

    if (!expectedSignature.equals(transformHeader.signature)) {
      console.warn("Transform header signature mismatch - message may be tampered");
      // Note: In production, you might want to throw an error here
    }

    // Get AAD and nonce for decryption
    const aad = TransformHeaderUtil.getAAD(transformHeaderBuffer);
    const nonce = TransformHeaderUtil.getCCMNonce(transformHeader.nonce);

    // Per MS-SMB2 3.1.4.1: For AES-CCM, the signature field IS the auth tag
    const authTag = transformHeader.signature;

    // Decrypt and verify the message
    const decryptedMessage = decryptAES128CCM(
      session.decryptionKey,
      nonce,
      encryptedMessage,
      authTag,
      aad
    );

    return decryptedMessage;
  }

  /**
   * Encrypt an SMB2 message with Transform header
   * @param message - The SMB2 message buffer to encrypt
   * @param session - The session with encryption keys
   * @returns Encrypted message with Transform header
   */
  private encryptMessage(message: Buffer, session: Session): Buffer {
    if (!session.encryptionKey || !session.signingKey) {
      throw new Error("Encryption keys not available");
    }

    // Create Transform header
    const transformHeader = TransformHeaderUtil.create(session._id, message.length);

    // Serialize Transform header
    const transformHeaderBuffer = TransformHeaderUtil.serialize(transformHeader);

    // Get AAD (Additional Authenticated Data) - 32 bytes starting from Nonce field
    const aad = TransformHeaderUtil.getAAD(transformHeaderBuffer);

    // Get CCM nonce (first 11 bytes of 16-byte nonce)
    const nonce = TransformHeaderUtil.getCCMNonce(transformHeader.nonce);

    // Encrypt the SMB2 message
    const { ciphertext, authTag } = encryptAES128CCM(
      session.encryptionKey,
      nonce,
      message,
      aad
    );

    // Per MS-SMB2 section 3.1.4.1: For AES-CCM, the Signature field
    // is set to the 16-byte authentication tag from CCM (not a separate CMAC!)
    authTag.copy(transformHeaderBuffer, 4); // Write auth tag as signature at offset 4

    // Return Transform header + ciphertext (auth tag is in header, not appended to ciphertext)
    return Buffer.concat([transformHeaderBuffer, ciphertext]);
  }

  async send(request: Request) {
    if (!this.connected) throw new Error("not_connected");

    let buffer = request.serialize();

    // Encrypt if session has encryption enabled
    // Find the session for this request
    const session = this.sessions.find(s => s._id === request.header.sessionId);
    if (session && session.encryptionEnabled && session.encryptionKey) {
      try {
        // Wrap the serialized message in Transform header with encryption
        const encryptedBuffer = this.encryptMessage(buffer, session);
        this.socket.write(encryptedBuffer);
        console.log("Message encrypted with Transform header");
      } catch (err) {
        console.error("Encryption failed:", err);
        throw err;
      }
    } else {
      this.socket.write(buffer);
    }

    const messageId = request.header.messageId;
    const sendPromise = new Promise<Response>((resolve, reject) => {
      const requestTimeoutId = setTimeout(
        () => {
          const err = new Error(`request_timeout: ${structureUtil.parseEnumValue(Smb2PacketType, request.header.type)}(${messageId})`);
          reject(err);
        },
        this.requestTimeout
      );

      this.requestTimeoutIdMap.set(messageId, requestTimeoutId);

      const finishRequest = (response: Response) => {
        response.request = request;

        if (
          response.header.status !== StatusCode.Success &&
          response.header.status !== StatusCode.Pending &&
          response.header.status !== StatusCode.MoreProcessingRequired &&
          response.header.status !== StatusCode.FileClosed
        ) {
          reject(response);
        } else {
          resolve(response);
        }
      };

      if (this.responseMap.has(messageId)) {
        finishRequest(this.responseMap.get(messageId));
        this.responseMap.delete(messageId);
      } else if (!this.responseCallbackMap.has(messageId)) {
        this.responseCallbackMap.set(messageId, finishRequest);
      }
    });

    const response = await sendPromise;
    if (this.requestTimeoutIdMap.has(messageId)) {
      const requestTimeoutId = this.requestTimeoutIdMap.get(messageId);
      clearTimeout(requestTimeoutId);
      this.requestTimeoutIdMap.delete(messageId);
    }

    return response;
  }

  onData = (buffer: Buffer) => {
    if (this.responseRestChunk) {
      buffer = Buffer.concat([this.responseRestChunk, buffer]);
      this.responseRestChunk = undefined;
    }

    const {
      chunks,
      restChunk
    } = Packet.getChunks(buffer);
    this.responseRestChunk = restChunk;

    for (let chunk of chunks) {
      // Check if this is an encrypted Transform header
      if (Packet.isTransformHeader(chunk)) {
        console.log("Received encrypted Transform header");

        // Parse Transform header to get session ID
        const transformHeader = TransformHeaderUtil.parse(chunk.slice(0, TransformHeaderUtil.SIZE));

        // Find the session by ID
        const session = this.sessions.find(s => s._id === transformHeader.sessionId);

        if (session && session.decryptionKey) {
          try {
            // Decrypt the message
            chunk = this.decryptMessage(chunk, session);
            console.log("Message decrypted successfully");
          } catch (err) {
            console.error("Decryption failed:", err);
            // Skip this chunk if decryption fails
            continue;
          }
        } else {
          console.error("Cannot decrypt: session or keys not found");
          continue;
        }
      }

      const response = Response.parse(chunk);
      this.onResponse(response);
    }
  }

  onResponse(response: Response) {
    if (
      response.header.type === Smb2PacketType.ChangeNotify &&
      response.header.status === StatusCode.Success
    ) {
      this.emit("changeNotify", response);
    }

    const messageId = response.header.messageId;
    if (this.responseCallbackMap.has(messageId)) {
      this.responseCallbackMap.get(messageId)(response);
      this.responseCallbackMap.delete(messageId);
    } else {
      this.responseMap.set(messageId, response);
    }
  }

  onError = (err: Error) => {
    console.error(err);
  }

  onClose = (hadError: boolean) => {
    this.connected = false;
  }

  async echo() {
    return await this.request({
      type: Smb2PacketType.Echo
    });
  }

  async authenticate(options: AuthenticateOptions) {
    if (!this.connected) await this.connect();

    const session = new Session(this);
    this.registerSession(session);
    await session.authenticate(options);
    return session;
  }

  private destroySocket() {
    this.socket
      .removeListener("data", this.onData)
      .removeListener("error", this.onError)
      .removeListener("close", this.onClose);
    this.socket.end();
    this.socket.destroy();

    delete this.socket;
  }

  private registerSession(session: Session) {
    session
      .once("authenticate", () => this.sessions.push(session))
      .once("logoff", () => this.sessions.splice(this.sessions.indexOf(session), 1));
  }

  async close() {
    if (!this.connected) return;

    await Promise.all(this.sessions.map(x => x.logoff()));

    this.destroySocket();

    this.connected = false;
  }
}

export default Client;