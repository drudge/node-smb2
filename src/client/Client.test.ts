import Client from "./Client";
import { EventEmitter } from "events";
import PacketType from "../protocol/smb2/PacketType";
import StatusCode from "../protocol/smb2/StatusCode";

// Mock the Socket
jest.mock("net");

describe("Client", () => {
  let client: Client;

  beforeEach(() => {
    client = new Client("test-server.local", {
      port: 445,
      connectTimeout: 5000,
      requestTimeout: 5000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with correct default values", () => {
      const defaultClient = new Client("localhost");
      expect(defaultClient.host).toBe("localhost");
      expect(defaultClient.port).toBe(445);
      expect(defaultClient.connected).toBe(false);
      expect(defaultClient.nextMessageId).toBe(0n);
      expect(defaultClient.connectTimeout).toBe(5000);
      expect(defaultClient.requestTimeout).toBe(5000);
    });

    it("should apply custom options", () => {
      const customClient = new Client("custom-host", {
        port: 8445,
        connectTimeout: 10000,
        requestTimeout: 15000,
      });
      expect(customClient.host).toBe("custom-host");
      expect(customClient.port).toBe(8445);
      expect(customClient.connectTimeout).toBe(10000);
      expect(customClient.requestTimeout).toBe(15000);
    });

    it("should generate unique client IDs", () => {
      const client1 = new Client("host1");
      const client2 = new Client("host2");
      expect(client1._id).toBeTruthy();
      expect(client2._id).toBeTruthy();
      expect(client1._id).not.toBe(client2._id);
    });

    it("should initialize empty collections", () => {
      expect(client.sessions).toEqual([]);
      expect(client.responseMap.size).toBe(0);
      expect(client.responseCallbackMap.size).toBe(0);
      expect(client.requestTimeoutIdMap.size).toBe(0);
    });
  });

  describe("createRequest", () => {
    it("should create request with auto-incrementing message ID", () => {
      const req1 = client.createRequest({ type: PacketType.Echo });
      const req2 = client.createRequest({ type: PacketType.Echo });
      const req3 = client.createRequest({ type: PacketType.Echo });

      expect(req1.header.messageId).toBe(0n);
      expect(req2.header.messageId).toBe(1n);
      expect(req3.header.messageId).toBe(2n);
      expect(client.nextMessageId).toBe(3n);
    });

    it("should include client ID in request header", () => {
      const req = client.createRequest({ type: PacketType.Echo });
      expect(req.header.clientId).toBe(client._id);
    });

    it("should merge custom header values", () => {
      const req = client.createRequest({
        type: PacketType.Create,
        sessionId: "test-session",
        treeId: 12345,
      });

      expect(req.header.type).toBe(PacketType.Create);
      expect(req.header.sessionId).toBe("test-session");
      expect(req.header.treeId).toBe(12345);
    });

    it("should accept minimal header with type", () => {
      const req = client.createRequest({ type: PacketType.Echo });
      expect(req.header.messageId).toBe(0n);
      expect(req.header.clientId).toBe(client._id);
      expect(req.header.type).toBe(PacketType.Echo);
    });
  });

  describe("request", () => {
    it("should create and send request", async () => {
      const mockSend = jest.spyOn(client, "send").mockResolvedValue({} as any);

      await client.request({ type: PacketType.Echo }, {});

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe("send", () => {
    it("should throw error when not connected", async () => {
      const req = client.createRequest({ type: PacketType.Echo });

      await expect(client.send(req)).rejects.toThrow("not_connected");
    });

    it("should reject on request timeout", async () => {
      // Mock connected state
      client.connected = true;
      client.socket = {
        write: jest.fn(),
      } as any;

      const req = client.createRequest({ type: PacketType.Echo });

      // Set very short timeout
      client.requestTimeout = 10;

      await expect(client.send(req)).rejects.toThrow(/request_timeout/);
    }, 10000);
  });

  describe("onData", () => {
    it("should handle incoming data chunks", () => {
      const mockResponse = {
        header: {
          messageId: 0n,
          type: PacketType.Echo,
          status: StatusCode.Success,
        },
      };

      const parseSpy = jest.spyOn(require("../protocol/smb2/Response").default, "parse")
        .mockReturnValue(mockResponse);

      jest.spyOn(require("../protocol/Packet").default, "getChunks")
        .mockReturnValue({
          chunks: [Buffer.from("test")],
          restChunk: Buffer.alloc(0),
        });

      const onResponseSpy = jest.spyOn(client, "onResponse");

      client.onData(Buffer.from("test"));

      expect(onResponseSpy).toHaveBeenCalled();
    });

    it("should handle multi-chunk data", () => {
      jest.spyOn(require("../protocol/Packet").default, "getChunks")
        .mockReturnValue({
          chunks: [Buffer.from("chunk1"), Buffer.from("chunk2")],
          restChunk: Buffer.alloc(0),
        });

      const parseSpy = jest.spyOn(require("../protocol/smb2/Response").default, "parse")
        .mockReturnValue({
          header: { messageId: 0n, type: PacketType.Echo, status: StatusCode.Success },
        });

      const onResponseSpy = jest.spyOn(client, "onResponse");

      client.onData(Buffer.from("test"));

      expect(onResponseSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle partial chunks with rest", () => {
      const restChunk = Buffer.from("partial");

      jest.spyOn(require("../protocol/Packet").default, "getChunks")
        .mockReturnValue({
          chunks: [Buffer.from("complete")],
          restChunk,
        });

      jest.spyOn(require("../protocol/smb2/Response").default, "parse")
        .mockReturnValue({
          header: { messageId: 0n, type: PacketType.Echo, status: StatusCode.Success },
        });

      client.onData(Buffer.from("test"));

      expect(client.responseRestChunk).toBe(restChunk);
    });

    it("should concatenate with previous rest chunk", () => {
      const previousRest = Buffer.from("previous");
      client.responseRestChunk = previousRest;

      const getChunksSpy = jest.spyOn(require("../protocol/Packet").default, "getChunks")
        .mockReturnValue({
          chunks: [],
          restChunk: Buffer.alloc(0),
        });

      jest.spyOn(require("../protocol/smb2/Response").default, "parse")
        .mockReturnValue({
          header: { messageId: 0n },
        });

      const newData = Buffer.from("new");
      client.onData(newData);

      const expectedBuffer = Buffer.concat([previousRest, newData]);
      expect(getChunksSpy).toHaveBeenCalledWith(expectedBuffer);
    });
  });

  describe("onResponse", () => {
    it("should emit changeNotify events", () => {
      const emitSpy = jest.spyOn(client, "emit");

      const response = {
        header: {
          messageId: 0n,
          type: PacketType.ChangeNotify,
          status: StatusCode.Success,
        },
      } as any;

      client.onResponse(response);

      expect(emitSpy).toHaveBeenCalledWith("changeNotify", response);
    });

    it("should call registered callback for message", () => {
      const callback = jest.fn();
      const messageId = 123n;

      client.responseCallbackMap.set(messageId, callback);

      const response = { header: { messageId } } as any;
      client.onResponse(response);

      expect(callback).toHaveBeenCalledWith(response);
      expect(client.responseCallbackMap.has(messageId)).toBe(false);
    });

    it("should store response if no callback registered", () => {
      const messageId = 456n;
      const response = { header: { messageId } } as any;

      client.onResponse(response);

      expect(client.responseMap.get(messageId)).toBe(response);
    });

    it("should not emit changeNotify for non-success status", () => {
      const emitSpy = jest.spyOn(client, "emit");

      const response = {
        header: {
          messageId: 0n,
          type: PacketType.ChangeNotify,
          status: StatusCode.FileClosed,
        },
      } as any;

      client.onResponse(response);

      expect(emitSpy).not.toHaveBeenCalledWith("changeNotify", expect.anything());
    });
  });

  describe("onError", () => {
    it("should log errors to console", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      const error = new Error("Test error");

      client.onError(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(error);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("onClose", () => {
    it("should set connected to false", () => {
      client.connected = true;
      client.onClose(false);
      expect(client.connected).toBe(false);
    });

    it("should handle close with error", () => {
      client.connected = true;
      client.onClose(true);
      expect(client.connected).toBe(false);
    });
  });

  describe("Event emitter interface", () => {
    it("should support error event listeners", () => {
      const errorHandler = jest.fn();
      client.on("error", errorHandler);

      expect(client.listenerCount("error")).toBe(1);
    });

    it("should support changeNotify event listeners", () => {
      const handler = jest.fn();
      client.on("changeNotify", handler);

      expect(client.listenerCount("changeNotify")).toBe(1);
    });

    it("should support once listeners", () => {
      const handler = jest.fn();
      client.once("error", handler);

      expect(client.listenerCount("error")).toBe(1);
    });
  });
});
