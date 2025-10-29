import Client from '../src/client/Client';
import * as path from 'path';
import * as fs from 'fs';

async function test() {
  const configPath = path.join(__dirname, 'test-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  console.log('Connecting...');
  const client = new Client(config.server.host, { port: config.server.port || 445 });
  await client.connect();

  console.log('Authenticating...');
  const session = await client.authenticate({
    domain: config.credentials.domain,
    username: config.credentials.username,
    password: config.credentials.password
  });

  console.log('Session ID:', session._id);
  console.log('Encryption enabled:', session.encryptionEnabled);
  console.log('Has encryption key:', !!session.encryptionKey);

  console.log('\nAttempting TreeConnect to:', config.shares.encrypted);
  try {
    const tree = await session.connectTree(config.shares.encrypted);
    console.log('SUCCESS! Tree ID:', tree._id);
  } catch (err: any) {
    console.log('FAILED:', err.message || err);
    if (err.header) {
      console.log('Status:', '0x' + err.header.status.toString(16));
    }
  }

  await client.close();
}

test().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
