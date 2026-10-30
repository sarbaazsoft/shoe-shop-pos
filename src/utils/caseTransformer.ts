/**
 * Universal Case Transformer & Response Normalizer
 * Standardizes API responses and database rows strictly into camelCase,
 * converting database keys such as pricing_mode and business_type to camelCase.
 */

export function toCamelCaseKey(key: string): string {
  // If already camelCase without underscores, return as is
  if (!key.includes('_')) return key;
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Normalizes an object or array recursively so that all keys are camelCase.
 * Automatically unifies legacy duplicates:
 * - pricing_mode -> pricingMode
 * - company_name -> name (and companyName)
 * - company_phone -> phone (and companyPhone)
 * - company_email -> email (and companyEmail)
 * - company_address -> address (and companyAddress)
 * - tax_id / tax_number -> taxId (and taxNumber)
 */
export function transformKeysToCamelCase<T = any>(data: any): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => transformKeysToCamelCase(item)) as unknown as T;
  }

  // Handle built-in non-plain objects
  if (data instanceof Date || data instanceof RegExp || (typeof Blob !== 'undefined' && data instanceof Blob)) {
    return data as unknown as T;
  }

  const result: Record<string, any> = {};

  for (const [rawKey, rawValue] of Object.entries(data)) {
    const camelKey = toCamelCaseKey(rawKey);
    const transformedValue = transformKeysToCamelCase(rawValue);

    // Standard camelCase key
    result[camelKey] = transformedValue;

    // Maintain backward-compatibility key if different, to ensure existing components don't break during migration
    if (camelKey !== rawKey && !(rawKey in result)) {
      result[rawKey] = transformedValue;
    }
  }

  // Unify Company Settings aliases
  if (result.companyName !== undefined && result.name === undefined) {
    result.name = result.companyName;
  } else if (result.name !== undefined && result.companyName === undefined) {
    result.companyName = result.name;
  }

  if (result.taxNumber !== undefined && result.taxId === undefined) {
    result.taxId = result.taxNumber;
  } else if (result.taxId !== undefined && result.taxNumber === undefined) {
    result.taxNumber = result.taxId;
  }

  return result as T;
}
