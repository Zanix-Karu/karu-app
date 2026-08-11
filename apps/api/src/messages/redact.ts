/**
 * Contact-detail redaction for booking chat.
 *
 * The marketplace's core rule (MVP plan + spec) is that customer↔vendor
 * contact runs through Karu — a phone number pasted into chat would end that.
 * Non-admin messages pass through here before they are stored; admins are
 * exempt, since Karu Support handing out a number is a deliberate act.
 *
 * This is deliberately blunt: it may occasionally catch a long price written
 * out in digits, and it will not catch a determined user spelling a number in
 * words. It is a guardrail that keeps honest people honest — the admin's view
 * of every thread is the backstop for the rest.
 */

const PLACEHOLDER = '[hidden — contact stays on Karu]';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Phone-like digit runs: 8+ digits allowing spaces, dots, dashes and
 * parentheses between them, with an optional leading +/00 country code.
 * Cameroon numbers are 9 digits (6XX XX XX XX), UK mobiles 11 — both well
 * above rental prices, which rarely reach 8 digits even in XAF.
 */
const PHONE = /(?:\+|00)?\d(?:[\s().\-/]*\d){7,}/g;

/** WhatsApp/Telegram links are contact details too. */
const CHAT_LINK = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|t\.me)\/[^\s]+/gi;

/**
 * Dates share the phone pattern's shape (2026-08-15 is eight digits joined by
 * dashes) and rental chat is full of them, so a match made only of date
 * tokens is let through.
 */
const DATE_TOKEN = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})[,;.]?$/;

function isDateLike(match: string): boolean {
  const tokens = match
    .trim()
    .split(/\s+/)
    .filter((t) => /\d/.test(t));
  return tokens.length > 0 && tokens.every((t) => DATE_TOKEN.test(t));
}

export interface RedactionResult {
  text: string;
  /** True when anything was replaced. */
  redacted: boolean;
}

export function redactContactDetails(input: string): RedactionResult {
  let redacted = false;
  const replace = (pattern: RegExp, s: string) =>
    s.replace(pattern, () => {
      redacted = true;
      return PLACEHOLDER;
    });

  let text = replace(CHAT_LINK, input);
  text = replace(EMAIL, text);
  text = text.replace(PHONE, (match) => {
    if (isDateLike(match)) return match;
    redacted = true;
    return PLACEHOLDER;
  });
  return { text, redacted };
}
