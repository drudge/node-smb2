import Tree from "./Tree";
import Session from "./Session";
import Client from "./Client";
import { EventEmitter } from "events";

describe("Tree", () => {
  let mockClient: Client;
  let mockSession: Session;
  let tree: Tree;

  beforeEach(() => {
    mockClient = {
      _id: "test-client-id",
      createRequest: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
    } as any;

    mockSession = {
      client: mockClient,
      _id: "session-id-123",
      createRequest: jest.fn().mockReturnValue({
        header: { messageId: 0n },
        serialize: jest.fn(),
      }),
      request: jest.fn().mockResolvedValue({
        header: { status: 0 },
        body: {},
      }),
    } as any;

    tree = new Tree(mockSession);
  });

  describe("Constructor", () => {
    it("should initialize with session reference", () => {
      expect(tree.session).toBe(mockSession);
    });

    it("should not have tree ID until connected", () => {
      const tree1 = new Tree(mockSession);

      // Tree ID is set when tree connects, not in constructor
      expect(tree1._id).toBeUndefined();
    });

    it("should initialize with disconnected state", () => {
      expect(tree.connected).toBe(false);
      expect(tree.connecting).toBe(false);
    });

    it("should initialize empty file and directory arrays", () => {
      expect(tree.openFiles).toEqual([]);
      expect(tree.openDirectories).toEqual([]);
    });
  });

  describe("Event emitter interface", () => {
    it("should be an EventEmitter", () => {
      expect(tree).toBeInstanceOf(EventEmitter);
    });

    it("should support connect event", () => {
      const handler = jest.fn();
      tree.on("connect", handler);
      tree.emit("connect", tree);

      expect(handler).toHaveBeenCalledWith(tree);
    });

    it("should support disconnect event", () => {
      const handler = jest.fn();
      tree.on("disconnect", handler);
      tree.emit("disconnect", tree);

      expect(handler).toHaveBeenCalledWith(tree);
    });

    it("should support once listeners", () => {
      const handler = jest.fn();
      tree.once("connect", handler);

      tree.emit("connect", tree);
      tree.emit("connect", tree);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Connection state", () => {
    it("should track connection state", () => {
      expect(tree.connected).toBe(false);

      tree.connected = true;
      expect(tree.connected).toBe(true);

      tree.connected = false;
      expect(tree.connected).toBe(false);
    });

    it("should track connecting state", () => {
      expect(tree.connecting).toBe(false);

      tree.connecting = true;
      expect(tree.connecting).toBe(true);

      tree.connecting = false;
      expect(tree.connecting).toBe(false);
    });
  });

  describe("File and Directory tracking", () => {
    it("should track open files", () => {
      expect(tree.openFiles).toBeDefined();
      expect(Array.isArray(tree.openFiles)).toBe(true);
      expect(tree.openFiles).toEqual([]);
    });

    it("should track open directories", () => {
      expect(tree.openDirectories).toBeDefined();
      expect(Array.isArray(tree.openDirectories)).toBe(true);
      expect(tree.openDirectories).toEqual([]);
    });
  });

  describe("connect", () => {
    beforeEach(() => {
      mockSession.client.host = "testserver";
      mockSession.client.port = 445;
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { treeId: 123, status: 0 },
        body: {},
      });
    });

    it("should connect to tree with path", async () => {
      await tree.connect("share");

      expect(mockSession.request).toHaveBeenCalled();
      expect(tree._id).toBe(123);
      expect(tree.connected).toBe(true);
      expect(tree.connecting).toBe(false);
    });

    it("should emit connect event", async () => {
      const handler = jest.fn();
      tree.on("connect", handler);

      await tree.connect("share");

      expect(handler).toHaveBeenCalledWith(tree);
    });

    it("should not reconnect if already connected", async () => {
      await tree.connect("share");
      (mockSession.request as jest.Mock).mockClear();

      await tree.connect("share");

      expect(mockSession.request).not.toHaveBeenCalled();
    });

    it("should not reconnect if currently connecting", async () => {
      const connectPromise = tree.connect("share");
      const secondConnectPromise = tree.connect("share");

      await connectPromise;
      await secondConnectPromise;

      expect(mockSession.request).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    beforeEach(async () => {
      mockSession.client.host = "testserver";
      mockSession.client.port = 445;
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { treeId: 123, status: 0 },
        body: {},
      });
      await tree.connect("share");
    });

    it("should disconnect from tree", async () => {
      await tree.disconnect();

      expect(tree.connected).toBe(false);
    });

    it("should emit disconnect event", async () => {
      const handler = jest.fn();
      tree.on("disconnect", handler);

      await tree.disconnect();

      expect(handler).toHaveBeenCalledWith(tree);
    });

    it("should not disconnect if not connected", async () => {
      await tree.disconnect();
      (mockSession.request as jest.Mock).mockClear();

      await tree.disconnect();

      expect(mockSession.request).not.toHaveBeenCalled();
    });
  });

  describe("createDirectory", () => {
    it("should create directory", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("dir-id") },
      });

      await tree.createDirectory("/test");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("removeDirectory", () => {
    it("should remove directory", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("dir-id") },
      });

      await tree.removeDirectory("/test");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("renameDirectory", () => {
    it("should rename directory", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("dir-id") },
      });

      await tree.renameDirectory("/old", "/new");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("watch", () => {
    it("should watch root directory for changes", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("dir-id") },
      });
      mockSession.client.addListener = jest.fn();
      mockSession.client.removeListener = jest.fn();
      mockSession.client.send = jest.fn().mockResolvedValue({
        header: { status: 0, messageId: 1n },
        body: {},
      });

      const onChange = jest.fn();
      const unwatch = await tree.watch(onChange);

      expect(mockSession.request).toHaveBeenCalled();
      expect(typeof unwatch).toBe("function");

      await unwatch();
    });
  });

  describe("watchDirectory", () => {
    it("should watch specific directory for changes", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("dir-id") },
      });
      mockSession.client.addListener = jest.fn();
      mockSession.client.removeListener = jest.fn();
      mockSession.client.send = jest.fn().mockResolvedValue({
        header: { status: 0, messageId: 1n },
        body: {},
      });

      const onChange = jest.fn();
      const unwatch = await tree.watchDirectory("/test", onChange, true);

      expect(mockSession.request).toHaveBeenCalled();
      expect(typeof unwatch).toBe("function");

      await unwatch();
    });
  });

  describe("readDirectory", () => {
    it("should read directory entries", async () => {
      const mockEntries = [
        { filename: "file1.txt" },
        { filename: "file2.txt" },
        { filename: "." },
        { filename: ".." },
      ];
      (mockSession.request as jest.Mock)
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: { fileId: Buffer.from("dir-id") },
        })
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: {},
          data: mockEntries,
        })
        .mockResolvedValue({
          header: { status: 0 },
          body: {},
        });

      const entries = await tree.readDirectory("/test");

      expect(mockSession.request).toHaveBeenCalled();
      // Directory.read() filters out . and ..
      expect(entries).toEqual([
        { filename: "file1.txt" },
        { filename: "file2.txt" },
      ]);
    });
  });

  describe("exists", () => {
    it("should return true if file exists", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 100n },
      });

      const exists = await tree.exists("/test.txt");

      expect(mockSession.request).toHaveBeenCalled();
      expect(exists).toBe(true);
    });

    it("should return false if file does not exist", async () => {
      (mockSession.request as jest.Mock).mockRejectedValue({
        header: { status: 0xc0000034 }, // FileNameNotFound (StatusCode.FileNameNotFound)
      });

      const exists = await tree.exists("/nonexistent.txt");

      expect(exists).toBe(false);
    });
  });

  describe("createFile", () => {
    it("should create empty file", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      await tree.createFile("/test.txt");

      expect(mockSession.request).toHaveBeenCalled();
    });

    it("should create file with buffer content", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      const content = Buffer.from("test content");
      await tree.createFile("/test.txt", content);

      expect(mockSession.request).toHaveBeenCalled();
    });

    it("should create file with string content", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      await tree.createFile("/test.txt", "test content");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("createFileWriteStream", () => {
    it("should create write stream for file", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      const stream = await tree.createFileWriteStream("/test.txt");

      expect(stream).toBeDefined();
      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("removeFile", () => {
    it("should remove file", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      await tree.removeFile("/test.txt");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("renameFile", () => {
    it("should rename file", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 0n },
      });

      await tree.renameFile("/old.txt", "/new.txt");

      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("readFile", () => {
    it("should read file contents", async () => {
      const mockContent = Buffer.from("test");
      (mockSession.request as jest.Mock)
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: { fileId: Buffer.from("file-id"), endOfFile: BigInt(mockContent.length) },
        })
        .mockResolvedValueOnce({
          header: { status: 0 },
          body: { buffer: mockContent },
        })
        .mockResolvedValue({
          header: { status: 0 },
          body: {},
        });

      const content = await tree.readFile("/test.txt");

      expect(mockSession.request).toHaveBeenCalled();
      expect(content).toEqual(mockContent);
    });
  });

  describe("createFileReadStream", () => {
    it("should create read stream for file", async () => {
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { status: 0 },
        body: { fileId: Buffer.from("file-id"), endOfFile: 100n },
      });

      const stream = await tree.createFileReadStream("/test.txt");

      expect(stream).toBeDefined();
      expect(mockSession.request).toHaveBeenCalled();
    });
  });

  describe("createRequest", () => {
    beforeEach(async () => {
      mockSession.client.host = "testserver";
      mockSession.client.port = 445;
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { treeId: 123, status: 0 },
        body: {},
      });
      await tree.connect("share");
    });

    it("should create request with tree ID", () => {
      tree.createRequest({ type: 1 }, { data: "test" });

      expect(mockSession.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          treeId: 123,
          type: 1,
        }),
        { data: "test" }
      );
    });
  });

  describe("request", () => {
    beforeEach(async () => {
      mockSession.client.host = "testserver";
      mockSession.client.port = 445;
      (mockSession.request as jest.Mock).mockResolvedValue({
        header: { treeId: 123, status: 0 },
        body: {},
      });
      await tree.connect("share");
    });

    it("should make request with tree ID", async () => {
      await tree.request({ type: 1 }, { data: "test" });

      expect(mockSession.request).toHaveBeenCalledWith(
        expect.objectContaining({
          treeId: 123,
          type: 1,
        }),
        { data: "test" }
      );
    });
  });
});
