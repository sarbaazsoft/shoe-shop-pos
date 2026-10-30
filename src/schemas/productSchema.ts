import { z } from 'zod';

/**
 * Zod schema for product price fields. The pricing behavior is supplied from
 * store settings by the caller and is not part of the product payload.
 * Handles conditional "Fixed vs Negotiable" pricing rules:
 *
 * 1. FIXED Price Policy:
 *    - `maxPrice` must be >= `costPrice`
 *    - Automatically normalizes `minPrice = maxPrice`
 *
 * 2. NEGOTIABLE Price Policy:
 *    - Requires `costPrice`, `minPrice` (Min Selling Price), and `maxPrice` (Max Selling Price)
 *    - `minPrice` >= `costPrice`
 *    - `maxPrice` > `minPrice`
 *    - `maxPrice` is the product's negotiable ceiling
 */
export const productPricingSchema = (pricingMode: PricingMode) => z
  .object({
    costPrice: z
      .number({
        message: 'Cost Price is required and must be a valid number.',
      })
      .finite('Cost Price must be a valid number.')
      .min(0, 'Cost Price cannot be negative.'),
    // Legacy request compatibility: new product writes use maxPrice only.
    sellingPrice: z
      .number({
        message: 'Price is required and must be a valid number.',
      })
      .finite('Price must be a valid number.')
      .optional(),
    minPrice: z
      .number({
        message: 'Min Selling Price is required and must be a valid number.',
      })
      .finite('Min Selling Price must be a valid number.')
      .optional(),
    maxPrice: z
      .number({
        message: 'Max Selling Price is required and must be a valid number.',
      })
      .finite('Max Selling Price must be a valid number.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (pricingMode === 'FIXED') {
      const fixedPrice = data.maxPrice ?? data.sellingPrice;
      if (fixedPrice === undefined || fixedPrice === null || Number.isNaN(fixedPrice)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxPrice'],
          message: 'Price is required for Fixed Price policy.',
        });
        return;
      }

      if (fixedPrice <= 0 && data.costPrice > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxPrice'],
          message: 'Selling Price must be greater than zero.',
        });
      }

      if (fixedPrice < data.costPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxPrice'],
          message: `Maximum Price (${fixedPrice}) must be greater than or equal to Cost Price (${data.costPrice}).`,
        });
      }
    } else if (pricingMode === 'NEGOTIABLE') {
      const hasMin = data.minPrice !== undefined && data.minPrice !== null && !Number.isNaN(data.minPrice);
      const hasMax = data.maxPrice !== undefined && data.maxPrice !== null && !Number.isNaN(data.maxPrice);

      if (!hasMin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minPrice'],
          message: 'Minimum Selling Price is required for Negotiable Price policy.',
        });
      }

      if (!hasMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxPrice'],
          message: 'Maximum Selling Price is required for Negotiable Price policy.',
        });
      }

      if (hasMin && data.minPrice! < data.costPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minPrice'],
          message: `Minimum Selling Price (${data.minPrice}) must be greater than or equal to Cost Price (${data.costPrice}).`,
        });
      }

      if (hasMin && hasMax && Math.round(data.maxPrice!) <= Math.round(data.minPrice!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxPrice'],
          message: `Tag Price (${data.maxPrice}) must be greater than Minimum Selling Price (${data.minPrice}) for negotiable pricing.`,
        });
      }
    }
  })
  .transform((data) => {
    const costPrice = Math.round(data.costPrice);
    if (pricingMode === 'FIXED') {
      const price = Math.round(data.maxPrice ?? data.sellingPrice!);
      // Fixed Price Policy Rule: minPrice = maxPrice
      return {
        costPrice,
        sellingPrice: price,
        minPrice: price,
        maxPrice: price,
      };
    } else {
      const minPrice = Math.round(data.minPrice!);
      const maxPrice = Math.round(data.maxPrice!);
      // Negotiable Price Policy Rule: sellingPrice defaults to maxPrice (tag price)
      return {
        costPrice,
        sellingPrice: maxPrice,
        minPrice,
        maxPrice,
      };
    }
  });

export type PricingMode = 'FIXED' | 'NEGOTIABLE';
export type ValidatedProductPricing = z.output<ReturnType<typeof productPricingSchema>>;

/**
 * Helper to validate and normalize product pricing with field-level and summary errors.
 */
export function validateAndNormalizeProductPricing(input: {
  pricingMode: PricingMode;
  costPrice: number | string | undefined | null;
  sellingPrice?: number | string | undefined | null;
  minPrice?: number | string | undefined | null;
  maxPrice?: number | string | undefined | null;
}): {
  success: boolean;
  data?: ValidatedProductPricing;
  error?: string;
  fieldErrors: {
    costPrice?: string;
    sellingPrice?: string;
    minPrice?: string;
    maxPrice?: string;
    general?: string;
  };
  errors: {
    costPrice?: string;
    sellingPrice?: string;
    minPrice?: string;
    maxPrice?: string;
    general?: string;
  };
} {
  const parseNum = (val: number | string | undefined | null): number | undefined => {
    if (val === undefined || val === null || String(val).trim() === '') return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : NaN;
  };

  const rawCost = parseNum(input.costPrice);
  const rawSelling = parseNum(input.sellingPrice);
  const rawMin = parseNum(input.minPrice);
  const rawMax = parseNum(input.maxPrice);

  const result = productPricingSchema(input.pricingMode).safeParse({
    costPrice: rawCost,
    sellingPrice: rawSelling,
    minPrice: rawMin,
    maxPrice: rawMax,
  });

  if (result.success) {
    return {
      success: true,
      data: result.data,
      fieldErrors: {},
      errors: {},
    };
  }

  const errors: {
    costPrice?: string;
    sellingPrice?: string;
    minPrice?: string;
    maxPrice?: string;
    general?: string;
  } = {};

  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof typeof errors | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
    if (!errors.general) {
      errors.general = issue.message;
    }
  }

  return {
    success: false,
    error: errors.general || 'Invalid product pricing.',
    fieldErrors: errors,
    errors,
  };
}

