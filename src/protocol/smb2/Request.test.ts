import Request from "./Request";
import PacketType from "./PacketType";

describe("SMB2 Request", () => {
  describe("Constructor", () => {
    it("should create request with header and body", () => {
      const header = {
        type: PacketType.Echo,
        messageId: 0n,
      };
      const body = {};

      const request = new Request(header, body);

      expect(request.header).toBe(header);
      expect(request.body).toBe(body);
      expect(request.typeName).toBe("Echo");
    });

    it("should set type name based on packet type", () => {
      const request1 = new Request({ type: PacketType.Negotiate });
      const request2 = new Request({ type: PacketType.SessionSetup });
      const request3 = new Request({ type: PacketType.Create });

      expect(request1.typeName).toBe("Negotiate");
      expect(request2.typeName).toBe("SessionSetup");
      expect(request3.typeName).toBe("Create");
    });

    it("should handle empty body", () => {
      const request = new Request({ type: PacketType.LogOff }, {});

      expect(request.body).toBeDefined();
      expect(request.typeName).toBe("LogOff");
    });

    it("should handle various packet types", () => {
      const types = [
        { type: PacketType.TreeConnect, name: "TreeConnect" },
        { type: PacketType.TreeDisconnect, name: "TreeDisconnect" },
        { type: PacketType.Close, name: "Close" },
        { type: PacketType.Flush, name: "Flush" },
        { type: PacketType.Read, name: "Read" },
        { type: PacketType.Write, name: "Write" },
        { type: PacketType.QueryDirectory, name: "QueryDirectory" },
        { type: PacketType.ChangeNotify, name: "ChangeNotify" },
        { type: PacketType.SetInfo, name: "SetInfo" },
      ];

      types.forEach(({ type, name }) => {
        const request = new Request({ type });
        expect(request.typeName).toBe(name);
      });
    });
  });

  describe("serialize", () => {
    it("should serialize request to buffer", () => {
      const request = new Request({ type: PacketType.Echo }, {});
      const buffer = request.serialize();

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should create valid NetBIOS wrapped packet", () => {
      const request = new Request({ type: PacketType.Echo }, {});
      const buffer = request.serialize();

      // NetBIOS header should be 4 bytes (type + length)
      expect(buffer.readUInt8(0)).toBe(0x00); // NetBIOS session message
    });
  });
});
