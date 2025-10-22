import {
  toUnixFilePath,
  toWindowsFilePath,
  toUnixPath,
  toWindowsPath,
  getRandomInt,
  generateGuid,
} from "./util";

describe("Protocol Utilities", () => {
  describe("Path conversion utilities", () => {
    describe("toUnixPath", () => {
      it("should convert Windows backslashes to Unix forward slashes", () => {
        expect(toUnixPath("path\\to\\file")).toBe("path/to/file");
      });

      it("should handle already Unix paths", () => {
        expect(toUnixPath("path/to/file")).toBe("path/to/file");
      });

      it("should handle mixed slashes", () => {
        expect(toUnixPath("path\\to/file")).toBe("path/to/file");
      });

      it("should handle empty string", () => {
        expect(toUnixPath("")).toBe("");
      });
    });

    describe("toWindowsPath", () => {
      it("should convert Unix forward slashes to Windows backslashes", () => {
        expect(toWindowsPath("path/to/file")).toBe("path\\to\\file");
      });

      it("should handle already Windows paths", () => {
        expect(toWindowsPath("path\\to\\file")).toBe("path\\to\\file");
      });

      it("should handle mixed slashes", () => {
        expect(toWindowsPath("path/to\\file")).toBe("path\\to\\file");
      });

      it("should handle empty string", () => {
        expect(toWindowsPath("")).toBe("");
      });
    });

    describe("toUnixFilePath", () => {
      it("should convert relative paths to Unix format with ./ prefix", () => {
        expect(toUnixFilePath("file.txt")).toBe("./file.txt");
        expect(toUnixFilePath("path\\to\\file")).toBe("./path/to/file");
      });

      it("should convert absolute paths starting with /", () => {
        expect(toUnixFilePath("/path/to/file")).toBe("./path/to/file");
      });

      it("should preserve paths already starting with ./", () => {
        expect(toUnixFilePath("./path/to/file")).toBe("./path/to/file");
      });

      it("should handle Windows-style paths", () => {
        expect(toUnixFilePath("C:\\Users\\file")).toBe("./C:/Users/file");
      });
    });

    describe("toWindowsFilePath", () => {
      it("should remove leading dot from relative paths", () => {
        expect(toWindowsFilePath("./file.txt")).toBe("file.txt");
      });

      it("should remove leading slash", () => {
        expect(toWindowsFilePath("/path/to/file")).toBe("path\\to\\file");
      });

      it("should convert to Windows path format", () => {
        expect(toWindowsFilePath("./path/to/file")).toBe("path\\to\\file");
      });

      it("should handle already Windows paths", () => {
        expect(toWindowsFilePath("path\\to\\file")).toBe("path\\to\\file");
      });
    });
  });

  describe("getRandomInt", () => {
    it("should return a number within the specified range", () => {
      const min = 1;
      const max = 10;
      const result = getRandomInt(min, max);
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
    });

    it("should return the same number when min equals max", () => {
      const result = getRandomInt(5, 5);
      expect(result).toBe(5);
    });

    it("should handle negative ranges", () => {
      const min = -10;
      const max = -1;
      const result = getRandomInt(min, max);
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
    });

    it("should return an integer", () => {
      const result = getRandomInt(1, 100);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe("generateGuid", () => {
    it("should generate a 16-byte buffer", () => {
      const guid = generateGuid();
      expect(Buffer.isBuffer(guid)).toBe(true);
      expect(guid.length).toBe(16);
    });

    it("should generate unique GUIDs", () => {
      const guid1 = generateGuid();
      const guid2 = generateGuid();
      expect(guid1.equals(guid2)).toBe(false);
    });

    it("should have correct version field (version 4)", () => {
      const guid = generateGuid();
      const timeHighAndVersion = guid.readUInt16LE(6);
      const version = (timeHighAndVersion >> 12) & 0x0f;
      expect(version).toBe(4);
    });

    it("should have correct variant bits (RFC 4122)", () => {
      const guid = generateGuid();
      const clockSeqHigh = guid.readUInt8(8);
      const variant = (clockSeqHigh >> 6) & 0x03;
      expect(variant).toBe(2); // RFC 4122 variant
    });
  });
});