/**
 * Zod Schema for Product Brand validation.
 * Brand is validated and stored as a plain text string rather than a relational ID.
 */
export const productBrandSchema = z
  .string({
    message: 'Brand must be a text string.',
  })
  .trim()
  .max(100, 'Brand name cannot exceed 100 characters.')
  .transform((brand) => brand || 'Unbranded');

export function validateProductBrand(brand: unknown): {
  success: boolean;
  brand: string;
  error?: string;
} {
  const result = productBrandSchema.safeParse(brand);
  if (result.success) {
    return { success: true, brand: result.data };
  }
  return {
    success: false,
    brand: typeof brand === 'string' && brand.trim() ? brand.trim() : 'Unbranded',
    error: result.error.issues[0]?.message || 'Invalid brand text.',
  };
}

/**
 * Normalizes and validates pairs per carton value (must be 12 or 16).
 */
export function normalizePairsPerCarton(value: unknown): 12 | 16 {
  const num = Number(value);
  return num === 16 ? 16 : 12;
}

/**
 * Store-Type-Aware Low Stock Threshold Calculation:
 *
 * 1. Retail Store:
 *    - Preserves current retail behavior exactly.
 *    - Interprets threshold in individual pairs/units.
 *    - Calculation: threshold in pairs directly (e.g. 5 pairs)
 *
 * 2. Wholesale Store:
 *    - Interprets threshold input as a number of cartons.
 *    - Converts entered carton threshold into individual pairs:
 *      product.lowstockalert = entered_carton_threshold * product.pairs_per_carton
 *    - Examples:
 *      1 carton * 12 pairs = 12 pairs
 *      2 cartons * 12 pairs = 24 pairs
 *      1 carton * 16 pairs = 16 pairs
 *      5 cartons * 12 pairs = 60 pairs
 */
export function calculateLowStockPairs(options: {
  isWholesale: boolean;
  threshold: number | string | undefined | null;
  pairsPerCarton?: number | string | undefined | null;
}): number {
  const parsedThreshold = Math.max(1, Math.round(Number(options.threshold) || 1));
  if (!options.isWholesale) {
    return parsedThreshold;
  }
  const safeCarton = normalizePairsPerCarton(options.pairsPerCarton);
  return parsedThreshold * safeCarton;
}

/**
 * Extracts carton threshold for wholesale product editing to prevent corrupting stored thresholds:
 * If an existing wholesale product has 24 pairs stored and carton size 12, displays 2 cartons.
 */
export function extractCartonThreshold(
  storedPairs: number | string | undefined | null,
  pairsPerCarton?: number | string | undefined | null
): number {
  if (storedPairs === undefined || storedPairs === null || Number(storedPairs) <= 0) {
    return 1;
  }
  const safeCarton = normalizePairsPerCarton(pairsPerCarton);
  return Math.max(1, Math.round(Number(storedPairs) / safeCarton));
}

/**
 * Determination: Half-cartons are allowed if either the store setting is enabled
 * (company_setting.allow_half_carton == true) OR the specific product override
 * is enabled (product.allow_half_carton == true).
 */
export function isHalfCartonAllowed(
  product?: { allowHalfCarton?: boolean; allow_half_carton?: boolean } | null,
  storeSetting?: { allowHalfCarton?: boolean; allow_half_carton?: boolean } | null
): boolean {
  const storeEnabled = storeSetting?.allowHalfCarton === true || storeSetting?.allow_half_carton === true;
  const productEnabled = product?.allowHalfCarton === true || product?.allow_half_carton === true;
  return storeEnabled || productEnabled;
}

/**
 * Dynamic minimum sale quantity calculation:
 * If half-cartons are allowed: min_sale_quantity = pairs_per_ctn / 2
 * Otherwise (not allowed): min_sale_quantity = pairs_per_ctn
 */
export function calculateMinSaleQuantity(
  product?: { pairsPerCarton?: number; pairs_per_carton?: number; allowHalfCarton?: boolean; allow_half_carton?: boolean } | null,
  storeSetting?: { allowHalfCarton?: boolean; allow_half_carton?: boolean } | null
): number {
  const rawPairs = Number(product?.pairsPerCarton ?? product?.pairs_per_carton ?? 12);
  const pairsPerCtn = rawPairs === 16 ? 16 : 12;
  const halfAllowed = isHalfCartonAllowed(product, storeSetting);
  return halfAllowed ? (pairsPerCtn / 2) : pairsPerCtn;
}


