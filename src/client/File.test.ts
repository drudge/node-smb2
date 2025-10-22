import File from "./File";
import Tree from "./Tree";
import { EventEmitter } from "events";
import PacketType from "../protocol/smb2/PacketType";
import StatusCode from "../protocol/smb2/StatusCode";
import FilePipePrinterAccess from "../protocol/smb2/FilePipePrinterAccess";
import CreateDispositionType from "../protocol/smb2/CreateDispositionType";

describe("File", () => {
  let mockTree: Tree;
  let file: File;

  beforeEach(() => {
    mockTree = {
      request: jest.fn().mockResolvedValue({
        header: {
          status: StatusCode.Success,
        },
        body: {
          fileId: Buffer.from("test-file-id"),
          fileSize: 1024n,
        },
      }),
      session: {
        client: {
          host: "test-server",
        },
      },
    } as any;

    file = new File(mockTree);
  });

  describe("Constructor", () => {
    it("should initialize with tree reference", () => {
      expect(file["tree"]).toBe(mockTree);
    });

    it("should be an EventEmitter", () => {
      expect(file).toBeInstanceOf(EventEmitter);
    });

    it("should not be open initially", () => {
      expect(file.isOpen).toBeUndefined();
    });
  });

  describe("open", () => {
    it("should open a file with default options", async () => {
      await file.open("test.txt");

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          buffer: expect.any(Buffer),
          desiredAccess: FilePipePrinterAccess.ReadData,
        })
      );
    });

    it("should open file with custom desired access", async () => {
      await file.open("test.txt", {
        desiredAccess: FilePipePrinterAccess.WriteData,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          desiredAccess: FilePipePrinterAccess.WriteData,
        })
      );
    });

    it("should open file with custom create disposition", async () => {
      await file.open("test.txt", {
        createDisposition: CreateDispositionType.OpenIf,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        { type: PacketType.Create },
        expect.objectContaining({
          createDisposition: CreateDispositionType.OpenIf,
        })
      );
    });

    it("should set file ID and size from response", async () => {
      const mockFileId = Buffer.from("file-id-123");
      const mockFileSize = 2048n;

      (mockTree.request as jest.Mock).mockResolvedValue({
        header: { status: StatusCode.Success },
        body: {
          fileId: mockFileId,
          endOfFile: mockFileSize,
        },
      });

      await file.open("test.txt");

      expect(file._id).toBe(mockFileId);
      expect(file.fileSize).toBe(mockFileSize);
      expect(file.isOpen).toBe(true);
    });

    it("should emit open event", async () => {
      const openHandler = jest.fn();
      file.on("open", openHandler);

      await file.open("test.txt");

      expect(openHandler).toHaveBeenCalledWith(file);
    });

    it("should not reopen if already open", async () => {
      await file.open("test.txt");
      (mockTree.request as jest.Mock).mockClear();

      await file.open("test.txt");

      expect(mockTree.request).not.toHaveBeenCalled();
    });

    it("should convert path to Windows format", async () => {
      await file.open("/path/to/file.txt");

      const callArgs = (mockTree.request as jest.Mock).mock.calls[0][1];
      const pathBuffer = callArgs.buffer.toString("ucs2");

      expect(pathBuffer).toContain("\\");
      expect(pathBuffer).not.toContain("/");
    });
  });

  describe("Event emitter interface", () => {
    it("should support open event listeners", () => {
      const handler = jest.fn();
      file.on("open", handler);

      expect(file.listenerCount("open")).toBe(1);
    });

    it("should support close event listeners", () => {
      const handler = jest.fn();
      file.on("close", handler);

      expect(file.listenerCount("close")).toBe(1);
    });

    it("should support once listeners", () => {
      const handler = jest.fn();
      file.once("open", handler);

      file.emit("open", file);
      file.emit("open", file);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("File state", () => {
    it("should track open state", async () => {
      expect(file.isOpen).toBeUndefined();

      await file.open("test.txt");

      expect(file.isOpen).toBe(true);
    });

    it("should track file ID", async () => {
      const fileId = Buffer.from("unique-file-id");
      (mockTree.request as jest.Mock).mockResolvedValue({
        header: { status: StatusCode.Success },
        body: { fileId, fileSize: 0n },
      });

      await file.open("test.txt");

      expect(file._id).toBe(fileId);
    });

    it("should track file size", async () => {
      const fileSize = 4096n;
      (mockTree.request as jest.Mock).mockResolvedValue({
        header: { status: StatusCode.Success },
        body: { fileId: Buffer.from("id"), endOfFile: fileSize },
      });

      await file.open("test.txt");

      expect(file.fileSize).toBe(fileSize);
    });
  });

  describe("Path handling", () => {
    it("should handle relative paths", async () => {
      await file.open("file.txt");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle absolute paths", async () => {
      await file.open("/absolute/path.txt");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle paths with special characters", async () => {
      await file.open("file with spaces.txt");
      expect(mockTree.request).toHaveBeenCalled();
    });

    it("should handle nested paths", async () => {
      await file.open("folder/subfolder/file.txt");
      expect(mockTree.request).toHaveBeenCalled();
    });
  });

  describe("Access modes", () => {
    it("should support read access", async () => {
      await file.open("test.txt", {
        desiredAccess: FilePipePrinterAccess.ReadData,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          desiredAccess: FilePipePrinterAccess.ReadData,
        })
      );
    });

    it("should support write access", async () => {
      await file.open("test.txt", {
        desiredAccess: FilePipePrinterAccess.WriteData,
      });

      expect(mockTree.request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          desiredAccess: FilePipePrinterAccess.WriteData,
        })
      );
    });

    it("should support combined access flags", async () => {
      const combinedAccess =
        FilePipePrinterAccess.ReadData | FilePipePrinterAccess.WriteData;

      await file.open("test.txt", {
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
      await file.open("test.txt", {
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
      await file.open("test.txt", {
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
      await file.open("test.txt", {
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
});
