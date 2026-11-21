// M6: encrypted attachments (Matrix v2: AES-CTR-256, SHA-256 of the ciphertext), so media in encrypted rooms reads in Element X.
export interface SealedFile {
  v: 'v2';
  url: string;
  key: JsonWebKey;
  iv: string;
  hashes: { sha256: string };
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
const bytesOf = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sha256 = async (data: ArrayBuffer) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));

export function sealedFileOf(v: unknown): SealedFile | null {
  const f = v as Partial<SealedFile> | null;
  return f && typeof f === 'object' && typeof f.url === 'string' && typeof f.iv === 'string' && typeof f.key?.k === 'string' && typeof f.hashes?.sha256 === 'string' ? (f as SealedFile) : null;
}

export async function encryptAttachment(plain: ArrayBuffer): Promise<{ data: ArrayBuffer; file: Omit<SealedFile, 'url'> }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt']);
  // The low 8 bytes are the block counter and start at zero.
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8));
  const data = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, plain);
  const { k } = await crypto.subtle.exportKey('jwk', key);
  return { data, file: { v: 'v2', key: { kty: 'oct', key_ops: ['encrypt', 'decrypt'], alg: 'A256CTR', k: k!, ext: true }, iv: b64(iv), hashes: { sha256: await sha256(data) } } };
}

export async function decryptAttachment(data: ArrayBuffer, file: SealedFile): Promise<ArrayBuffer> {
  if ((await sha256(data)) !== file.hashes.sha256.replace(/=+$/, '')) throw new Error('hash mismatch');
  const key = await crypto.subtle.importKey('jwk', { kty: 'oct', alg: 'A256CTR', k: file.key.k!, ext: true }, { name: 'AES-CTR' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-CTR', counter: bytesOf(file.iv), length: 64 }, key, data);
}
