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
});
