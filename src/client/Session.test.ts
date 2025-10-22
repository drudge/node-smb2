import Session from "./Session";
import Client from "./Client";
import { EventEmitter } from "events";

describe("Session", () => {
  let mockClient: Client;
  let session: Session;

  beforeEach(() => {
    mockClient = {
      _id: "test-client-id",
      createRequest: jest.fn().mockReturnValue({
        header: { messageId: 0n },
        serialize: jest.fn().mockReturnValue(Buffer.from("test")),
      }),
      send: jest.fn().mockResolvedValue({
        header: { status: 0 },
        body: {},
      }),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    } as any;

    session = new Session(mockClient);
  });

  describe("Constructor", () => {
    it("should initialize with client reference", () => {
      expect(session.client).toBe(mockClient);
    });

    it("should not have session ID until authenticated", () => {
      const session1 = new Session(mockClient);

      // Session ID is set during authentication, not in constructor
      expect(session1._id).toBeUndefined();
    });

    it("should initialize with unauthenticated state", () => {
      expect(session.authenticated).toBe(false);
    });

    it("should initialize empty connected trees array", () => {
      expect(session.connectedTrees).toEqual([]);
    });
  });

  describe("Event emitter interface", () => {
    it("should be an EventEmitter", () => {
      expect(session).toBeInstanceOf(EventEmitter);
    });

    it("should support authenticate event", () => {
      const handler = jest.fn();
      session.on("authenticate", handler);
      session.emit("authenticate", session);

      expect(handler).toHaveBeenCalledWith(session);
    });

    it("should support logoff event", () => {
      const handler = jest.fn();
      session.on("logoff", handler);
      session.emit("logoff", session);

      expect(handler).toHaveBeenCalledWith(session);
    });

    it("should support once listeners", () => {
      const handler = jest.fn();
      session.once("authenticate", handler);

      session.emit("authenticate", session);
      session.emit("authenticate", session);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Authentication state", () => {
    it("should track authentication state", () => {
      expect(session.authenticated).toBe(false);

      session.authenticated = true;
      expect(session.authenticated).toBe(true);

      session.authenticated = false;
      expect(session.authenticated).toBe(false);
    });
  });

  describe("Tree tracking", () => {
    it("should initialize with empty connected trees", () => {
      expect(session.connectedTrees).toBeDefined();
      expect(Array.isArray(session.connectedTrees)).toBe(true);
      expect(session.connectedTrees).toEqual([]);
    });
  });

  describe("connectTree", () => {
    beforeEach(() => {
      mockClient.host = "testserver";
      mockClient.port = 445;
      mockClient.request = jest.fn().mockResolvedValue({
        header: { treeId: 123, status: 0 },
        body: {},
      });
    });

    it("should create and connect to tree", async () => {
      const tree = await session.connectTree("share");

      expect(tree).toBeDefined();
      expect(tree.session).toBe(session);
      expect(mockClient.request).toHaveBeenCalled();
    });

    it("should track connected trees", async () => {
      const tree = await session.connectTree("share");

      // Tree is added to connectedTrees when it emits connect event
      expect(session.connectedTrees).toContain(tree);
    });
  });

  describe("createRequest", () => {
    beforeEach(() => {
      session._id = "session-123";
    });

    it("should create request with session ID", () => {
      session.createRequest({ type: 1 }, { data: "test" });

      expect(mockClient.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-123",
          type: 1,
        }),
        { data: "test" }
      );
    });

    it("should pass empty objects when no params provided", () => {
      session.createRequest();

      expect(mockClient.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-123",
        }),
        {}
      );
    });
  });

  describe("request", () => {
    beforeEach(() => {
      session._id = "session-123";
      mockClient.request = jest.fn().mockResolvedValue({
        header: { status: 0 },
        body: { result: "success" },
      });
    });

    it("should make request with session ID", async () => {
      const response = await session.request({ type: 1 }, { data: "test" });

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-123",
          type: 1,
        }),
        { data: "test" }
      );
      expect(response.body.result).toBe("success");
    });

    it("should return response from client", async () => {
      const response = await session.request();

      expect(response).toBeDefined();
      expect(response.header.status).toBe(0);
    });
  });

  describe("authenticate", () => {
    beforeEach(() => {
      mockClient.host = "testserver";
      // Create a proper NTLM Type 2 challenge message buffer (56 bytes minimum)
      const challengeBuffer = Buffer.alloc(56);
      challengeBuffer.write("NTLMSSP\x00", 0); // Signature
      challengeBuffer.writeUInt32LE(2, 8); // MessageType = 2 (Challenge)
      challengeBuffer.writeUInt32LE(0, 12); // TargetNameLen
      challengeBuffer.writeUInt32LE(0, 16); // TargetNameMaxLen
      challengeBuffer.writeUInt32LE(48, 20); // TargetNameOffset
      challengeBuffer.writeUInt32LE(0, 24); // NegotiateFlags
      // Challenge nonce at offset 24-32
      challengeBuffer.write("\x01\x02\x03\x04\x05\x06\x07\x08", 24);

      mockClient.request = jest.fn()
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: {},
        })
        .mockResolvedValueOnce({
          header: { sessionId: "new-session-id", status: 0xc0000016 }, // MORE_PROCESSING_REQUIRED
          body: { buffer: challengeBuffer },
        })
        .mockResolvedValue({
          header: { status: 0 },
          body: {},
        });
    });

    it("should authenticate with credentials", async () => {
      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
      });

      expect(session.authenticated).toBe(true);
      expect(session._id).toBe("new-session-id");
      expect(mockClient.request).toHaveBeenCalledTimes(3);
    });

    it("should emit authenticate event", async () => {
      const handler = jest.fn();
      session.on("authenticate", handler);

      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
      });

      expect(handler).toHaveBeenCalledWith(session);
    });

    it("should not re-authenticate if already authenticated", async () => {
      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
      });
      (mockClient.request as jest.Mock).mockClear();

      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
      });

      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it("should support forceNtlmVersion option", async () => {
      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
        forceNtlmVersion: "v2",
      });

      expect(session.authenticated).toBe(true);
    });

    it("should handle sharing violation error", async () => {
      mockClient.request = jest.fn().mockRejectedValue({
        header: { status: 0xc0000043 }, // STATUS_SHARING_VIOLATION
      });

      await expect(
        session.authenticate({
          domain: "DOMAIN",
          username: "user",
          password: "pass",
        })
      ).rejects.toThrow("Sharing violation");
    });

    it("should rethrow other errors", async () => {
      const testError = { header: { status: 0xc0000001 } };
      mockClient.request = jest.fn().mockRejectedValue(testError);

      await expect(
        session.authenticate({
          domain: "DOMAIN",
          username: "user",
          password: "pass",
        })
      ).rejects.toEqual(testError);
    });
  });

  describe("logoff", () => {
    beforeEach(async () => {
      mockClient.host = "testserver";
      mockClient.port = 445;

      // Create a proper NTLM Type 2 challenge message buffer
      const challengeBuffer = Buffer.alloc(56);
      challengeBuffer.write("NTLMSSP\x00", 0);
      challengeBuffer.writeUInt32LE(2, 8);
      challengeBuffer.writeUInt32LE(0, 12);
      challengeBuffer.writeUInt32LE(0, 16);
      challengeBuffer.writeUInt32LE(48, 20);
      challengeBuffer.writeUInt32LE(0, 24);
      challengeBuffer.write("\x01\x02\x03\x04\x05\x06\x07\x08", 24);

      mockClient.request = jest.fn()
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: {},
        })
        .mockResolvedValueOnce({
          header: { sessionId: "session-id", status: 0xc0000016 },
          body: { buffer: challengeBuffer },
        })
        .mockResolvedValue({
          header: { status: 0 },
          body: {},
        });

      await session.authenticate({
        domain: "DOMAIN",
        username: "user",
        password: "pass",
      });
    });

    it("should logoff session", async () => {
      await session.logoff();

      expect(session.authenticated).toBe(false);
      expect(session._id).toBeUndefined();
    });

    it("should emit logoff event", async () => {
      const handler = jest.fn();
      session.on("logoff", handler);

      await session.logoff();

      expect(handler).toHaveBeenCalledWith(session);
    });

    it("should not logoff if not authenticated", async () => {
      await session.logoff();
      (mockClient.request as jest.Mock).mockClear();

      await session.logoff();

      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it("should disconnect all trees before logging off", async () => {
      const tree = await session.connectTree("share");
      const disconnectSpy = jest.spyOn(tree, "disconnect");

      await session.logoff();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});
