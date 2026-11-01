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
 * Live phone number formatter matching the Register Free Trial standard:
 * 1. Automatically adds hyphens after the country code and carrier code.
 * 2. Replaces leading "00" with a "+" sign.
 * 3. Removes the leading '0' immediately following the first hyphen/prefix
 *    (e.g., "0-321" becomes "321", "+92-0321" becomes "+92-321").
 *
 * @param value The raw input string
 * @param prevValue Optional previous value to detect backspacing on a separator hyphen
 */
export function formatPhoneNumber(value: string, prevValue: string = ''): string {
  if (!value) return '';
  let str = value.trim();

  // 1. Replace leading "00" with a "+" sign
  if (str.startsWith('00')) {
    str = '+' + str.slice(2);
  } else if (str.startsWith('+00')) {
    str = '+' + str.slice(3);
  }

  // 2. Remove leading "0-" prefix if present (e.g. "0-321" becomes "321")
  if (str.startsWith('0-')) {
    str = str.slice(2);
  }

  // 3. Remove leading '0' immediately following the first hyphen/prefix
  // (e.g. "+92-0321" -> "+92-321", "+92-0-321" -> "+92-321", "+92-0" -> "+92-")
  str = str.replace(/^(\+?\d{1,4}-)0+/, '$1');

  const startsWithPlus = str.startsWith('+');
  let rawDigits = str.replace(/\D/g, '');

  // If user hit backspace on a hyphen (e.g. from "+92-300-" to "+92-300")
  if (prevValue && prevValue.length - value.length === 1 && prevValue.replace(/\D/g, '') === rawDigits) {
    rawDigits = rawDigits.slice(0, -1);
  }

  if (!rawDigits && startsWithPlus) return '+';
  if (!rawDigits) return '';

  // Standard E.164 phone numbers do not exceed 15 digits
  const isIntl = startsWithPlus || rawDigits.startsWith('92');
  const digits = rawDigits.slice(0, 15);

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

    // Remove leading '0' immediately following the first hyphen/prefix
    // (e.g. +92-0321 -> +92-321; +44-07123 -> +44-7123)
    while (rest.startsWith('0')) {
      rest = rest.slice(1);
    }

    if (!rest) {
      return `+${cc}-`;
    }

    // Carrier code length (standard 3 digits e.g. 300/321, or 2 digits in UAE/KSA 50/55)
    const carrierLen = cc === '971' || cc === '966' ? 2 : 3;

    if (rest.length <= carrierLen) {
      return `+${cc}-${rest}`;
    }

    const carrier = rest.slice(0, carrierLen);
    const subscriber = rest.slice(carrierLen);
    return `+${cc}-${carrier}-${subscriber}`;
  }

  // Local number starting with 0 (e.g., 03001234567 -> 0300-1234567)
  if (digits.startsWith('0')) {
    if (digits.length > 4) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    return digits;
  }

  // Local number chunking (e.g. 321-1234567)
  if (digits.length > 3) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return digits;
}

/**
 * Standard phone validation helper matching the Register Free Trial form rules:
 * - Minimum 7 digits, maximum 15 digits (E.164 standard)
 */
export function isPhoneNumberValid(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Extracts digit-only characters from a formatted phone string.
 */
export function getPhoneNumberDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Returns user-facing error message matching the Register Free Trial form.
 */
export function getPhoneValidationError(
  phone: string | null | undefined,
  required: boolean = true,
  fieldName: string = 'Phone number'
): string | null {
  const trimmed = String(phone || '').trim();
  if (!trimmed) {
    return required ? `${fieldName} is required.` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) {
    return `Please enter at least 7 digits (e.g. +92-300-1234567). Current: ${digits.length} digits.`;
  }
  if (digits.length > 15) {
    return `${fieldName} cannot exceed 15 digits.`;
  }
  return null;
}


