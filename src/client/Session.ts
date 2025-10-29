import Tree from "./Tree";
import Client from "./Client";
import { EventEmitter } from "events";
import os from "os";
import Dialect from "../protocol/smb2/Dialect";
import Header from "../protocol/smb2/Header";
import { generateGuid } from "../protocol/util";
import * as ntlmUtil from "../protocol/ntlm/util";
import PacketType from "../protocol/smb2/PacketType";
import { deriveEncryptionKey, deriveDecryptionKey, deriveSigningKey } from "../protocol/smb3/crypto";

export interface AuthenticateOptions {
  domain: string;
  username: string;
  password: string;
  /**
   * Force a specific NTLM version instead of auto-negotiation
   * - 'v1': Force NTLMv1 (less secure but more compatible)
   * - 'v2': Force NTLMv2 (more secure, less compatible with some servers)
   * - undefined: Auto-detect based on server response (default)
   */
  forceNtlmVersion?: 'v1' | 'v2';
}

interface Session {
  on(event: "authenticate" | "logoff", callback: (session: Session) => void): this;

  once(event: "authenticate" | "logoff", callback: (session: Session) => void): this;
}

class Session extends EventEmitter {
  _id: string;
  authenticated: boolean = false;

  connectedTrees: Tree[] = [];

  // SMB3 encryption support
  encryptionKey?: Buffer;
  decryptionKey?: Buffer;
  signingKey?: Buffer;
  encryptionEnabled: boolean = false;
  dialectRevision?: number; // Track negotiated SMB dialect

  constructor(
    public client: Client
  ) {
    super();
  }

  async connectTree(path: string) {
    const tree = new Tree(this);
    this.registerTree(tree);
    await tree.connect(path);

    return tree;
  }

  createRequest(header: Header = {}, body: any = {}) {
    return this.client.createRequest({
      sessionId: this._id,
      ...header
    }, body);
  }

  async request(header: Header = {}, body: any = {}) {
    return await this.client.request(
      {
        sessionId: this._id,
        ...header
      },
      body
    );
  }

  async authenticate(options: AuthenticateOptions) {
    if (this.authenticated) return;

    try {
      // Get client workstation name (NetBIOS-style, not server name)
      const clientWorkstation = os.hostname().split('.')[0].toUpperCase();

      const negotiateResponse = await this.request({
        type: PacketType.Negotiate
      }, {
        dialects: [
          Dialect.Smb202,
          Dialect.Smb210,
          Dialect.Smb300,
          Dialect.Smb302  // Add SMB 3.0.2 support for Win Server 2019/2022
        ],
        clientGuid: generateGuid(),
        capabilities: 0  // Will be filled by structure defaults
      });

      // Store dialect revision and check encryption support
      this.dialectRevision = negotiateResponse.body.dialectRevision;
      const serverCapabilities = negotiateResponse.body.capabilities || 0;
      const serverSupportsEncryption = (serverCapabilities & 0x00000040) !== 0; // Encryption capability

      console.log(`[DEBUG] Negotiate response:`);
      console.log(`  Dialect: 0x${this.dialectRevision.toString(16)}`);
      console.log(`  Server capabilities: 0x${serverCapabilities.toString(16)}`);
      console.log(`  Encryption capability bit: ${serverSupportsEncryption}`);

      // Enable encryption if we negotiated SMB 3.x and server supports it
      const isSmb3 = this.dialectRevision >= 0x0300; // SMB 3.0 or higher
      if (isSmb3 && serverSupportsEncryption) {
        console.log(`Server supports SMB3 encryption (dialect ${this.dialectRevision.toString(16)})`);
      }

      // Initial negotiation includes forceNtlmVersion if specified
      // Use client workstation name, NOT server name
      const sessionSetupResponse = await this.request(
        { type: PacketType.SessionSetup },
        { buffer: ntlmUtil.encodeNegotiationMessage(clientWorkstation, options.domain, options.forceNtlmVersion) }
      );
      this._id = sessionSetupResponse.header.sessionId;

      // Extract server challenge with negotiateFlags and targetInfo
      const challenge = ntlmUtil.decodeChallengeMessage(sessionSetupResponse.body.buffer as Buffer);

      // Send authentication response with server's negotiateFlags and targetInfo
      const authResult = ntlmUtil.encodeAuthenticationMessage(
        options.username,
        clientWorkstation,  // Use client workstation, not server name
        options.domain,
        challenge.serverChallenge,
        options.password,
        challenge.negotiateFlags,  // Use actual negotiated flags from server
        options.forceNtlmVersion,
        challenge.targetInfo  // Pass server's targetInfo
      );

      const authResponse = await this.request(
        { type: PacketType.SessionSetup },
        {
          buffer: authResult.buffer
        }
      );

      // Derive SMB3 encryption keys if sessionKey is available (NTLMv2) and SMB 3.x negotiated
      if (authResult.sessionKey && isSmb3) {
        this.encryptionKey = deriveEncryptionKey(authResult.sessionKey, 'ServerIn');
        this.decryptionKey = deriveDecryptionKey(authResult.sessionKey, 'ServerIn');
        this.signingKey = deriveSigningKey(authResult.sessionKey, 'ServerIn');

        // Enable encryption if server supports it
        if (serverSupportsEncryption) {
          this.encryptionEnabled = true;
          console.log("SMB3 encryption ENABLED - keys derived successfully");
        } else {
          console.log("SMB3 encryption keys derived (ready but not enabled)");
        }
      }

      this.authenticated = true;
      this.emit("authenticate", this);
    } catch (error) {
      // Clean way to handle sharing violation specifically
      if (error.header && error.header.status === 0xc0000043) {
        throw new Error("Sharing violation error during authentication. The share may be in use by another process.");
      }
      throw error; // Rethrow other errors
    }
  }

  private registerTree(tree: Tree) {
    tree
      .once("connect", () => this.connectedTrees.push(tree))
      .once("disconnect", () => this.connectedTrees.splice(this.connectedTrees.indexOf(tree), 1));
  }

  async logoff() {
    if (!this.authenticated) return;
    this.authenticated = false;

    await Promise.all(this.connectedTrees.map(x => x.disconnect()));

    await this.request({ type: PacketType.LogOff });
    delete this._id;

    this.emit("logoff", this);
  }
}

export default Session;
