enum StatusCode {
  Success = 0x00000000,
  Pending = 0x00000103,
  MoreProcessingRequired = 0xc0000016,
  FileNameNotFound = 0xc0000034,
  FilePathNotFound = 0xc000003a,
  FileClosed = 0xc0000128,
  SharingViolation = 0xc0000043 // Status code for "Sharing Violation - File is in use by another process"
}

export default StatusCode;
