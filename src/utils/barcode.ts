/**
 * AUTOMATIC BARCODE LOGIC (CODE-128 DEFAULT, NO PREFIX, NO ZERO-PADDING)
 *
 * Final Architecture Plan:
 * 1. Default Store Barcode Format: Code-128 (Variable-length alphanumeric/numeric)
 *    - No 7-digit barcode prefix required.
 *    - No leading zero-padding on Product ID (uses exact store product number: 1, 7, 9, 12, 129...).
 *    - Formula: [2-Letter Category Code]-[Exact Store Product ID] (e.g., "SN-9", "BO-7", "TD-12", "CA-129")
 *      or exact product number if no category is given.
 * 2. Full Manufacturer Barcode Override Support:
 *    - Cashiers/Admins can override the designed Code-128 barcode with the shoe box's own barcode.
 *    - Overriding the barcode NEVER adds the product's ID to deleted_product_ids, keeping store
 *      product counts and Articles 100% synchronized without collision.
 */

import { parseCategoryPrefix } from './footwear.ts';

export interface Ean13BarcodeResult {
  barcode: string;           // Short Code-128 barcode (e.g. "CA-9" or "SN-12")
  prefix: string;            // Category prefix (e.g. "CA", "SN", "TD")
  paddedProductId: string;   // Exact unpadded product ID string (e.g. "9", "12", "129")
  productId: number;         // Exact product ID number
  checkDigit: number;        // 0 (not needed for Code-128)
  format: 'CODE128';
  formula: string;           // e.g. "SN-9"
}

/**
 * Generates an automatic minimum-length Code-128 barcode:
 * Formula: [2-Letter Category Code]-[Padded Product ID if 1-9 else Exact Store Product ID]
 * (e.g. "MN-01", "MN-09", "MN-10", "TD-12", "CA-129")
 */
export function generateCode128Barcode(
  productId: number | string,
  categoryOrPrefix?: string | null
): Ean13BarcodeResult {
  const prodIdNum = Math.max(1, parseInt(String(productId ?? '1').replace(/\D/g, ''), 10) || 1);
  const formattedIdStr = prodIdNum >= 1 && prodIdNum <= 9 ? `0${prodIdNum}` : String(prodIdNum);

  const rawCat = String(categoryOrPrefix || '').trim();
  // If rawCat is a numeric old prefix like '0108923', ignore it and use 'CA' or clean category prefix
  const isLegacyNumericPrefix = /^\d+$/.test(rawCat);
  const catPrefix =
    !rawCat || isLegacyNumericPrefix
      ? 'CA'
      : /^[A-Z]{2}$/i.test(rawCat)
      ? rawCat.toUpperCase()
      : parseCategoryPrefix(rawCat);

  const barcode = `${catPrefix}-${formattedIdStr}`;

  return {
    barcode,
    prefix: catPrefix,
    paddedProductId: formattedIdStr,
    productId: prodIdNum,
    checkDigit: 0,
    format: 'CODE128',
    formula: barcode,
  };
}

export interface BarcodeAnalysis {
  isValid: boolean;
  standard: 'STORE_CODE128' | 'CODE128' | 'STORE_EAN13' | 'EAN13' | 'UPCA' | 'EAN8' | 'INVALID';
  standardLabel: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  suggestedFix?: string;
  error?: string;
}

/**
 * Analyzes any scanned or entered barcode string:
 * - Accepts Store Code-128 (e.g. SN-9, TD-12, CA-129) and any length Code-128 (1 to 64 chars)
 * - Standardizes on Code-128 for all store and manufacturer codes
 */
export function analyzeBarcode(barcodeRaw: string, _storePrefix?: string): BarcodeAnalysis {
  const raw = String(barcodeRaw || '').trim();
  if (!raw) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Empty Barcode',
      error: 'Barcode cannot be blank.',
    };
  }

  if (raw.length < 1 || raw.length > 64) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Invalid Length',
      error: `Barcode length must be between 1 and 64 characters (currently ${raw.length}).`,
    };
  }

  if (/[\r\n\t]/.test(raw)) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Invalid Format',
      error: 'Barcode contains whitespace or newline characters.',
    };
  }

  const cleanDigits = raw.replace(/\D/g, '');
  const isPureNumeric = cleanDigits.length === raw.length;

  // Check if it matches Store Standard Code-128: [2-letter category]-[exact id] (e.g., SN-9, TD-12, CA-129)
  if (/^[A-Za-z]{2,3}-\d+$/i.test(raw)) {
    return {
      isValid: true,
      standard: 'STORE_CODE128',
      standardLabel: 'Store Standard Code-128 (Compact)',
    };
  }

  // Code-128 / Any length alphanumeric or numeric code (e.g. 9, 12, 129, SN-9, NK-AIR-90)
  if (/^[A-Za-z0-9_\-\.\:\/\#\s]+$/.test(raw)) {
    return {
      isValid: true,
      standard: 'CODE128',
      standardLabel: isPureNumeric
        ? `Code-128 Compact Numeric (${raw.length} chars)`
        : 'Code-128 Barcode (Variable Length)',
    };
  }

  return {
    isValid: false,
    standard: 'INVALID',
    standardLabel: 'Invalid Characters',
    error: 'Barcode contains unsupported non-ASCII characters.',
  };
}
