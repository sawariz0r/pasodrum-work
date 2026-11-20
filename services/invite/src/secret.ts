import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function keyFrom(secret: string): Buffer {
  if (secret.length < 32) throw new Error('INVITE_SECRET must be at least 32 characters');
  return Buffer.from(hkdfSync('sha256', secret, '', 'pasodrum-invite/v1', 32));
}

// AES-256-GCM; stored as base64url "iv.tag.ciphertext".
export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function unseal(key: Buffer, sealed: string): string {
  const [iv, tag, ct] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ct) throw new Error('malformed secret');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
