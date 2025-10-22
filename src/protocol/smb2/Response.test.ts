import Response from "./Response";
import PacketType from "./PacketType";
import StatusCode from "./StatusCode";

describe("SMB2 Response", () => {
  describe("Constructor", () => {
    it("should create response with header and body", () => {
      const header = {
        type: PacketType.Echo,
        messageId: 0n,
        status: StatusCode.Success,
      };
      const body = { data: "test" };

      const response = new Response(header, body);

      expect(response.header).toBe(header);
      expect(response.body).toBe(body);
      expect(response.typeName).toBe("Echo");
    });

    it("should set type name based on packet type", () => {
      const response1 = new Response({ type: PacketType.Negotiate, status: StatusCode.Success });
      const response2 = new Response({ type: PacketType.SessionSetup, status: StatusCode.Success });
      const response3 = new Response({ type: PacketType.Create, status: StatusCode.Success });

      expect(response1.typeName).toBe("Negotiate");
      expect(response2.typeName).toBe("SessionSetup");
      expect(response3.typeName).toBe("Create");
    });

    it("should handle error status codes", () => {
      const statuses = [
        StatusCode.Pending,
        StatusCode.FileClosed,
        StatusCode.FileNameNotFound,
        StatusCode.SharingViolation,
      ];

      statuses.forEach((status) => {
        const response = new Response({
          type: PacketType.Read,
          status,
        });

        expect(response.header.status).toBe(status);
      });
    });

    it("should handle empty body", () => {
      const response = new Response({
        type: PacketType.LogOff,
        status: StatusCode.Success,
      }, {});

      expect(response.body).toBeDefined();
      expect(response.typeName).toBe("LogOff");
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
      ];

      types.forEach(({ type, name }) => {
        const response = new Response({ type, status: StatusCode.Success });
        expect(response.typeName).toBe(name);
      });
    });
  });

  describe("serialize", () => {
    it("should serialize response to buffer", () => {
      const response = new Response(
        { type: PacketType.Echo, status: StatusCode.Success },
        {}
      );
      const buffer = response.serialize();

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should create valid NetBIOS wrapped packet", () => {
      const response = new Response(
        { type: PacketType.Echo, status: StatusCode.Success },
        {}
      );
      const buffer = response.serialize();

      // NetBIOS header should be present
      expect(buffer.readUInt8(0)).toBe(0x00); // NetBIOS session message
    });
  });

  describe("Status codes", () => {
    it("should preserve success status", () => {
      const response = new Response({
        type: PacketType.Negotiate,
        status: StatusCode.Success,
      });

      expect(response.header.status).toBe(StatusCode.Success);
    });

    it("should preserve pending status", () => {
      const response = new Response({
        type: PacketType.Read,
        status: StatusCode.Pending,
      });

      expect(response.header.status).toBe(StatusCode.Pending);
    });

    it("should preserve error statuses", () => {
      const errorResponse = new Response({
        type: PacketType.Write,
        status: StatusCode.SharingViolation,
      });

      expect(errorResponse.header.status).toBe(StatusCode.SharingViolation);
    });
  });
});
