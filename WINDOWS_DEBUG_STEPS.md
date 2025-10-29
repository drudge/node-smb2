# Debugging SMB3 Encryption on Windows Server 2025

## Step 1: Enable Wireshark/Packet Capture on the Server

### Option A: Install Wireshark on Server (Recommended)
1. Download Wireshark for Windows: https://www.wireshark.org/download.html
2. Install it on your Windows Server 2025
3. Run Wireshark as Administrator
4. Capture on the network interface
5. Filter: `tcp.port == 445`

### Option B: Use Built-in netsh (No Install Required)
```powershell
# Start capture
netsh trace start capture=yes tracefile=C:\smb_capture.etl maxsize=512

# Run your test from Mac
npm run test:encryption

# Stop capture
netsh trace stop

# Convert to pcap (requires Message Analyzer or etl2pcapng)
```

## Step 2: Check Windows Event Logs

Open PowerShell as Administrator on the server:

```powershell
# View recent SMB Server errors
Get-WinEvent -LogName "Microsoft-Windows-SMBServer/Operational" -MaxEvents 50 |
    Where-Object {$_.TimeCreated -gt (Get-Date).AddMinutes(-5)} |
    Format-Table TimeCreated, Id, Message -AutoSize

# View security events (authentication)
Get-WinEvent -LogName "Microsoft-Windows-SMBServer/Security" -MaxEvents 50 |
    Where-Object {$_.TimeCreated -gt (Get-Date).AddMinutes(-5)} |
    Format-Table TimeCreated, Id, Message -AutoSize

# View detailed SMB events including encryption
Get-WinEvent -LogName "Microsoft-Windows-SMBServer/Connectivity" -MaxEvents 20 |
    Format-Table TimeCreated, Id, Message -AutoSize
```

## Step 3: Enable SMB Audit Logging

```powershell
# Enable detailed auditing
Set-SmbServerConfiguration -AuditSmb1Access $true -Force
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force

# Enable encryption audit events
auditpol /set /subcategory:"File Share" /success:enable /failure:enable
```

## Step 4: Compare with Working Client

### Test from the Server Itself
1. Open Windows Explorer on the server
2. Navigate to `\\localhost\EncryptedShare`
3. This will create encrypted SMB traffic
4. Capture this in Wireshark to see what a working encrypted session looks like

### Or use PowerShell on the server:
```powershell
# This creates a local SMB connection with encryption
New-PSDrive -Name "Z" -PSProvider FileSystem -Root "\\127.0.0.1\EncryptedShare" -Credential (Get-Credential)

# Test operations
Get-ChildItem Z:\
New-Item Z:\test.txt -ItemType File -Value "test"
Remove-Item Z:\test.txt

# Remove drive
Remove-PSDrive Z
```

## Step 5: Capture Both Sessions

1. Start Wireshark capture
2. First, connect from PowerShell (working client) - see packets marked as "working"
3. Then run `npm run test:encryption` from your Mac - see packets marked as "broken"
4. Stop capture
5. Save as `smb3_comparison.pcapng`

### In Wireshark, compare:
- **Transform Headers**: Look for protocol ID `0xFD534D42`
- **Signature field**: Should be 16 bytes
- **Nonce field**: Should be 16 bytes
- **OriginalMessageSize**: Should match encrypted payload length
- **SessionId**: In Transform header vs SMB2 header

## Step 6: Export Capture for Analysis

```powershell
# Save Wireshark capture
# File -> Export -> Save As -> smb3_debug.pcapng

# Can share this file if needed (contains encrypted traffic only)
```

## Step 7: Check SMB Configuration

```powershell
# Verify encryption is required on the share
Get-SmbShare EncryptedShare | Format-List *

# Check server encryption settings
Get-SmbServerConfiguration | Select *Encrypt*

# Verify SMB3 is enabled
Get-SmbServerConfiguration | Select Enable*
```

## Step 8: Temporarily Disable Signing (Test Only)

```powershell
# This might help narrow down the issue
Set-SmbServerConfiguration -RequireSecuritySignature $false -Force

# Run test again
# REMEMBER TO RE-ENABLE:
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
```

## What to Look For

### In Event Logs:
- Event ID **1009**: SMB encryption negotiation
- Event ID **1010**: SMB encryption failures
- Event ID **1024**: Connection rejected
- Event ID **3**: Authentication failures

### In Wireshark (Working vs Our Client):
1. **Transform Header differences**
2. **Auth tag calculation**
3. **AAD structure**
4. **Nonce format**
5. **Message length fields**

## Quick Test Script

Save this as `test-smb-local.ps1` on the server:

```powershell
# Test local SMB encryption
$cred = Get-Credential penree.net\TestUser
$session = New-PSSession -ComputerName localhost -Credential $cred

# This will use SMB3 encryption
Invoke-Command -Session $session -ScriptBlock {
    Get-ChildItem C:\Shares\EncryptedShare
}

Remove-PSSession $session
```

## Expected Output

When you run this on the server, you should see:
1. Successful SMB3 negotiation
2. Successful encryption handshake
3. Transform headers in the capture
4. File listing works

Then compare those packets with what our client sends!
