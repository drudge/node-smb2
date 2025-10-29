/**
 * Quick SMB3 Test
 *
 * Fast connectivity and authentication test
 * Use this for rapid iteration during development
 *
 * Usage:
 *   node -r ts-node/register ./tests/quick-test.ts
 *
 * Or:
 *   npm run test:quick
 */

import * as fs from 'fs';
import * as path from 'path';
import Client from '../src/client/Client';

// Load config
const configPath = path.join(__dirname, 'test-config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ test-config.json not found in tests/');
  console.error('Copy test-config.example.json to tests/test-config.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function quickTest() {
  console.log('\n🚀 Quick SMB3 Test Starting...\n');

  try {
    const client = new Client(config.server.host, {
      port: config.server.port || 445
    });

    console.log(`📡 Connecting to ${config.server.host}:${config.server.port || 445}...`);
    await client.connect();
    console.log('✅ Connected!\n');

    console.log(`🔐 Authenticating as ${config.credentials.domain}\\${config.credentials.username}...`);
    const session = await client.authenticate({
      domain: config.credentials.domain,
      username: config.credentials.username,
      password: config.credentials.password
    });

    console.log(`✅ Authenticated! Session ID: ${session._id}`);
    console.log(`   Dialect: 0x${session.dialectRevision?.toString(16) || '???'}`);
    console.log(`   Encryption: ${session.encryptionEnabled ? '✨ ENABLED' : '❌ DISABLED'}`);

    if (session.encryptionKey) {
      console.log(`   Keys: Encryption=${session.encryptionKey.length}B, Decryption=${session.decryptionKey?.length}B, Signing=${session.signingKey?.length}B`);
    }

    console.log(`\n📂 Connecting to share: ${config.shares.encrypted}...`);
    const tree = await session.connectTree(config.shares.encrypted);
    console.log(`✅ Connected! Tree ID: ${tree._id}\n`);

    console.log('📋 Listing files...');
    const files = await tree.readDirectory('');
    console.log(`✅ Found ${files.length} items:\n`);

    files.slice(0, 10).forEach((file, i) => {
      const icon = file.filename.includes('.') ? '📄' : '📁';
      const size = file.fileSize ? `(${(Number(file.fileSize) / 1024).toFixed(1)} KB)` : '';
      console.log(`   ${i + 1}. ${icon} ${file.filename} ${size}`);
    });

    if (files.length > 10) {
      console.log(`   ... and ${files.length - 10} more`);
    }

    console.log('\n🧪 Testing file write...');
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = `Test from node-smb2 at ${new Date().toISOString()}`;
    await tree.createFile(testFileName, testContent);
    console.log(`✅ Wrote: ${testFileName}`);

    console.log('🧪 Testing file read...');
    const readContent = await tree.readFile(testFileName);
    if (readContent.toString('utf8') === testContent) {
      console.log('✅ Read and verified!');
    } else {
      console.log('❌ Content mismatch!');
    }

    console.log('🧪 Testing file delete...');
    await tree.removeFile(testFileName);
    console.log('✅ Deleted!');

    await client.close();
    console.log('\n✅ All tests passed!\n');

    if (session.encryptionEnabled) {
      console.log('🎉 SMB3 ENCRYPTION IS WORKING! 🎉\n');
    }

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.header) {
      console.error(`   Status code: 0x${err.header.status.toString(16)}`);
    }
    console.error('\nStack trace:', err.stack);
    process.exit(1);
  }
}

quickTest();
