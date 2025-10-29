# SMB3 Encryption Testing Guide

This directory contains test suites for validating SMB3 encryption functionality with Windows Server 2025.

## Quick Start

### 1. Requirements

- **Node.js**: >=18 (Current version)
- **Windows Server 2025** VM or physical machine
- **Network access** to the Windows Server

### 2. Configure Windows Server

Follow the [Windows Server Setup Guide](../WINDOWS_SERVER_SETUP.md) to:
- Create test shares
- Enable SMB3 encryption
- Create test users
- Configure firewall

### 3. Configure Test Settings

```bash
# Copy example config
cp ../test-config.example.json test-config.json

# Edit with your server details
nano test-config.json  # or your favorite editor
```

**Minimum required config:**

```json
{
  "server": {
    "host": "192.168.1.100"
  },
  "credentials": {
    "domain": "TESTDOMAIN",
    "username": "Administrator",
    "password": "YourPassword123!"
  },
  "shares": {
    "encrypted": "EncryptedShare",
    "unencrypted": "PublicShare"
  }
}
```

### 4. Run Tests

```bash
# Build the project
npm run build

# Quick test (fast iteration)
npm run test:quick

# Full test suite (comprehensive)
npm run test:encryption
```

## Test Suites

### Quick Test (`quick-test.ts`)

Fast connectivity and basic operations test.

**Tests:**
- ✅ Connect to server
- ✅ Authenticate with NTLMv2
- ✅ Detect encryption enablement
- ✅ Connect to encrypted share
- ✅ List files
- ✅ Write/Read/Delete test file

**Run time:** ~2-5 seconds

**Usage:**
```bash
npm run test:quick
```

### Encryption Test Suite (`encryption-test.ts`)

Comprehensive test suite covering all encryption scenarios.

**Tests:**
1. Basic Connection
2. Domain User Authentication (NTLMv2)
3. Local User Authentication
4. Encrypted Share Access
5. File Operations (Upload/Download/Delete)
6. Large File Transfer (1MB)

**Run time:** ~10-30 seconds

**Usage:**
```bash
npm run test:encryption
```

## Expected Output

### Successful Test (with encryption)

```
╔════════════════════════════════════════════════════════════╗
║       SMB3 Encryption Test Suite - Windows Server 2025     ║
╚════════════════════════════════════════════════════════════╝

ℹ️  Server: 192.168.1.100:445
ℹ️  Domain: TESTDOMAIN
ℹ️  User: Administrator
ℹ️  Encrypted Share: EncryptedShare

============================================================
Test 1: Basic Connection
============================================================

ℹ️  Connecting to 192.168.1.100:445...
✅ Connected to server
✅ Connection closed cleanly

============================================================
Test 2: Domain User Authentication (NTLMv2)
============================================================

ℹ️  Authenticating as TESTDOMAIN\Administrator...
✅ Authenticated successfully! Session ID: abc123def456
✨ SMB3 ENCRYPTION ENABLED! (Dialect: 0x302)

...

============================================================
Test Summary
============================================================

Total Tests: 6
✅ Passed: 6

Success Rate: 100.0%

🎉 ALL TESTS PASSED! SMB3 encryption is working perfectly!
```

## Troubleshooting

### "test-config.json not found"

**Solution:**
```bash
cp ../test-config.example.json test-config.json
# Then edit test-config.json with your settings
```

### "Connection failed: ECONNREFUSED"

**Causes:**
- Windows Server not running
- Firewall blocking port 445
- Wrong IP address

**Solutions:**
```powershell
# On Windows Server, check SMB is running
Get-Service LanmanServer

# Check firewall
Get-NetFirewallRule -DisplayName "*SMB*"

# Test port from Linux
nc -zv 192.168.1.100 445
```

### "Logon Failure" (0xC000006D)

**Causes:**
- Wrong username/password
- Wrong domain name
- NTLMv2 not enabled

