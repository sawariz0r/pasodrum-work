import { describe, expect, it } from 'vitest';
import { encodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api';
import { isStoreMismatch, needsRecoveryKeyOf, parseRecoveryKey, sasEmoji, signOutRiskOf } from './crypto';

describe('recovery key', () => {
  const raw = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256);
  const key = encodeRecoveryKey(raw)!;

  it('ignores spaces, line breaks and dashes', () => {
    expect(parseRecoveryKey(key)).toEqual(raw);
    expect(parseRecoveryKey(`  ${key.replace(/ /g, '\n')}\t`)).toEqual(raw);
    expect(parseRecoveryKey(key.replace(/ /g, '-'))).toEqual(raw);
    expect(parseRecoveryKey(key.replace(/ /g, ''))).toEqual(raw);
    const fullWidth = [...key].map((c) => (c === ' ' ? '\u3000' : String.fromCharCode(c.charCodeAt(0) + 0xfee0))).join('');
    expect(parseRecoveryKey(fullWidth)).toEqual(raw);
  });

  it('rejects anything else, case included (the key is base58)', () => {
    expect(parseRecoveryKey(key.toLowerCase())).toBeNull();
    expect(parseRecoveryKey(key.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey('')).toBeNull();
  });
});

describe('SAS emoji', () => {
  it('maps names to the Matrix table index', () => {
    expect(sasEmoji([['🐶', 'Dog'], ['👍', 'Thumbs Up'], ['💡', 'Light Bulb'], ['📌', 'Pin']]).map((e) => e.index)).toEqual([0, 36, 41, 63]);
  });
});

describe('crypto store wipe', () => {
  it('only for a store that belongs to another account or device', () => {
    expect(isStoreMismatch(new Error("the account in the store doesn't match the account in the constructor: expected @a:x:DEV1, got @b:x:DEV2"))).toBe(true);
    expect(isStoreMismatch(new TypeError('Failed to fetch dynamically imported module: /assets/rust-crypto.js'))).toBe(false);
    expect(isStoreMismatch(new Error('WebAssembly.instantiate(): expected magic word'))).toBe(false);
    expect(isStoreMismatch(new DOMException('The operation failed for reasons unrelated to the database itself', 'UnknownError'))).toBe(false);
  });
});

describe('save step (needsRecoveryKey)', () => {
  const ready = { confirmed: true, identity: true, holdsKeys: true, defaultKey: true, usableBackup: true, unfinished: false };
  it('comes back whenever a part of the setup is missing', () => {
    expect(needsRecoveryKeyOf(ready)).toBe(false);
    expect(needsRecoveryKeyOf({ ...ready, defaultKey: false })).toBe(true);
    expect(needsRecoveryKeyOf({ ...ready, usableBackup: false })).toBe(true);
    expect(needsRecoveryKeyOf({ ...ready, unfinished: true })).toBe(true);
    expect(needsRecoveryKeyOf({ ...ready, identity: false, holdsKeys: false })).toBe(true);
  });
  it('never on a device that would have to replace the identity to make one', () => {
    expect(needsRecoveryKeyOf({ ...ready, holdsKeys: false, defaultKey: false })).toBe(false);
    expect(needsRecoveryKeyOf({ ...ready, confirmed: false, defaultKey: false })).toBe(false);
  });
});

describe('sign-out risk', () => {
  const base = { confirmed: true, others: 0, hasEncrypted: true, backupWorks: true, counts: { total: 10, backedUp: 10 } };
  it('warns while keys are only on this device', () => {
    expect(signOutRiskOf(base)).toBe('last-device');
    expect(signOutRiskOf({ ...base, others: 2 })).toBe('none');
    expect(signOutRiskOf({ ...base, others: 2, counts: { total: 10, backedUp: 7 } })).toBe('no-backup');
    expect(signOutRiskOf({ ...base, others: 2, backupWorks: false })).toBe('no-backup');
  });
  it('stays quiet without encrypted conversations or on an unconfirmed device', () => {
    expect(signOutRiskOf({ ...base, hasEncrypted: false, backupWorks: false })).toBe('none');
    expect(signOutRiskOf({ ...base, confirmed: false, backupWorks: false })).toBe('none');
  });
});
