import Tree from "./Tree";
import Client from "./Client";
import { EventEmitter } from "events";
import Dialect from "../protocol/smb2/Dialect";
import Header from "../protocol/smb2/Header";
import { generateGuid } from "../protocol/util";
import * as ntlmUtil from "../protocol/ntlm/util";
import PacketType from "../protocol/smb2/PacketType";

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
      await this.request({
        type: PacketType.Negotiate
      }, {
        dialects: [
          Dialect.Smb202,
          Dialect.Smb210
        ],
        clientGuid: generateGuid(),
      });

      // Initial negotiation includes forceNtlmVersion if specified
      const sessionSetupResponse = await this.request(
        { type: PacketType.SessionSetup },
        { buffer: ntlmUtil.encodeNegotiationMessage(this.client.host, options.domain, options.forceNtlmVersion) }
      );
      this._id = sessionSetupResponse.header.sessionId;

      // Extract server challenge (nonce)
      const nonce = ntlmUtil.decodeChallengeMessage(sessionSetupResponse.body.buffer as Buffer);
      // Send authentication response with version preference
      const authResponse = await this.request(
        { type: PacketType.SessionSetup },
        {
          buffer: ntlmUtil.encodeAuthenticationMessage(
            options.username,
            this.client.host,
            options.domain,
            nonce,
            options.password,
            0, // Let the util determine the flags based on server response
            options.forceNtlmVersion
          )
        }
      );

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