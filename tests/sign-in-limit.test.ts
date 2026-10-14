import { describe, expect, it } from 'vitest';
import { attemptKeys, clientAddress, MAX_FAILURES_PER_ADDRESS, MAX_FAILURES_PER_EMAIL, signInPaused } from '@/lib/sign-in-limit';

describe('sign-in attempt limit', () => {
  it('takes the client address Vercel puts first', () => {
    expect(clientAddress('203.0.113.7, 10.0.0.1', '10.0.0.1')).toBe('203.0.113.7');
    expect(clientAddress(null, ' 198.51.100.2 ')).toBe('198.51.100.2');
    expect(clientAddress('', null)).toBe('unknown');
    expect(clientAddress('x'.repeat(500), null)).toHaveLength(64);
  });

  it('counts an email the same whatever its case', () => {
    expect(attemptKeys('1.2.3.4', ' Owner@Example.com ')).toEqual({ address: 'ip:1.2.3.4', email: 'email:owner@example.com' });
  });

  it('pauses at the limit for an address or an email, not before', () => {
    expect(signInPaused({ address: MAX_FAILURES_PER_ADDRESS - 1, email: MAX_FAILURES_PER_EMAIL - 1 })).toBe(false);
    expect(signInPaused({ address: MAX_FAILURES_PER_ADDRESS, email: 0 })).toBe(true);
    expect(signInPaused({ address: 0, email: MAX_FAILURES_PER_EMAIL })).toBe(true);
  });
});
