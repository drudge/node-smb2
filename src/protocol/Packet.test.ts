import Packet from "./Packet";
import * as protocolIds from "./protocolIds";

describe("Packet", () => {
  describe("parseProtocolId", () => {
    it("should parse SMB2 protocol ID", () => {
      const buffer = Buffer.from(protocolIds.smb2, "hex");
      const protocolId = Packet.parseProtocolId(buffer);
      expect(protocolId).toBe(protocolIds.smb2);
    });

    it("should parse SMB protocol ID", () => {
      const buffer = Buffer.from(protocolIds.smb, "hex");
      const protocolId = Packet.parseProtocolId(buffer);
      expect(protocolId).toBe(protocolIds.smb);
    });
  });

  describe("getChunks", () => {
    it("should parse a single complete packet", () => {
      const packetData = Buffer.from("test packet data");
      const buffer = Buffer.alloc(4 + packetData.length);

      // Write NetBIOS header (type 0x00 + length in 3 bytes)
      buffer.writeUInt8(0x00, 0);
      buffer.writeUIntBE(packetData.length, 1, 3);
      packetData.copy(buffer, 4);

      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(1);
      expect(chunks[0].toString()).toBe("test packet data");
      expect(restChunk.length).toBe(0);
    });

    it("should parse multiple packets", () => {
      const packet1 = Buffer.from("packet1");
      const packet2 = Buffer.from("packet2");

      const buffer = Buffer.alloc(4 + packet1.length + 4 + packet2.length);
      let offset = 0;

      // First packet
      buffer.writeUInt8(0x00, offset);
      buffer.writeUIntBE(packet1.length, offset + 1, 3);
      packet1.copy(buffer, offset + 4);
      offset += 4 + packet1.length;

      // Second packet
      buffer.writeUInt8(0x00, offset);
      buffer.writeUIntBE(packet2.length, offset + 1, 3);
      packet2.copy(buffer, offset + 4);

      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(2);
      expect(chunks[0].toString()).toBe("packet1");
      expect(chunks[1].toString()).toBe("packet2");
      expect(restChunk.length).toBe(0);
    });

    it("should handle incomplete packets and return rest chunk", () => {
      const completePacket = Buffer.from("complete");
      const incompletePacket = Buffer.from("incomplete data");

      const buffer = Buffer.alloc(4 + completePacket.length + 4 + 5);
      let offset = 0;

      // Complete packet
      buffer.writeUInt8(0x00, offset);
      buffer.writeUIntBE(completePacket.length, offset + 1, 3);
      completePacket.copy(buffer, offset + 4);
      offset += 4 + completePacket.length;

      // Incomplete packet header (says it's longer than what we have)
      buffer.writeUInt8(0x00, offset);
      buffer.writeUIntBE(incompletePacket.length, offset + 1, 3);
      incompletePacket.slice(0, 5).copy(buffer, offset + 4);

      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(1);
      expect(chunks[0].toString()).toBe("complete");
      expect(restChunk.length).toBeGreaterThan(0);
    });

    it("should throw error for invalid NetBIOS type", () => {
      const buffer = Buffer.alloc(10);
      buffer.writeUInt8(0xFF, 0); // Invalid NetBIOS type

      expect(() => Packet.getChunks(buffer)).toThrow("no_net_bios_message");
    });

    it("should handle empty buffer", () => {
      const buffer = Buffer.alloc(0);
      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(0);
      expect(restChunk.length).toBe(0);
    });

    it("should handle buffer with only header", () => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt8(0x00, 0);
      buffer.writeUIntBE(10, 1, 3); // Claims to have 10 bytes but has none

      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(0);
      expect(restChunk.length).toBe(4);
    });

    it("should correctly calculate packet length from NetBIOS header", () => {
      const packetData = Buffer.alloc(256);
      packetData.fill("A");

      const buffer = Buffer.alloc(4 + 256);
      buffer.writeUInt8(0x00, 0);
      buffer.writeUIntBE(256, 1, 3);
      packetData.copy(buffer, 4);

      const { chunks, restChunk } = Packet.getChunks(buffer);

      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(256);
      expect(restChunk.length).toBe(0);
    });
  });
});
