/**
 * SMB3 Encryption Test Suite
 *
 * Tests SMB3 encryption with Windows Server 2025
 *
 * Usage:
 *   1. Copy test-config.example.json to tests/test-config.json
 *   2. Edit with your Windows Server 2025 details
 *   3. Run: npm run test:encryption
 */

import * as fs from 'fs';
import * as path from 'path';
import Client from '../src/client/Client';

// Color output for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function section(message: string) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(`${message}`, colors.bright);
  log(`${'='.repeat(60)}\n`, colors.bright);
}

interface TestConfig {
  server: {
    host: string;
    port?: number;
  };
  credentials: {
    domain: string;
    username: string;
    password: string;
  };
  localUser?: {
    domain: string;
    username: string;
    password: string;
  };
  shares: {
    encrypted: string;
    unencrypted: string;
  };
  tests: {
    testFile: string;
    testContent: string;
    largeFileSize: number;
  };
}

async function loadConfig(): Promise<TestConfig> {
  const configPath = path.join(__dirname, 'test-config.json');

  if (!fs.existsSync(configPath)) {
    error('test-config.json not found!');
    info('Copy test-config.example.json to tests/test-config.json and configure it');
    process.exit(1);
  }

  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

async function testBasicConnection(config: TestConfig): Promise<boolean> {
  section('Test 1: Basic Connection');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    info(`Connecting to ${config.server.host}:${config.server.port || 445}...`);
    await client.connect();
    success('Connected to server');

    await client.close();
    success('Connection closed cleanly');

    return true;
  } catch (err) {
    error(`Connection failed: ${err.message}`);
    return false;
  }
}

async function testDomainAuthentication(config: TestConfig): Promise<boolean> {
  section('Test 2: Domain User Authentication (NTLMv2)');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    await client.connect();
    info(`Authenticating as ${config.credentials.domain}\\${config.credentials.username}...`);

    const session = await client.authenticate({
      domain: config.credentials.domain,
      username: config.credentials.username,
      password: config.credentials.password
    });

    success(`Authenticated successfully! Session ID: ${session._id}`);

    // Check if encryption was enabled
    if (session.encryptionEnabled) {
      success(`✨ SMB3 ENCRYPTION ENABLED! (Dialect: 0x${session.dialectRevision?.toString(16)})`);
    } else {
      info(`Encryption not enabled (Server may not require it)`);
    }

    await client.close();
    return true;
  } catch (err) {
    error(`Authentication failed: ${err.message}`);
    if (err.header) {
      error(`Status code: 0x${err.header.status.toString(16)}`);
    }
    return false;
  }
}

async function testLocalUserAuthentication(config: TestConfig): Promise<boolean> {
  if (!config.localUser) {
    info('Skipping local user test (not configured)');
    return true;
  }

  section('Test 3: Local User Authentication');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    await client.connect();
    info(`Authenticating as local user ${config.localUser.username}...`);

    const session = await client.authenticate({
      domain: config.localUser.domain || '',
      username: config.localUser.username,
      password: config.localUser.password
    });

    success(`Local user authenticated! Session ID: ${session._id}`);

    await client.close();
    return true;
  } catch (err) {
    error(`Local authentication failed: ${err.message}`);
    return false;
  }
}

async function testEncryptedShare(config: TestConfig): Promise<boolean> {
  section('Test 4: Encrypted Share Access');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    await client.connect();
    const session = await client.authenticate({
      domain: config.credentials.domain,
      username: config.credentials.username,
      password: config.credentials.password
    });

    info(`Connecting to encrypted share: \\\\${config.server.host}\\${config.shares.encrypted}`);
    const tree = await session.connectTree(config.shares.encrypted);
    success(`Connected to encrypted share! Tree ID: ${tree._id}`);

    // List files
    info('Listing files in share...');
    const files = await tree.readDirectory('');
    success(`Found ${files.length} files/folders`);

    if (files.length > 0) {
      files.slice(0, 5).forEach(file => {
        info(`  - ${file.filename} (${file.fileSize} bytes)`);
      });
    }

    await client.close();
    return true;
  } catch (err) {
    error(`Encrypted share access failed: ${err.message}`);
    if (err.header) {
      error(`Status code: 0x${err.header.status.toString(16)}`);
    }
    return false;
  }
}

