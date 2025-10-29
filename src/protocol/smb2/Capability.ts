enum Capability {
  DistributedFileSystem = 0x00000001,
  Leasing = 0x00000002,
  MultiCreditSupport = 0x00000004,
  MultiChannel = 0x00000008,
  PersistentHandles = 0x00000010,
  DirectoryLeasing = 0x00000020,
  Encryption = 0x00000040
}

export default Capability;