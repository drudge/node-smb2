#!/usr/bin/env ts-node
import Client from '../src/client/Client';

async function test() {
  const client = new Client('10.0.7.26', { port: 445 });

  console.log('1. Connecting...');
  await client.connect();

  console.log('2. Authenticating...');
  const session = await client.authenticate({
    domain: 'penree.net',
    username: 'TestUser',
    password: process.env.TEST_PASSWORD || ''
  });

  console.log('✓ Session ID:', session._id);
  console.log('✓ Encryption key:', session.encryptionKey?.toString('hex').substring(0, 32) + '...');
  console.log('✓ Decryption key:', session.decryptionKey?.toString('hex').substring(0, 32) + '...');
  console.log('✓ Signing key:', session.signingKey?.toString('hex').substring(0, 32) + '...');

  console.log('\n3. Attempting TreeConnect to EncryptedShare...');
  try {
    const tree = await session.connectTree('EncryptedShare');
    console.log('✓ SUCCESS! Tree ID:', tree._id);
    await client.close();
  } catch (err: any) {
    console.error('✗ FAILED:', err.message);
    if (err.header) {
      console.error('  Status:', '0x' + err.header.status.toString(16));
    }
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
