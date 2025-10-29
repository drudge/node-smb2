# Windows Server 2025 Setup Guide for SMB3 Encryption Testing

This guide will help you configure Windows Server 2025 to test SMB3 encryption with node-smb2.

## Prerequisites

- Windows Server 2025 VM or physical machine
- Administrator access
- Network connectivity from your test machine

## Step 1: Configure Network

1. **Set a Static IP Address** (recommended)
   ```powershell
   # Check current IP configuration
   Get-NetIPAddress

   # Set static IP (adjust values for your network)
   New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.1.100 -PrefixLength 24 -DefaultGateway 192.168.1.1
   Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses "8.8.8.8","8.8.4.4"
   ```

2. **Enable File and Printer Sharing**
   ```powershell
   Set-NetFirewallRule -DisplayGroup "File And Printer Sharing" -Enabled True
   ```

3. **Verify SMB is running**
   ```powershell
   Get-Service LanmanServer
   # Should show Status: Running
   ```

## Step 2: Create Test Users

### Domain User (if you have AD)

```powershell
# Create domain test user
New-ADUser -Name "TestUser" -GivenName "Test" -Surname "User" `
    -SamAccountName "testuser" -UserPrincipalName "testuser@yourdomain.local" `
    -AccountPassword (ConvertTo-SecureString "YourSecurePassword123!" -AsPlainText -Force) `
    -Enabled $true -PasswordNeverExpires $true
```

### Local User (standalone server)

```powershell
# Create local test user
$Password = ConvertTo-SecureString "TestPassword123!" -AsPlainText -Force
New-LocalUser -Name "TestUser" -Password $Password -FullName "Test User" `
    -Description "SMB test user" -PasswordNeverExpires -UserMayNotChangePassword

# Add to Administrators group (optional, for full access)
Add-LocalGroupMember -Group "Administrators" -Member "TestUser"
```

## Step 3: Create Test Shares

### Create Encrypted Share (Primary Test Target)

```powershell
# Create directory
New-Item -Path "C:\Shares\EncryptedShare" -ItemType Directory -Force

# Create SMB share with encryption REQUIRED
New-SmbShare -Name "EncryptedShare" -Path "C:\Shares\EncryptedShare" `
    -FullAccess "Everyone" -EncryptData $true

# Verify encryption is enabled
Get-SmbShare -Name "EncryptedShare" | Select-Object Name, EncryptData
```

### Create Unencrypted Share (for comparison)

```powershell
# Create directory
New-Item -Path "C:\Shares\PublicShare" -ItemType Directory -Force

# Create SMB share without encryption
New-SmbShare -Name "PublicShare" -Path "C:\Shares\PublicShare" `
    -FullAccess "Everyone" -EncryptData $false
```

## Step 4: Configure SMB Server Settings

### Enable SMB3 Encryption Globally (Optional)

```powershell
# Require encryption for all connections
Set-SmbServerConfiguration -EncryptData $true -Force

# Or just reject unencrypted access
Set-SmbServerConfiguration -RejectUnencryptedAccess $true -Force
```

### Enable SMB Signing (Recommended)

```powershell
# Require signing for all connections
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
```

### Check Current SMB Configuration

```powershell
Get-SmbServerConfiguration | Select-Object `
    EncryptData, `
    RequireSecuritySignature, `
    RejectUnencryptedAccess, `
    EnableSMB2Protocol
```

## Step 5: Verify SMB3 is Enabled

```powershell
# Check enabled SMB protocols
Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol, EnableSMB2Protocol

# Ensure SMB1 is disabled (security best practice)
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force

# Ensure SMB2/3 is enabled
Set-SmbServerConfiguration -EnableSMB2Protocol $true -Force
```

## Step 6: Configure Firewall

```powershell
# Ensure SMB ports are open
New-NetFirewallRule -DisplayName "SMB In" -Direction Inbound -Protocol TCP -LocalPort 445 -Action Allow
New-NetFirewallRule -DisplayName "SMB Out" -Direction Outbound -Protocol TCP -LocalPort 445 -Action Allow

# Verify firewall rules
Get-NetFirewallRule -DisplayName "SMB*" | Select-Object DisplayName, Enabled, Direction
```

## Step 7: Test Local Access

```powershell
# Test accessing the share locally
Test-Path "\\localhost\EncryptedShare"

# List shares
Get-SmbShare

# Check active sessions
Get-SmbSession
```

