/**
 * Utility helpers for Title Case / Capitalize input formatting and sanitization
 * across all forms, with strict exclusions for emails, URLs, passwords,
 * barcodes, and numeric/tax identifiers.
 */

/**
 * Live input formatter: capitalizes the first letter of each word as the user types
 * without altering string length, cursor position, or trailing spaces.
 */
export function toTitleCaseLive(value: string): string {
  if (!value) return '';
  return value.replace(/(^|[\s\-/.,(#])([a-z])/g, (_match, sep: string, char: string) => {
    return sep + char.toUpperCase();
  });
}

/**
 * Trimmed & sanitized Title Case formatter for saving to the database.
 */
export function toTitleCaseTrimmed(value: string | undefined | null): string {
  if (!value) return '';
  return toTitleCaseLive(value.trim());
}

/**
 * Lowercase & trimmed sanitizer for excluded identifier fields (email, website, codes).
 */
export function toLowerTrimmed(value: string | undefined | null): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

/**
 * Live phone number formatter:
 * Automatically formats phone numbers with hyphens after the country code and carrier code
 * as the user types (e.g., +92-300-1234567).
 *
 * @param value The raw input string
 * @param prevValue Optional previous value to detect backspacing on a separator hyphen
 */
export function formatPhoneNumber(value: string, prevValue: string = ''): string {
  if (!value) return '';
  const trimmed = value.trim();
  const startsWithPlus = trimmed.startsWith('+');
  const startsWith00 = trimmed.startsWith('00');

  let rawDigits = trimmed.replace(/\D/g, '');

  // If user hit backspace on a hyphen (e.g. from "+92-300-" to "+92-300" or "+92-" to "+92")
  if (prevValue && prevValue.length - value.length === 1 && prevValue.replace(/\D/g, '') === rawDigits) {
    // A separator hyphen was deleted; delete the preceding digit as well to avoid being trapped
    rawDigits = rawDigits.slice(0, -1);
  }

  if (!rawDigits && (startsWithPlus || startsWith00)) return '+';
  if (!rawDigits) return '';

  // Standard E.164 phone numbers do not exceed 15 digits
  const digits = rawDigits.slice(0, 15);
  const isIntl = startsWithPlus || startsWith00 || digits.startsWith('92');

  if (isIntl) {
    const d = digits;
    let ccLen = 2;
    if (d.startsWith('1') || d.startsWith('7')) {
      ccLen = 1;
    } else {
      const threeDigitPrefixes = [
        '971', '966', '965', '974', '973', '968', '880', '977', '964', '962', '961', '967',
        '234', '254', '351', '352', '353', '358', '380', '420',
      ];
      if (d.length >= 3 && threeDigitPrefixes.includes(d.slice(0, 3))) {
        ccLen = 3;
      } else {
        ccLen = 2;
      }
    }

    if (d.length <= ccLen) {
      return '+' + d;
    }

    const cc = d.slice(0, ccLen);
    let rest = d.slice(ccLen);

    // If domestic trunk 0 was included after country code (e.g. +92-0300...), strip it if more digits follow
    if (cc === '92' && rest.startsWith('0') && rest.length > 1) {
      rest = rest.slice(1);
    }

    // Carrier code length (standard 3 digits e.g. 300, or 2 digits in UAE/KSA 50/55)
    const carrierLen = cc === '971' || cc === '966' ? 2 : 3;

    if (rest.length <= carrierLen) {
      return `+${cc}-${rest}`;
    }

    const carrier = rest.slice(0, carrierLen);
    const subscriber = rest.slice(carrierLen);
    return `+${cc}-${carrier}-${subscriber}`;
  }

  // Local number starting with 0 (e.g., 03001234567 -> 0300-1234567)
  if (digits.startsWith('0') && digits.length > 4) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  if (digits.length > 3 && digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return digits;
}

