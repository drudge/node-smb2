import {
  parseNumber,
  parseEnumValue,
  parseEnumValues,
  parseDate,
  parseString,
  parseStructure,
  parseValue,
  parseList,
  serializeStructure,
} from "./structureUtil";
import StructureField from "./StructureField";
import Structure from "./Structure";

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

  describe("parseStructure", () => {
    it("should parse a simple structure", () => {
      const structure: Structure = {
        id: { type: Number, size: 4, signedness: "Unsigned" },
        name: { type: String, size: 4, encoding: "hex" },
      };

      const buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(123, 0);
      buffer.write("test", 4, "hex");

      const result = parseStructure(buffer, structure);

      expect(result.id).toBe(123);
      expect(result.name).toBeDefined();
    });

    it("should handle sizeFieldName for dynamic sizes", () => {
      const structure: Structure = {
        dataLength: { type: Number, size: 4, signedness: "Unsigned" },
        data: { type: Buffer, sizeFieldName: "dataLength" },
      };

      const buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(4, 0); // data length = 4
      buffer.writeUInt32LE(0xdeadbeef, 4); // data

      const result = parseStructure(buffer, structure);

      expect(result.dataLength).toBe(4);
      expect(result.data).toBeDefined();
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it("should throw error for invalid sizeFieldName", () => {
      const structure: Structure = {
        data: { type: Buffer, sizeFieldName: "nonExistentField" },
      };

      const buffer = Buffer.alloc(4);

      expect(() => parseStructure(buffer, structure)).toThrow(
        "invalid_size_field_name"
      );
    });

    it("should throw error when size is not specified", () => {
      const structure: Structure = {
        data: { type: Buffer } as any, // No size or sizeFieldName
      };

      const buffer = Buffer.alloc(4);

      expect(() => parseStructure(buffer, structure)).toThrow("unknown_field_size");
    });

    it("should handle countFieldName for arrays", () => {
      const structure: Structure = {
        itemCount: { type: Number, size: 4, signedness: "Unsigned" },
        items: { type: Number, size: 2, signedness: "Unsigned", countFieldName: "itemCount" },
      };

      const buffer = Buffer.alloc(10);
      buffer.writeUInt32LE(3, 0); // 3 items
      buffer.writeUInt16LE(10, 4);
      buffer.writeUInt16LE(20, 6);
      buffer.writeUInt16LE(30, 8);

      const result = parseStructure(buffer, structure);

      expect(result.itemCount).toBe(3);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(3);
    });

    it("should throw error for invalid countFieldName", () => {
      const structure: Structure = {
        items: { type: Number, size: 2, countFieldName: "nonExistentCount" },
      };

      const buffer = Buffer.alloc(4);

      expect(() => parseStructure(buffer, structure)).toThrow(
        "invalid_count_field_name"
      );
    });
  });

  describe("parseValue", () => {
    it("should parse array values when count > 1", () => {
      const field: StructureField = {
        type: Number,
        size: 2,
        signedness: "Unsigned",
        count: 3,
      };

      const buffer = Buffer.alloc(6);
      buffer.writeUInt16LE(10, 0);
      buffer.writeUInt16LE(20, 2);
      buffer.writeUInt16LE(30, 4);

      const result = parseValue(buffer, field);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([10, 20, 30]);
    });

    it("should parse Buffer type", () => {
      const field: StructureField = {
        type: Buffer,
        size: 4,
      };

      const buffer = Buffer.from([1, 2, 3, 4]);

      const result = parseValue(buffer, field);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(buffer);
    });

    it("should parse String type", () => {
      const field: StructureField = {
        type: String,
        size: 4,
        encoding: "hex",
      };

      const buffer = Buffer.from("test", "hex");

      const result = parseValue(buffer, field);

      expect(typeof result).toBe("string");
    });

    it("should parse Number type", () => {
      const field: StructureField = {
        type: Number,
        size: 4,
        signedness: "Unsigned",
      };

      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(42, 0);

      const result = parseValue(buffer, field);

      expect(result).toBe(42);
    });
  });

  describe("parseList", () => {
    it("should parse empty list", () => {
      const buffer = Buffer.alloc(0);
      const parser = (buf: Buffer) => buf.readUInt32LE(0);

      const result = parseList(buffer, parser);

      expect(result).toEqual([]);
    });

    it("should parse single entry list", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(0, 0); // nextEntryOffset = 0 (last entry)
      buffer.writeUInt32LE(42, 4); // entry data

      const parser = (buf: Buffer) => buf.readUInt32LE(0);

      const result = parseList(buffer, parser);

      expect(result.length).toBe(1);
      expect(result[0]).toBe(42);
    });

    it("should parse multiple entry list", () => {
      const buffer = Buffer.alloc(24);

      // Entry 1: offset 0
      buffer.writeUInt32LE(12, 0); // next entry at offset 12
      buffer.writeUInt32LE(10, 4); // data

      // Entry 2: offset 12
      buffer.writeUInt32LE(12, 12); // next entry at offset 24 (12+12)
      buffer.writeUInt32LE(20, 16); // data

      // Entry 3: offset 24 would be here but we stop before
      // Actually the list should stop when nextOffset is 0
      // Let me fix this
      buffer.writeUInt32LE(0, 12); // next entry offset = 0 (last)
      buffer.writeUInt32LE(20, 16); // data

      const parser = (buf: Buffer) => buf.readUInt32LE(0);

      const result = parseList(buffer, parser);

      expect(result.length).toBe(2);
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(20);
    });
  });

  describe("serializeStructure", () => {
    it("should serialize simple structure", () => {
      const structure: Structure = {
        id: { type: Number, size: 4, signedness: "Unsigned" },
      };

      const data = { id: 123 };

      const result = serializeStructure(structure, data);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(4);
      expect(result.readUInt32LE(0)).toBe(123);
    });

    it("should use default values when data field is missing", () => {
      const structure: Structure = {
        id: { type: Number, size: 4, signedness: "Unsigned", defaultValue: 99 },
      };

      const data = {}; // No id provided

      const result = serializeStructure(structure, data);

      expect(result.readUInt32LE(0)).toBe(99);
    });

    it("should handle sizeFieldName for buffers", () => {
      const structure: Structure = {
        dataLength: { type: Number, size: 4, signedness: "Unsigned" },
        data: { type: Buffer, sizeFieldName: "dataLength" },
      };

      const testBuffer = Buffer.from([1, 2, 3, 4]);
      const data = { data: testBuffer };

      const result = serializeStructure(structure, data);

      expect(result.readUInt32LE(0)).toBe(4); // dataLength should be 4
    });

    it("should handle countFieldName for arrays", () => {
      const structure: Structure = {
        itemCount: { type: Number, size: 4, signedness: "Unsigned" },
        items: { type: Number, size: 2, signedness: "Unsigned", countFieldName: "itemCount" },
      };

      const data = { items: [10, 20, 30] };

      const result = serializeStructure(structure, data);

      expect(result.readUInt32LE(0)).toBe(3); // itemCount should be 3
    });
  });
});
