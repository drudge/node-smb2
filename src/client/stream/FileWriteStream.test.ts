import { FileWriteStream } from "./FileWriteStream";

describe("FileWriteStream", () => {
  let stream: FileWriteStream;
  let writeChunkMock: jest.Mock;
  const maxChunkSize = 1024;

  beforeEach(() => {
    writeChunkMock = jest.fn().mockResolvedValue(undefined);
    stream = new FileWriteStream(maxChunkSize, writeChunkMock);
  });

  describe("Constructor", () => {
    it("should initialize with maxWriteChunkLength", () => {
      expect(stream["maxWriteChunkLength"]).toBe(maxChunkSize);
    });

    it("should initialize fileWriter", () => {
      expect(stream["fileWriter"]).toBe(writeChunkMock);
    });

    it("should initialize bytesWritten to 0", () => {
      expect(stream.bytesWritten).toBe(0);
    });
  });

  describe("_write", () => {
    it("should write chunk and call callback", (done) => {
      const chunk = Buffer.from("test data");

      stream._write(chunk, "buffer", (error) => {
        expect(error).toBeUndefined();
        expect(writeChunkMock).toHaveBeenCalledWith(0, chunk);
        expect(stream.bytesWritten).toBe(chunk.length);
        done();
      });
    });

    it("should increment bytesWritten correctly", (done) => {
      const chunk1 = Buffer.from("first");
      const chunk2 = Buffer.from("second");

      stream._write(chunk1, "buffer", () => {
        stream._write(chunk2, "buffer", () => {
          expect(stream.bytesWritten).toBe(chunk1.length + chunk2.length);
          expect(writeChunkMock).toHaveBeenCalledTimes(2);
          expect(writeChunkMock).toHaveBeenNthCalledWith(1, 0, chunk1);
          expect(writeChunkMock).toHaveBeenNthCalledWith(2, chunk1.length, chunk2);
          done();
        });
      });
    });

    it("should handle write errors", (done) => {
      const error = new Error("Write failed");
      writeChunkMock.mockRejectedValue(error);
      const chunk = Buffer.from("test");

      stream._write(chunk, "buffer", (err) => {
        expect(err).toBe(error);
        done();
      });
    });

    it("should handle large chunks", (done) => {
      const largeChunk = Buffer.alloc(maxChunkSize + 100);

      stream._write(largeChunk, "buffer", (error) => {
        expect(error).toBeUndefined();
        expect(stream.bytesWritten).toBe(largeChunk.length);
        done();
      });
    });
  });

  describe("end", () => {
    it("should emit finish event when ended", (done) => {
      stream.on("finish", () => {
        done();
      });

      stream.end();
    });

    it("should write final chunk before ending", (done) => {
      const chunk = Buffer.from("final");

      stream.on("finish", () => {
        expect(writeChunkMock).toHaveBeenCalledWith(0, chunk);
        expect(stream.bytesWritten).toBe(chunk.length);
        done();
      });

      stream.end(chunk);
    });
  });

  describe("Writable stream interface", () => {
    it("should support pipe from readable stream", (done) => {
      const { Readable } = require("stream");
      const readable = Readable.from([Buffer.from("test")]);

      stream.on("finish", () => {
        expect(writeChunkMock).toHaveBeenCalled();
        done();
      });

      readable.pipe(stream);
    });

    it("should handle backpressure", (done) => {
      const chunk = Buffer.from("test");
      const canWrite = stream.write(chunk);

      // Check if write returns boolean
      expect(typeof canWrite).toBe("boolean");

      stream.end(() => {
        done();
      });
    });
  });
});