**Solutions:**
- Double-check credentials in test-config.json
- Ensure domain name is correct (use "" for local users)
- On Windows Server:
  ```powershell
  # Ensure NTLMv2 is enabled
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" -Name "LmCompatibilityLevel" -Value 5
  ```

### "ACCESS_DENIED" (0xC0000022)

**Cause:** Old version without encryption support

**Solution:** Ensure you're using the latest node-smb2 with encryption support

### "Encryption not enabled"

**Cause:** Server not requiring encryption

**Solution:**
```powershell
# On Windows Server, enable encryption for share
Set-SmbShare -Name "EncryptedShare" -EncryptData $true

# Verify
Get-SmbShare -Name "EncryptedShare" | Select-Object Name, EncryptData
```

## Test Configuration Reference

### Complete test-config.json

```json
{
  "server": {
    "host": "192.168.1.100",
    "port": 445,
    "comment": "Windows Server 2025 IP"
  },
  "credentials": {
    "domain": "TESTDOMAIN",
    "username": "Administrator",
    "password": "SecurePassword123!",
    "comment": "Domain admin credentials"
  },
  "localUser": {
    "domain": "",
    "username": "LocalAdmin",
    "password": "LocalPassword123!",
    "comment": "Local user for testing (optional)"
  },
  "shares": {
    "encrypted": "EncryptedShare",
    "unencrypted": "PublicShare",
    "comment": "SMB share names"
  },
  "tests": {
    "testFile": "test-file.txt",
    "testContent": "Hello from node-smb2!",
    "largeFileSize": 1048576,
    "comment": "Test parameters"
  }
}
```

## Manual Testing

You can also test manually using the demo:

```bash
# Set environment variables
export HOST=192.168.1.100
export DOMAIN=TESTDOMAIN
export USERNAME=Administrator
export PASSWORD=SecurePassword123!
export SHARE=EncryptedShare

# Run the demo
npm start
```

## Debugging

Enable verbose logging:

```typescript
// In your test file
import Client from '../src/client/Client';

const client = new Client(host, { port: 445 });

// The library will log encryption status automatically:
// "Using NTLMv2 authentication"
// "Server supports SMB3 encryption (dialect 302)"
// "SMB3 encryption ENABLED - keys derived successfully"
// "Message encrypted with Transform header"
// "Received encrypted Transform header"
// "Message decrypted successfully"
```

## Continuous Testing

For development, use watch mode:

```bash
# Terminal 1: Watch and rebuild
npm run build -- --watch

# Terminal 2: Run tests repeatedly
watch -n 5 npm run test:quick
```

## Performance Benchmarks

Expected performance on local network (1 Gbps):

| Test | Expected Time | Speed |
|------|---------------|-------|
| Connection | < 100ms | - |
| Authentication | < 200ms | - |
| Share Connect | < 100ms | - |
| File Upload (1KB) | < 50ms | ~20 KB/s |
| File Upload (1MB) | < 2s | ~500 KB/s |
| File Download (1MB) | < 2s | ~500 KB/s |

*Note: Performance with encryption is typically 10-20% slower than unencrypted*

## Test Coverage

Current test coverage:

- ✅ SMB2 Connection
- ✅ NTLMv2 Authentication
- ✅ SMB 3.0 / 3.0.2 Dialect Negotiation
- ✅ Encryption Key Derivation
- ✅ AES-128-CCM Encryption
- ✅ Transform Header Wrapping
- ✅ Signature Verification
- ✅ File Upload/Download
- ✅ Large File Transfer
- ⏳ SMB 3.1.1 (future)
- ⏳ AES-128-GCM (future)

## Contributing Tests

To add new tests:

1. Create test file in `tests/`
2. Add script to `package.json`
3. Document in this README
4. Test against Windows Server 2025
5. Submit PR with test results

## Support

If tests fail:
1. Check Windows Server logs
2. Verify network connectivity
3. Review configuration
4. Check [Issues](https://github.com/drudge/node-smb2/issues)
