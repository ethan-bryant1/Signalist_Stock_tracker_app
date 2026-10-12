import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessDeniedMessage, isAllowedEmail, parseAllowedEmails, PRIVATE_SITE_MESSAGE } from '@/lib/owner-access';

describe('who can use the site', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads a comma or space separated list, ignoring case and blanks', () => {
    expect([...parseAllowedEmails(' Owner@Example.com, second@example.com ;;  ')]).toEqual(['owner@example.com', 'second@example.com']);
    expect(parseAllowedEmails(undefined).size).toBe(0);
    expect(parseAllowedEmails('not-an-email').size).toBe(0);
  });

  it('lets in only listed emails', () => {
    const list = 'owner@example.com';
    expect(isAllowedEmail('OWNER@example.com ', list)).toBe(true);
    expect(isAllowedEmail('someone@example.com', list)).toBe(false);
    expect(isAllowedEmail('owner@example.com.evil.com', list)).toBe(false);
    expect(isAllowedEmail(undefined, list)).toBe(false);
    expect(isAllowedEmail('', '')).toBe(false);
  });

  it('lets nobody in when the list is missing', () => {
    expect(isAllowedEmail('owner@example.com', undefined)).toBe(false);
    expect(isAllowedEmail('owner@example.com', '')).toBe(false);
  });

  it('only tells a local developer that the setting is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(accessDeniedMessage('owner@example.com', 'development')).toBe(PRIVATE_SITE_MESSAGE);
    expect(accessDeniedMessage(undefined, 'production')).toBe(PRIVATE_SITE_MESSAGE);
    expect(accessDeniedMessage(undefined, 'development')).toMatch(/ALLOWED_EMAILS/);
  });
});