## Configuration for node-smb2 Tests

Create `tests/test-config.json` with your server details:

```json
{
  "server": {
    "host": "192.168.1.100",
    "port": 445
  },
  "credentials": {
    "domain": "TESTDOMAIN",
    "username": "TestUser",
    "password": "YourSecurePassword123!"
  },
  "shares": {
    "encrypted": "EncryptedShare",
    "unencrypted": "PublicShare"
  },
  "tests": {
    "testFile": "test-file.txt",
    "testContent": "Hello from node-smb2!",
    "largeFileSize": 1048576
  }
}
```

## Troubleshooting

### Check SMB Server is Running

```powershell
Get-Service LanmanServer
# If stopped:
Start-Service LanmanServer
```

### View SMB Connections

```powershell
# Show current SMB sessions
Get-SmbSession

# Show open files
Get-SmbOpenFile

# Show SMB shares
Get-SmbShare
```

### Test Network Connectivity

```powershell
# From test machine, check if SMB port is accessible
Test-NetConnection -ComputerName 192.168.1.100 -Port 445
```

### Check SMB Encryption Status

```powershell
# View encryption requirements per share
Get-SmbShare | Select-Object Name, EncryptData, Path

# View global encryption settings
Get-SmbServerConfiguration | Select-Object EncryptData, RejectUnencryptedAccess
```

### View SMB Event Logs

```powershell
# SMB Server events
Get-WinEvent -LogName Microsoft-Windows-SMBServer/Operational -MaxEvents 50 | Format-Table TimeCreated, Id, Message -AutoSize

# SMB Security events
Get-WinEvent -LogName Microsoft-Windows-SMBServer/Security -MaxEvents 50 | Format-Table TimeCreated, Id, Message -AutoSize
```

### Common Issues

#### Issue: "Access Denied" (0xC0000022)

**Cause**: Encryption required but client doesn't support it

**Solution**: Ensure node-smb2 is latest version with encryption support

#### Issue: "Logon Failure" (0xC000006D or 0xC0000056D)

**Cause**: Wrong credentials or NTLMv2 configuration

**Solution**:
```powershell
# Ensure NTLMv2 is enabled
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" -Name "LmCompatibilityLevel" -Value 5 -Type DWord
```

#### Issue: Cannot connect to \\\\server\\share

**Cause**: Firewall blocking or SMB disabled

**Solution**:
```powershell
# Check firewall
Get-NetFirewallRule -DisplayName "*SMB*" | Select-Object DisplayName, Enabled

# Enable SMB
Set-SmbServerConfiguration -EnableSMB2Protocol $true -Force
```

## Security Best Practices

1. **Disable SMB1** (security risk)
   ```powershell
   Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
   ```

2. **Require Encryption**
   ```powershell
   Set-SmbServerConfiguration -EncryptData $true -Force
   ```

3. **Require Signing**
   ```powershell
   Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
   ```

4. **Use Strong Passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols

5. **Limit Share Permissions**
   ```powershell
   # Grant specific users only
   New-SmbShare -Name "SecureShare" -Path "C:\Shares\Secure" `
       -ReadAccess "DOMAIN\User1" -ChangeAccess "DOMAIN\Admin1"
   ```

## Verification Checklist

Before running tests, verify:

- [ ] SMB Server is running
- [ ] Test shares are created
- [ ] Encryption is enabled on test share
- [ ] Test user credentials are correct
- [ ] Firewall allows SMB (port 445)
- [ ] Network connectivity from test machine
- [ ] test-config.json is configured

## Running the Tests

From your node-smb2 directory:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run encryption tests
npm run test:encryption
```

## Expected Results

With encryption enabled, you should see:

```
✅ Connected to server
✅ Authenticated successfully!
✨ SMB3 ENCRYPTION ENABLED! (Dialect: 0x302)
✅ Connected to encrypted share!
✅ File uploaded successfully
✅ File downloaded and content matches!
✅ ALL TESTS PASSED!
```

## Additional Resources

- [Microsoft SMB Security Documentation](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security)
- [SMB3 Encryption Overview](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-over-quic)
- [Troubleshooting SMB](https://learn.microsoft.com/en-us/windows-server/storage/file-server/troubleshoot/troubleshooting-smb)
