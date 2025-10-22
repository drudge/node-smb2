/**
 * Example integration tests
 * These tests demonstrate how to test the public API
 * Note: These are simplified examples. Real integration tests would need
 * a test SMB server or mocking infrastructure.
 */

import Client from "../client/Client";

describe("SMB2 Client Examples", () => {
  describe("Client instantiation", () => {
    it("should create a client instance with default options", () => {
      const client = new Client("localhost");

      expect(client).toBeInstanceOf(Client);
      expect(client.host).toBe("localhost");
      expect(client.port).toBe(445);
    });

    it("should create a client with custom port", () => {
      const client = new Client("localhost", { port: 8445 });

      expect(client.host).toBe("localhost");
      expect(client.port).toBe(8445);
    });

    it("should create a client with custom timeouts", () => {
      const client = new Client("localhost", {
        connectTimeout: 10000,
        requestTimeout: 15000,
      });

      expect(client.connectTimeout).toBe(10000);
      expect(client.requestTimeout).toBe(15000);
    });

    it("should initialize with disconnected state", () => {
      const client = new Client("localhost");
      expect(client.connected).toBe(false);
    });

    it("should have a unique client ID", () => {
      const client1 = new Client("localhost");
      const client2 = new Client("localhost");

      expect(client1._id).toBeDefined();
      expect(client2._id).toBeDefined();
      expect(client1._id).not.toBe(client2._id);
    });

    it("should start with messageId of 0", () => {
      const client = new Client("localhost");
      expect(client.nextMessageId).toBe(0n);
    });
  });

  describe("Request creation", () => {
    it("should create a request with incrementing message IDs", () => {
      const client = new Client("localhost");
      const PacketType = require("../protocol/smb2/PacketType").default;

      const req1 = client.createRequest({ type: PacketType.Echo });
      const req2 = client.createRequest({ type: PacketType.Echo });

      expect(req1.header.messageId).toBe(0n);
      expect(req2.header.messageId).toBe(1n);
    });

    it("should create request with custom header", () => {
      const client = new Client("localhost");
      const PacketType = require("../protocol/smb2/PacketType").default;

      const req = client.createRequest({
        type: PacketType.Echo,
        sessionId: "test-session-id",
        treeId: 67890,
      });

      expect(req.header.sessionId).toBe("test-session-id");
      expect(req.header.treeId).toBe(67890);
    });

    it("should include client ID in request", () => {
      const client = new Client("localhost");
      const PacketType = require("../protocol/smb2/PacketType").default;
      const req = client.createRequest({ type: PacketType.Echo });

      expect(req.header.clientId).toBe(client._id);
    });
  });

  describe("Error handling", () => {
    it("should throw error when sending without connection", async () => {
      const client = new Client("localhost");
      const PacketType = require("../protocol/smb2/PacketType").default;
      const req = client.createRequest({ type: PacketType.Echo });

      await expect(client.send(req)).rejects.toThrow("not_connected");
    });
  });
});

describe("Protocol Enums", () => {
  it("should export protocol IDs", () => {
    const { smb2, smb } = require("../protocol/protocolIds");

    expect(smb2).toBeDefined();
    expect(smb).toBeDefined();
    expect(typeof smb2).toBe("string");
    expect(typeof smb).toBe("string");
  });
});

describe("Module exports", () => {
  it("should export Client from main index", () => {
    const smb2 = require("../index");

    expect(smb2.Client).toBeDefined();
    expect(smb2.default.Client).toBeDefined();
  });

  it("should allow creating client from default export", () => {
    const smb2 = require("../index").default;
    const client = new smb2.Client("localhost");

    expect(client).toBeInstanceOf(Client);
  });

  it("should allow creating client from named export", () => {
    const { Client: ClientExport } = require("../index");
    const client = new ClientExport("localhost");

    expect(client).toBeInstanceOf(Client);
  });
});
