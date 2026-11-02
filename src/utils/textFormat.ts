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
 * - Automatically replaces a leading '00' at the very start with '+'
 * - Applies automatic hyphen insertion for domestic (03XX-XXXXXXX) and international (+CC-XXX-XXXXXXX) formats
 * - Removes the leading 0 immediately after the first hyphen (e.g., converts 0321-0... to 0321-...)
 * - Preserves backspacing without trapping the cursor on separator hyphens
 *
 * @param value The raw input string
 * @param prevValue Optional previous value to detect backspacing on a separator hyphen
 */
export function formatPhoneNumber(value: string | undefined | null, prevValue: string = ''): string {
  if (!value || typeof value !== 'string') return '';

  let trimmed = value.trimStart();

  // 1. Automatically replace a leading 00 at the very start with a +
  if (trimmed.startsWith('00')) {
    trimmed = '+' + trimmed.slice(2);
  }

  const startsWithPlus = trimmed.startsWith('+');

  // Strip all non-digit characters to get raw digits
  let rawDigits = trimmed.replace(/\D/g, '');

  // If user hit backspace on a separator hyphen, remove the preceding digit
  if (
    prevValue &&
    prevValue.length - value.length === 1 &&
    prevValue.replace(/\D/g, '') === rawDigits
  ) {
    rawDigits = rawDigits.slice(0, -1);
  }

  // If only '+' was typed or resulted from '00', preserve '+'
  if (startsWithPlus && !rawDigits) {
    return '+';
  }
  if (!rawDigits) {
    return '';
  }

  // Cap at 15 digits (E.164 max standard)
  const digits = rawDigits.slice(0, 15);

  // International format (starts with +)
  if (startsWithPlus) {
    // Determine country code length
    let ccLen = 2;
    if (digits.startsWith('1') || digits.startsWith('7')) {
      ccLen = 1;
    } else {
      const threeDigitPrefixes = [
        '971', '966', '965', '974', '973', '968', '880', '977', '964', '962', '961', '967',
        '234', '254', '351', '352', '353', '358', '380', '420',
      ];
      if (digits.length >= 3 && threeDigitPrefixes.includes(digits.slice(0, 3))) {
        ccLen = 3;
      } else {
        ccLen = 2;
      }
    }

    if (digits.length <= ccLen) {
      return '+' + digits;
    }

    const cc = digits.slice(0, ccLen);
    let rest = digits.slice(ccLen);

    // CRITICAL: Remove the leading 0 immediately after the first hyphen
    // E.g., +92-0321... -> +92-321...
    rest = rest.replace(/^0+/, '');

    if (!rest) {
      return `+${cc}-`;
    }

    // Carrier code length (standard 3 digits e.g. 300, 321, or 2 digits in UAE/KSA 50/55)
    const carrierLen = cc === '971' || cc === '966' ? 2 : 3;

    if (rest.length <= carrierLen) {
      return `+${cc}-${rest}`;
    }

    const carrier = rest.slice(0, carrierLen);
    const subscriber = rest.slice(carrierLen);
    return `+${cc}-${carrier}-${subscriber}`;
  }

  // Local Pakistani / domestic number starting with 0 (e.g. 0321, 0300)
  if (digits.startsWith('0')) {
    if (digits.length <= 4) {
      if (trimmed.endsWith('-') && digits.length === 4) {
        return `${digits}-`;
      }
      return digits;
    }

    const prefix = digits.slice(0, 4);
    let rest = digits.slice(4);

    // CRITICAL: Remove the leading 0 immediately after the first hyphen
    // E.g., convert 0321-0... to 0321-...
    rest = rest.replace(/^0+/, '');

    if (!rest) {
      return `${prefix}-`;
    }

    return `${prefix}-${rest}`;
  }

  // Local number without leading 0 (e.g. 3211234567)
  if (digits.length <= 3) {
    if (trimmed.endsWith('-') && digits.length === 3) {
      return `${digits}-`;
    }
    return digits;
  }

  const prefix = digits.slice(0, 3);
  let rest = digits.slice(3).replace(/^0+/, '');
  if (!rest) {
    return `${prefix}-`;
  }
  return `${prefix}-${rest}`;
}

/**
 * Normalizes and formats a phone number for storage or export.
 */
export function cleanPhoneNumber(value: string | undefined | null): string {
  if (!value) return '';
  return formatPhoneNumber(value).trim();
}

/**
 * Checks whether a phone number is valid:
 * - Has between minDigits (default 10) and 15 digits
 * - Contains only allowed phone characters: +, -, digits, spaces
 * - Does NOT contain a leading 0 immediately after the first hyphen (e.g. -0 is invalid)
 */
export function isValidPhoneNumber(
  value: string | undefined | null,
  minDigits: number = 10,
  maxDigits: number = 15
): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Disallow leading 0 immediately after any hyphen (e.g. -0...)
  if (/-\s*0/.test(trimmed)) return false;

  // Allowed characters: digits, +, -, spaces
  if (!/^\+?[0-9\s\-]+$/.test(trimmed)) return false;

  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= minDigits && digits.length <= maxDigits;
}

/**
 * Standardized validation error generator for phone numbers.
 * Returns null if valid, or a user-friendly error message.
 */
export function getPhoneValidationError(
  value: string | undefined | null,
  options?: { isRequired?: boolean; minDigits?: number; maxDigits?: number; label?: string }
): string | null {
  const isRequired = options?.isRequired ?? true;
  const minDigits = options?.minDigits ?? 10;
  const maxDigits = options?.maxDigits ?? 15;
  const label = options?.label ?? 'Phone number';

  if (!value || !value.trim()) {
    return isRequired ? `${label} is required.` : null;
  }

  const trimmed = value.trim();

  if (/-\s*0/.test(trimmed)) {
    return 'Invalid format: remove the leading 0 immediately after the hyphen.';
  }

  if (!/^\+?[0-9\s\-]+$/.test(trimmed)) {
    return `${label} can only contain digits, '+', and hyphens.`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < minDigits) {
    return `${label} must have at least ${minDigits} digits (e.g. 0321-1234567 or +92-321-1234567). Current: ${digits.length}.`;
  }

  if (digits.length > maxDigits) {
    return `${label} cannot exceed ${maxDigits} digits.`;
  }

  return null;
}


