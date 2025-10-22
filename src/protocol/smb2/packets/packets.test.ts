import Echo from "./Echo";
import Close from "./Close";
import Flush from "./Flush";
import LogOff from "./LogOff";
import Read from "./Read";
import Write from "./Write";
import Create from "./Create";
import Negotiate from "./Negotiate";
import SessionSetup from "./SessionSetup";
import TreeConnect from "./TreeConnect";
import TreeDisconnect from "./TreeDisconnect";
import SetInfo from "./SetInfo";

describe("SMB2 Packet Structures", () => {
  describe("Echo packet", () => {
    it("should have request structure with structureSize", () => {
      expect(Echo.requestStructure.structureSize).toBeDefined();
      expect(Echo.requestStructure.structureSize.size).toBe(2);
      expect(Echo.requestStructure.structureSize.defaultValue).toBe(4);
    });

    it("should have response structure", () => {
      expect(Echo.responseStructure).toBeDefined();
      expect(Echo.responseStructure.structureSize).toBeDefined();
    });

    it("should have reserved field in request", () => {
      expect(Echo.requestStructure.reserved).toBeDefined();
      expect(Echo.requestStructure.reserved.size).toBe(2);
    });
  });

  describe("Close packet", () => {
    it("should have request structure with fileId", () => {
      expect(Close.requestStructure.fileId).toBeDefined();
      expect(Close.requestStructure.fileId.size).toBe(16);
      expect(Close.requestStructure.fileId.encoding).toBe("hex");
    });

    it("should have response structure with timestamps", () => {
      expect(Close.responseStructure.creationTime).toBeDefined();
      expect(Close.responseStructure.lastAccessTime).toBeDefined();
      expect(Close.responseStructure.lastWriteTime).toBeDefined();
      expect(Close.responseStructure.changeTime).toBeDefined();
    });

    it("should have file size fields in response", () => {
      expect(Close.responseStructure.allocationSize).toBeDefined();
      expect(Close.responseStructure.endOfFile).toBeDefined();
    });

    it("should have fileAttributes in response", () => {
      expect(Close.responseStructure.fileAttributes).toBeDefined();
      expect(Close.responseStructure.fileAttributes.size).toBe(4);
    });
  });

  describe("Flush packet", () => {
    it("should have request structure", () => {
      expect(Flush.requestStructure).toBeDefined();
      expect(Flush.requestStructure.structureSize).toBeDefined();
    });

    it("should have response structure", () => {
      expect(Flush.responseStructure).toBeDefined();
    });
  });

  describe("LogOff packet", () => {
    it("should have request structure", () => {
      expect(LogOff.requestStructure).toBeDefined();
      expect(LogOff.requestStructure.structureSize).toBeDefined();
    });

    it("should have response structure", () => {
      expect(LogOff.responseStructure).toBeDefined();
    });
  });

  describe("Read packet", () => {
    it("should have request structure", () => {
      expect(Read.requestStructure).toBeDefined();
      expect(Read.requestStructure.length).toBeDefined();
      expect(Read.requestStructure.offset).toBeDefined();
      expect(Read.requestStructure.fileId).toBeDefined();
    });

    it("should have response structure", () => {
      expect(Read.responseStructure).toBeDefined();
      expect(Read.responseStructure.dataOffset).toBeDefined();
      expect(Read.responseStructure.dataLength).toBeDefined();
    });
  });

  describe("Write packet", () => {
    it("should have request structure", () => {
      expect(Write.requestStructure).toBeDefined();
      expect(Write.requestStructure.dataOffset).toBeDefined();
      expect(Write.requestStructure.length).toBeDefined();
      expect(Write.requestStructure.offset).toBeDefined();
      expect(Write.requestStructure.fileId).toBeDefined();
    });

    it("should have response structure", () => {
      expect(Write.responseStructure).toBeDefined();
      expect(Write.responseStructure.count).toBeDefined();
    });
  });

  describe("Create packet", () => {
    it("should have request structure with file attributes", () => {
      expect(Create.requestStructure).toBeDefined();
      expect(Create.requestStructure.requestedOplockLevel).toBeDefined();
      expect(Create.requestStructure.desiredAccess).toBeDefined();
      expect(Create.requestStructure.fileAttributes).toBeDefined();
      expect(Create.requestStructure.shareAccess).toBeDefined();
      expect(Create.requestStructure.createDisposition).toBeDefined();
      expect(Create.requestStructure.createOptions).toBeDefined();
    });

    it("should have response structure with fileId", () => {
      expect(Create.responseStructure).toBeDefined();
      expect(Create.responseStructure.fileId).toBeDefined();
    });

    it("should have response timestamps", () => {
      expect(Create.responseStructure.creationTime).toBeDefined();
      expect(Create.responseStructure.lastAccessTime).toBeDefined();
      expect(Create.responseStructure.lastWriteTime).toBeDefined();
      expect(Create.responseStructure.changeTime).toBeDefined();
    });
  });

  describe("Negotiate packet", () => {
    it("should have request structure with dialects", () => {
      expect(Negotiate.requestStructure).toBeDefined();
      expect(Negotiate.requestStructure.dialectCount).toBeDefined();
      expect(Negotiate.requestStructure.securityMode).toBeDefined();
      expect(Negotiate.requestStructure.capabilities).toBeDefined();
    });

    it("should have response structure", () => {
      expect(Negotiate.responseStructure).toBeDefined();
      expect(Negotiate.responseStructure.dialectRevision).toBeDefined();
      expect(Negotiate.responseStructure.securityMode).toBeDefined();
    });
  });

  describe("SessionSetup packet", () => {
    it("should have request structure", () => {
      expect(SessionSetup.requestStructure).toBeDefined();
      expect(SessionSetup.requestStructure.flags).toBeDefined();
      expect(SessionSetup.requestStructure.securityMode).toBeDefined();
      expect(SessionSetup.requestStructure.capabilities).toBeDefined();
    });

    it("should have response structure with sessionFlags", () => {
      expect(SessionSetup.responseStructure).toBeDefined();
      expect(SessionSetup.responseStructure.sessionFlags).toBeDefined();
    });
  });

  describe("TreeConnect packet", () => {
    it("should have request structure with path", () => {
      expect(TreeConnect.requestStructure).toBeDefined();
      expect(TreeConnect.requestStructure.reserved).toBeDefined();
      expect(TreeConnect.requestStructure.pathOffset).toBeDefined();
      expect(TreeConnect.requestStructure.pathLength).toBeDefined();
    });

    it("should have response structure with shareType", () => {
      expect(TreeConnect.responseStructure).toBeDefined();
      expect(TreeConnect.responseStructure.shareType).toBeDefined();
      expect(TreeConnect.responseStructure.shareFlags).toBeDefined();
      expect(TreeConnect.responseStructure.capabilities).toBeDefined();
    });
  });

  describe("TreeDisconnect packet", () => {
    it("should have request structure", () => {
      expect(TreeDisconnect.requestStructure).toBeDefined();
      expect(TreeDisconnect.requestStructure.structureSize).toBeDefined();
    });

    it("should have response structure", () => {
      expect(TreeDisconnect.responseStructure).toBeDefined();
    });
  });

  describe("SetInfo packet", () => {
    it("should have request structure with info type", () => {
      expect(SetInfo.requestStructure).toBeDefined();
      expect(SetInfo.requestStructure.infoType).toBeDefined();
      expect(SetInfo.requestStructure.fileInfoClass).toBeDefined();
      expect(SetInfo.requestStructure.fileId).toBeDefined();
    });

    it("should have response structure", () => {
      expect(SetInfo.responseStructure).toBeDefined();
      expect(SetInfo.responseStructure.structureSize).toBeDefined();
    });
  });
});
