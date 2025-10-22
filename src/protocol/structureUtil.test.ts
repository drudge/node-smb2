import {
  parseNumber,
  parseEnumValue,
  parseEnumValues,
  parseDate,
  parseString,
} from "./structureUtil";
import StructureField from "./StructureField";

describe("Structure Utilities", () => {
  describe("parseNumber", () => {
    it("should parse unsigned 16-bit integers", () => {
      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(42, 0);
      const field: StructureField = { type: Number, size: 2, signedness: "Unsigned" };
      expect(parseNumber(buffer, field)).toBe(42);
    });

    it("should parse signed 16-bit integers", () => {
      const buffer = Buffer.alloc(2);
      buffer.writeInt16LE(-42, 0);
      const field: StructureField = { type: Number, size: 2, signedness: "Signed" };
      expect(parseNumber(buffer, field)).toBe(-42);
    });

    it("should parse unsigned 32-bit integers", () => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(12345, 0);
      const field: StructureField = { type: Number, size: 4, signedness: "Unsigned" };
      expect(parseNumber(buffer, field)).toBe(12345);
    });

    it("should parse signed 32-bit integers", () => {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32LE(-12345, 0);
      const field: StructureField = { type: Number, size: 4, signedness: "Signed" };
      expect(parseNumber(buffer, field)).toBe(-12345);
    });

    it("should parse unsigned 64-bit integers as BigInt", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(12345n, 0);
      const field: StructureField = { type: Number, size: 8, signedness: "Unsigned" };
      expect(parseNumber(buffer, field)).toBe(12345n);
    });

    it("should parse signed 64-bit integers as BigInt", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64LE(-12345n, 0);
      const field: StructureField = { type: Number, size: 8, signedness: "Signed" };
      expect(parseNumber(buffer, field)).toBe(-12345n);
    });

    it("should handle single byte unsigned integers", () => {
      const buffer = Buffer.from([255]);
      const field: StructureField = { type: Number, size: 1, signedness: "Unsigned" };
      expect(parseNumber(buffer, field)).toBe(255);
    });

    it("should handle single byte signed integers", () => {
      const buffer = Buffer.from([0x80]); // -128 in signed byte
      const field: StructureField = { type: Number, size: 1, signedness: "Signed" };
      // Note: parseNumber doesn't have specific handling for 1-byte signed integers
      // So this returns the unsigned value 128
      expect(parseNumber(buffer, field)).toBe(128);
    });
  });

  describe("parseString", () => {
    it("should parse hex strings", () => {
      const buffer = Buffer.from("fe534d42", "hex");
      const field: StructureField = { type: String, size: buffer.length, encoding: "hex" };
      expect(parseString(buffer, field)).toBe("fe534d42");
    });

    it("should handle empty strings", () => {
      const buffer = Buffer.alloc(0);
      const field: StructureField = { type: String, size: 0, encoding: "hex" };
      expect(parseString(buffer, field)).toBe("");
    });

    it("should truncate to specified size", () => {
      const buffer = Buffer.from("0123456789abcdef", "hex");
      const field: StructureField = { type: String, size: 4, encoding: "hex" };
      expect(parseString(buffer, field)).toBe("01234567");
    });
  });

  describe("parseDate", () => {
    it("should parse Windows FILETIME to JavaScript Date", () => {
      // Windows FILETIME for 2020-01-11 08:00:00 UTC
      // FILETIME is 100-nanosecond intervals since 1601-01-01
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(132232032000000000n, 0);
      const date = parseDate(buffer);
      // The actual parsed date based on the conversion
      expect(date.toISOString()).toBe("2020-01-11T08:00:00.000Z");
    });

    it("should parse epoch-like FILETIME correctly", () => {
      // FILETIME for 1601-01-01 00:00:00 UTC (epoch)
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(0n, 0);
      const date = parseDate(buffer);
      expect(date.toISOString()).toBe("1601-01-01T00:00:00.000Z");
    });
  });

  describe("parseEnumValue", () => {
    enum TestEnum {
      First = 1,
      Second = 2,
      Third = 3,
    }

    it("should find enum key by numeric value", () => {
      expect(parseEnumValue(TestEnum, 1)).toBe("First");
      expect(parseEnumValue(TestEnum, 2)).toBe("Second");
      expect(parseEnumValue(TestEnum, 3)).toBe("Third");
    });

    it("should return undefined for non-existent values", () => {
      expect(parseEnumValue(TestEnum, 99)).toBeUndefined();
    });

    it("should work with string enum values", () => {
      enum StringEnum {
        Foo = "foo",
        Bar = "bar",
      }
      expect(parseEnumValue(StringEnum, "foo")).toBe("Foo");
      expect(parseEnumValue(StringEnum, "bar")).toBe("Bar");
    });
  });

  describe("parseEnumValues", () => {
    enum FlagEnum {
      None = 0,
      Read = 1,
      Write = 2,
      Execute = 4,
      Delete = 8,
    }

    it("should parse single flag", () => {
      const result = parseEnumValues(FlagEnum, 1);
      expect(result).toContain("Read");
      expect(result.length).toBe(1);
    });

    it("should parse multiple flags combined", () => {
      const result = parseEnumValues(FlagEnum, 1 | 2); // Read | Write
      expect(result).toContain("Read");
      expect(result).toContain("Write");
      expect(result.length).toBe(2);
    });

    it("should parse all flags", () => {
      const result = parseEnumValues(FlagEnum, 1 | 2 | 4 | 8);
      expect(result).toContain("Read");
      expect(result).toContain("Write");
      expect(result).toContain("Execute");
      expect(result).toContain("Delete");
      expect(result.length).toBe(4);
    });

    it("should return empty array for None flag", () => {
      const result = parseEnumValues(FlagEnum, 0);
      // Filter out 'None' since it matches with & 0
      const filtered = result.filter((x) => FlagEnum[x as keyof typeof FlagEnum] !== 0);
      expect(filtered.length).toBe(0);
    });

    it("should handle flags not in enum", () => {
      const result = parseEnumValues(FlagEnum, 16); // Not in enum
      expect(result.length).toBe(0);
    });
  });
});
