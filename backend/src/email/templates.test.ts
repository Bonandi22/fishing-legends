import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates.js';
import type { EmailKind, Locale } from './types.js';

const KINDS: EmailKind[] = [
  'verify_email_code',
  'login_code',
  'password_reset_code',
  'register_attempt_notice',
  'code_expired_notice',
];
const LOCALES: Locale[] = ['pt', 'en', 'es', 'fr', 'de', 'ja'];
const CODE_KINDS: EmailKind[] = ['verify_email_code', 'login_code', 'password_reset_code'];
const NO_CODE_KINDS: EmailKind[] = ['register_attempt_notice', 'code_expired_notice'];

describe('renderEmail', () => {
  it('every kind renders in every locale with non-empty subject/text/html', () => {
    for (const kind of KINDS) {
      for (const locale of LOCALES) {
        const out = renderEmail(kind, locale, { code: '123456', minutes: '30' });
        expect(out.subject.trim().length, `${kind}/${locale} subject`).toBeGreaterThan(0);
        expect(out.text.trim().length, `${kind}/${locale} text`).toBeGreaterThan(0);
        expect(out.html.trim().length, `${kind}/${locale} html`).toBeGreaterThan(0);
        expect(out.text).not.toMatch(/<[a-z/][^>]*>/i);
        expect(out.text).not.toContain('{code}');
        expect(out.text).not.toContain('{minutes}');
      }
    }
  });

  it('code kinds include the code and the validity in minutes', () => {
    for (const kind of CODE_KINDS) {
      for (const locale of LOCALES) {
        const out = renderEmail(kind, locale, { code: '123456', minutes: '30' });
        expect(out.text).toContain('123456');
        expect(out.text).toContain('30');
        expect(out.html).toContain('123456');
      }
    }
  });

  it('html escapes payload values', () => {
    const out = renderEmail('login_code', 'en', { code: '<b>', minutes: '30' });
    expect(out.html).toContain('&lt;b&gt;');
    expect(out.html).not.toContain('<b>');
    const quotes = renderEmail('login_code', 'en', { code: `"'&`, minutes: '30' });
    expect(quotes.html).toContain('&quot;&#39;&amp;');
  });

  it('register_attempt_notice and code_expired_notice contain no code', () => {
    for (const kind of NO_CODE_KINDS) {
      for (const locale of LOCALES) {
        const out = renderEmail(kind, locale, { code: '123456', minutes: '30' });
        expect(out.text).not.toContain('123456');
        expect(out.html).not.toContain('123456');
      }
    }
  });
});
