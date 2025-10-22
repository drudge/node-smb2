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
});
