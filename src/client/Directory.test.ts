import Directory from "./Directory";
import Tree from "./Tree";
import { EventEmitter } from "events";
import PacketType from "../protocol/smb2/PacketType";
import StatusCode from "../protocol/smb2/StatusCode";
import DirectoryAccess from "../protocol/smb2/DirectoryAccess";
import CreateDispositionType from "../protocol/smb2/CreateDispositionType";
import FileAttribute from "../protocol/smb2/FileAttribute";

describe("Directory", () => {
  let mockTree: Tree;
  let directory: Directory;

  beforeEach(() => {
    mockTree = {
      request: jest.fn().mockResolvedValue({
        header: {
          status: StatusCode.Success,
          messageId: 1n,
        },
        body: {
          fileId: Buffer.from("test-dir-id"),
        },
      }),
      session: {
        client: {
          host: "test-server",
          on: jest.fn(),
        },
      },
    } as any;

    directory = new Directory(mockTree);
  });

  describe("Constructor", () => {
    it("should initialize with tree reference", () => {
      expect(directory["tree"]).toBe(mockTree);
    });

    it("should be an EventEmitter", () => {
      expect(directory).toBeInstanceOf(EventEmitter);
    });

    it("should not be open initially", () => {
      expect(directory.isOpen).toBe(false);
    });

    it("should not be watching initially", () => {
      expect(directory.watching).toBe(false);
    });
  });

  describe("open", () => {
    it("should open a directory with default options", async () => {
      await directory.open("/test");

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          buffer: expect.any(Buffer),
          desiredAccess:
            DirectoryAccess.ListDirectory |
            DirectoryAccess.ReadAttributes |
            DirectoryAccess.Synchronize,
          fileAttributes: FileAttribute.Directory,
        })
      );
    });

    it("should open directory with custom desired access", async () => {
      await directory.open("/test", {
        desiredAccess: DirectoryAccess.ListDirectory,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          desiredAccess: DirectoryAccess.ListDirectory,
        })
      );
    });

    it("should open directory with custom create disposition", async () => {
      await directory.open("/test", {
        createDisposition: CreateDispositionType.OpenIf,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          createDisposition: CreateDispositionType.OpenIf,
        })
      );
    });

    it("should set directory ID from response", async () => {
      const mockDirId = Buffer.from("dir-id-123");

      (mockTree.request as jest.Mock).mockResolvedValue({
        header: { status: StatusCode.Success, messageId: 1n },
        body: {
          fileId: mockDirId,
        },
      });

      await directory.open("/test");

      expect(directory._id).toBeDefined();
      expect(directory.isOpen).toBe(true);
    });

    it("should emit open event", async () => {
      const openHandler = jest.fn();
      directory.on("open", openHandler);

      await directory.open("/test");

      expect(openHandler).toHaveBeenCalledWith(directory);
    });

    it("should not reopen if already open", async () => {
      await directory.open("/test");
      (mockTree.request as jest.Mock).mockClear();

      await directory.open("/test");

      expect(mockTree.request).not.toHaveBeenCalled();
    });

    it("should convert path to Windows format", async () => {
      await directory.open("/path/to/dir");

      const callArgs = (mockTree.request as jest.Mock).mock.calls[0][1];
      const pathBuffer = callArgs.buffer.toString("ucs2");

      expect(pathBuffer).toContain("\\");
      expect(pathBuffer).not.toContain("/");
    });
  });

  describe("Event emitter interface", () => {
    it("should support open event listeners", () => {
      const handler = jest.fn();
      directory.on("open", handler);

      expect(directory.listenerCount("open")).toBe(1);
    });

    it("should support close event listeners", () => {
      const handler = jest.fn();
      directory.on("close", handler);

      expect(directory.listenerCount("close")).toBe(1);
    });

    it("should support change event listeners", () => {
      const handler = jest.fn();
      directory.on("change", handler);

      expect(directory.listenerCount("change")).toBe(1);
    });

    it("should support once listeners", () => {
      const handler = jest.fn();
      directory.once("open", handler);

      directory.emit("open", directory);
      directory.emit("open", directory);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Directory state", () => {
    it("should track open state", async () => {
      expect(directory.isOpen).toBe(false);

      await directory.open("/test");

      expect(directory.isOpen).toBe(true);
    });

    it("should track watching state", () => {
      expect(directory.watching).toBe(false);

      directory.watching = true;
      expect(directory.watching).toBe(true);
    });

    it("should track directory ID", async () => {
      await directory.open("/test");

      expect(directory._id).toBeDefined();
      // fileId is returned as Buffer from response
      expect(Buffer.isBuffer(directory._id)).toBe(true);
    });
  });

  describe("Path handling", () => {
    it("should handle root path", async () => {
      await directory.open("/");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle relative paths", async () => {
      await directory.open("subdir");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle absolute paths", async () => {
      await directory.open("/absolute/path");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle paths with special characters", async () => {
      await directory.open("folder with spaces");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle nested paths", async () => {
      await directory.open("folder/subfolder/deepfolder");
      expect(mockTree.request).toHaveBeenCalled();
    });
  });

  describe("Access modes", () => {
    it("should support list directory access", async () => {
      await directory.open("/test", {
        desiredAccess: DirectoryAccess.ListDirectory,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          desiredAccess: DirectoryAccess.ListDirectory,
        })
      );
    });

    it("should support read attributes access", async () => {
      await directory.open("/test", {
        desiredAccess: DirectoryAccess.ReadAttributes,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          desiredAccess: DirectoryAccess.ReadAttributes,
        })
      );
    });

    it("should support combined access flags", async () => {
      const combinedAccess =
        DirectoryAccess.ListDirectory | DirectoryAccess.ReadAttributes;

      await directory.open("/test", {
        desiredAccess: combinedAccess,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          desiredAccess: combinedAccess,
        })
      );
    });
  });

  describe("Create dispositions", () => {
    it("should support Open disposition", async () => {
      await directory.open("/test", {
        createDisposition: CreateDispositionType.Open,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          createDisposition: CreateDispositionType.Open,
        })
      );
    });

    it("should support Create disposition", async () => {
      await directory.open("/test", {
        createDisposition: CreateDispositionType.Create,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          createDisposition: CreateDispositionType.Create,
        })
      );
    });

    it("should support OpenOrCreate disposition", async () => {
      await directory.open("/test", {
        createDisposition: CreateDispositionType.OpenIf,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          createDisposition: CreateDispositionType.OpenIf,
        })
      );
    });
  });

  describe("File attributes", () => {
    it("should always use Directory file attribute", async () => {
      await directory.open("/test");

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fileAttributes: FileAttribute.Directory,
        })
      );
    });
  });
});
