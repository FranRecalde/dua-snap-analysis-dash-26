import { describe, it, expect } from 'vitest';
import { hashPassword } from '../src/app.js';

describe('Privacy Screen Authentication Logic', () => {
  const EXPECTED_HASH = 'aef276c8b73d35370acccbee7252e8ab42b1abf75bb0806585b18ed070d91534';

  it('generates a 64-character SHA-256 lowercase hex string using crypto.subtle', async () => {
    const testHash = await hashPassword('test');
    expect(testHash).toHaveLength(64);
    expect(testHash).toMatch(/^[a-f0-9]{64}$/);
    // SHA-256 for "test" is 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    expect(testHash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('matches the target stored hash format for the password', () => {
    expect(EXPECTED_HASH).toHaveLength(64);
    expect(EXPECTED_HASH).toMatch(/^[a-f0-9]{64}$/);
  });
});
