#!/usr/bin/env node
// Test AES-CCM encryption with known test vectors
import crypto from 'crypto';

// Test vector from RFC 3610 / NIST
function testCCM() {
  const key = Buffer.from('404142434445464748494a4b4c4d4e4f', 'hex');
  const nonce = Buffer.from('10111213141516', 'hex'); // 7 bytes for this test
  const aad = Buffer.from('0001020304050607', 'hex');
  const plaintext = Buffer.from('20212223', 'hex');

  console.log('Testing AES-128-CCM with RFC test vector:');
  console.log('Key:', key.toString('hex'));
  console.log('Nonce (7 bytes):', nonce.toString('hex'));
  console.log('AAD:', aad.toString('hex'));
  console.log('Plaintext:', plaintext.toString('hex'));

  const cipher = crypto.createCipheriv('aes-128-ccm', key, nonce, {
    authTagLength: 8 // This test uses 8-byte tag
  });

  cipher.setAAD(aad, { plaintextLength: plaintext.length });

  const encrypted = cipher.update(plaintext);
  cipher.final();
  const tag = cipher.getAuthTag();

  console.log('\nResult:');
  console.log('Ciphertext:', encrypted.toString('hex'));
  console.log('Auth Tag:', tag.toString('hex'));
  console.log('\nExpected ciphertext: 7162015b');
  console.log('Expected tag: 4dac255d');
}

try {
  testCCM();
} catch (err) {
  console.error('Error:', err);
}