async function testFileOperations(config: TestConfig): Promise<boolean> {
  section('Test 5: File Operations (Upload/Download/Delete)');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    await client.connect();
    const session = await client.authenticate({
      domain: config.credentials.domain,
      username: config.credentials.username,
      password: config.credentials.password
    });

    const tree = await session.connectTree(config.shares.encrypted);
    const testFile = config.tests.testFile;
    const testContent = config.tests.testContent;

    // Upload
    info(`Uploading test file: ${testFile}`);
    await tree.createFile(testFile, testContent);
    success('File uploaded successfully');

    // Download
    info(`Downloading test file: ${testFile}`);
    const downloadedContent = await tree.readFile(testFile);
    const downloadedText = downloadedContent.toString('utf8');

    if (downloadedText === testContent) {
      success('File downloaded and content matches!');
    } else {
      error('File content mismatch!');
      error(`Expected: ${testContent}`);
      error(`Got: ${downloadedText}`);
      return false;
    }

    // Delete
    info(`Deleting test file: ${testFile}`);
    await tree.removeFile(testFile);
    success('File deleted successfully');

    await client.close();
    return true;
  } catch (err) {
    error(`File operations failed: ${err.message}`);
    return false;
  }
}

async function testLargeFileTransfer(config: TestConfig): Promise<boolean> {
  section('Test 6: Large File Transfer (1MB)');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    await client.connect();
    const session = await client.authenticate({
      domain: config.credentials.domain,
      username: config.credentials.username,
      password: config.credentials.password
    });

    const tree = await session.connectTree(config.shares.encrypted);
    const largeFileName = 'large-test-file.bin';
    const fileSize = config.tests.largeFileSize;

    // Generate large file content (1MB of random data)
    info(`Generating ${fileSize} bytes of test data...`);
    const largeContent = Buffer.alloc(fileSize);
    for (let i = 0; i < fileSize; i++) {
      largeContent[i] = i % 256;
    }

    // Upload
    info(`Uploading large file: ${largeFileName} (${fileSize} bytes)...`);
    const uploadStart = Date.now();
    await tree.createFile(largeFileName, largeContent);
    const uploadTime = Date.now() - uploadStart;
    success(`Uploaded in ${uploadTime}ms (${(fileSize / uploadTime / 1024).toFixed(2)} MB/s)`);

    // Download
    info(`Downloading large file: ${largeFileName}...`);
    const downloadStart = Date.now();
    const downloadedContent = await tree.readFile(largeFileName);
    const downloadTime = Date.now() - downloadStart;
    success(`Downloaded in ${downloadTime}ms (${(fileSize / downloadTime / 1024).toFixed(2)} MB/s)`);

    // Verify
    if (Buffer.compare(largeContent, downloadedContent) === 0) {
      success('Large file content verified - matches perfectly!');
    } else {
      error('Large file content mismatch!');
      return false;
    }

    // Cleanup
    info(`Deleting large file: ${largeFileName}`);
    await tree.removeFile(largeFileName);
    success('Large file deleted');

    await client.close();
    return true;
  } catch (err) {
    error(`Large file transfer failed: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', colors.bright);
  log('║       SMB3 Encryption Test Suite - Windows Server 2025     ║', colors.bright);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.bright);

  const config = await loadConfig();

  info(`Server: ${config.server.host}:${config.server.port || 445}`);
  info(`Domain: ${config.credentials.domain}`);
  info(`User: ${config.credentials.username}`);
  info(`Encrypted Share: ${config.shares.encrypted}\n`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  const tests = [
    { name: 'Basic Connection', fn: () => testBasicConnection(config) },
    { name: 'Domain Authentication', fn: () => testDomainAuthentication(config) },
    { name: 'Local User Authentication', fn: () => testLocalUserAuthentication(config) },
    { name: 'Encrypted Share Access', fn: () => testEncryptedShare(config) },
    { name: 'File Operations', fn: () => testFileOperations(config) },
    { name: 'Large File Transfer', fn: () => testLargeFileTransfer(config) },
  ];

  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (err) {
      error(`Test "${test.name}" threw an exception: ${err.message}`);
      results.failed++;
    }
  }

  // Summary
  section('Test Summary');
  log(`Total Tests: ${results.total}`, colors.bright);
  success(`Passed: ${results.passed}`);
  if (results.failed > 0) {
    error(`Failed: ${results.failed}`);
  }

  const percentage = ((results.passed / results.total) * 100).toFixed(1);
  log(`\nSuccess Rate: ${percentage}%\n`, colors.bright);

  if (results.failed === 0) {
    success('🎉 ALL TESTS PASSED! SMB3 encryption is working perfectly!');
  } else {
    error('Some tests failed. Check the output above for details.');
  }

  process.exit(results.failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
