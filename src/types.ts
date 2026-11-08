export interface User {
  id: number;
  tenantId?: number;
  tenantName?: string;
  name: string;
  email: string;
  phone?: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'MANAGER' | string;
  originalRole?: string;
  status: 'PENDING' | 'APPROVED' | string;
  active?: boolean;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionType = 'free_tier' | '6_months' | '1_year' | 'TRIAL' | '6_MONTHS' | 'YEARLY';
export type SubscriptionPlan = 'free_tier' | 'TRIAL' | '6_MONTHS' | 'YEARLY' | '6_months' | '1_year';
export type PricingMode = 'FIXED' | 'NEGOTIABLE';

export interface TrialActivation {
  id: number;
  userId?: number | null;
  tenantId?: number | null;
  email: string;
  userName?: string;
  phone?: string;
  storeName: string;
  businessType: 'RETAIL' | 'WHOLESALE' | string;
  pricingMode: PricingMode;
  plan: string;
  trialDurationDays: number;
  trialStartDate: string;
  trialEndDate: string;
  daysRemaining?: number;
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED' | 'PENDING';
  ipAddress?: string;
  userAgent?: string;
  activatedAt: string;
  details?: Record<string, any>;
}

export interface TenantInfo {
  id: number;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | string;
  businessType?: 'RETAIL' | 'WHOLESALE' | string;
  pricingMode?: PricingMode;
  subscriptionType?: SubscriptionType;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | string;
  daysLeft?: number;
  logoUrl: string;
  address?: string;
  taxId?: string;
  currency?: string;
  onboardingCompleted: boolean;
  appPath?: string;
  manifestUrl?: string;
}

export interface SuperAdminStoreRow {
  id: number;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  businessType?: 'RETAIL' | 'WHOLESALE' | string;
  pricingMode?: PricingMode;
  minSellingQuantity?: number;
  allowHalfCarton?: boolean;
  subscriptionType?: SubscriptionType;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | string;
  daysLeft?: number;
  logoUrl: string;
  ownerEmail: string;
  ownerPhone: string;
  address: string;
  taxId: string;
  currency: string;
  onboardingCompleted: boolean;
  createdAt: string;
  productCount: number;
  totalStockUnits: number;
  salesCount: number;
  totalSales: number;
  staffCount: number;
  customerCount?: number;
  supplierCount?: number;
  unitsSold?: number;
  inventoryValue?: number;
  isOnline?: boolean;
  manifestUrl?: string;
  appUrl?: string;
  installUrl?: string;
}

export interface SuperAdminReportProduct {
  id: number;
  tenantId: number;
  storeName: string;
  currency?: string;
  productName: string;
  barcode: string;
  brand: string;
  category: string;
  imageUrl?: string;
  maxPrice: number;
  sellingPrice: number;
  costPrice: number;
  totalStock: number;
  unitsSold: number;
  totalRevenue: number;
  orderCount: number;
}

export interface SuperAdminReportBreakdown {
  name: string;
  productCount: number;
  totalStock: number;
  unitsSold: number;
  totalRevenue: number;
  revenue?: number;
}

export interface SuperAdminSevenDayPoint {
  date: string;
  label: string;
  amount: number;
  txCount: number;
}

export interface SuperAdminRecentTransaction {
  id?: number | string;
  tenantId?: number;
  type?: string;
  reference?: string;
  storeName: string;
  customerName?: string;
  amount: number;
  totalAmount?: number;
  currency?: string;
  status?: string;
  date?: string;
  saleDate?: string;
  timeString?: string;
  invoiceNumber?: string;
  cashierName?: string;
  paymentMethod?: string;
}

export interface TenantPlanBreakdown {
  plan: string;
  label: string;
  count: number;
  percentage?: number;
  activeCount: number;
  expiringCount: number;
}

export interface ExpiringTenantAlert {
  id: number;
  name: string;
  ownerEmail: string;
  ownerPhone?: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionEndDate: string;
  daysLeft: number;
  subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | string;
}

export interface CompanySettings {
  id: number;
  tenantId?: number;
  tenant_id?: number;
  tenantStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | string;
  tenant_status?: string;
  businessType?: 'RETAIL' | 'WHOLESALE' | string;
  business_type?: string;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | string;
  name: string;
  companyName?: string;
  company_name?: string;
  logo: string;
  showReceiptLogo?: boolean;
  receiptLogo?: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  strn: string;
  taxId: string;
  taxRate?: number;
  currency: string;
  currencyName: string;
  currency_name?: string;
  currencySymbol: string;
  currency_symbol?: string;
  invoiceFooter: string;
  lowStockLimit: number;
  pricingMode: PricingMode;
  pricing_mode?: PricingMode;
  pricingPolicyLocked: boolean;
  pricing_policy_locked?: boolean;
  minSellingQuantity?: number;
  min_selling_quantity?: number;
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  updatedAt: string;
  updated_at?: string;
}

export interface FcmPublicConfig {
  configured: boolean;
  projectId?: string;
  apiKey?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  vapidKey?: string;
}

export interface FcmTokenRecord {
  token: string;
  tenantId: number;
  userId: number;
  userRole: string;
  userAgent?: string;
  deviceName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Brand {
  id?: number;
  name: string;
  logo?: string;
  prefix?: string;
}

export type AiConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiProductSuggestionResult {
  title: string;
  category: {
    suggestedName: string;
    matchedName?: string | null;
    matchedId?: number | null;
    isExisting?: boolean;
    confidence?: AiConfidenceLevel;
  };
  brand: {
    suggestedName: string;
    matchedName?: string | null;
    matchedId?: number | null;
    isExisting?: boolean;
    isUnknown?: boolean;
    confidence?: AiConfidenceLevel;
  };
  confidence: AiConfidenceLevel;
  shoeType?: string;
  isFootwear?: boolean;
  visualClues?: string[];
}

export interface Category {
  id?: number;
  name: string;
  productCount?: number;
  totalUnits?: number;
}

export interface Product {
  id: number;
  tenantId?: number;
  article: string;
  name?: string;
  brand: string;
  brandName?: string;
  brandLogo?: string;
  category: string;
  categoryName?: string;
  barcode: string;
  primaryImageUrl: string;
  description?: string;
  costPrice: number;
  sellingPrice: number;
  minPrice: number;
  maxPrice: number;
  pairsPerCarton?: number;
  pairs_per_carton?: number;
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  minSaleQuantity?: number;
  min_sale_quantity?: number;
  salePrice?: number | null;
  minSalePrice?: number | null;
  maxSalePrice?: number | null;
  totalStock: number;
  lowStockLimit: number;
  lowStockAlert?: number;
  low_stock_limit?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Product create/update payload. Pricing behavior comes from store settings. */
export interface ProductFormValues extends Pick<
  Product,
  'article' | 'brand' | 'category' | 'barcode' | 'costPrice' | 'minPrice' | 'maxPrice' | 'sellingPrice' | 'totalStock'
> {
  name?: string;
  primaryImageUrl?: string;
  description?: string;
  pairsPerCarton?: 12 | 16;
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  lowStockLimit?: number;
  lowStockAlert?: number;
  low_stock_limit?: number;
  lowStockThresholdCartons?: number;
}

export interface Customer {
  id: number;
  code?: string;
  name: string;
  customerType?: 'RETAILER' | 'WHOLESALER' | string;
  customer_type?: 'RETAILER' | 'WHOLESALER' | string;
  shopName?: string;
  marketName?: string;
  city?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
  currentBalance?: number;
  outstandingBalance?: number;
  outstanding_balance?: number;
  ntnNumber?: string;
  totalPurchases?: number;
  totalOrders?: number;
  totalSpent?: number;
  loyaltyPoints?: number;
  balance?: number | string;
  lastVisit?: string | null;
  createdAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  balance?: number | string;
  totalPurchases?: number;
  totalPurchasedAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  productId: number;
  article?: string;
  name?: string;
  productName?: string;
  brandName?: string;
  brandLogo?: string;
  barcode: string;
  quantity: number;
  pairsPerCarton?: number;
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  unitPrice: number;
  sellingPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  salePrice?: number;
  minSalePrice: number;
  maxSalePrice?: number;
  costPrice: number;
  discount: number;
  subtotal?: number;
  total?: number;
  totalStock: number;
  isPriceOverridden?: boolean;
  originalPrice?: number;
}

export interface Sale {
  id: number;
  invoiceNumber: string;
  saleType?: 'RETAIL' | 'WHOLESALE' | string;
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string;
  customerShopName?: string;
  customerCity?: string;
  saleDate: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  totalCartons?: number;
  transportName?: string;
  biltyNumber?: string;
  bookingDestination?: string;
  previousBalance?: number;
  paidAmount?: number;
  remainingBalance?: number;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | 'KHATA' | 'ONLINE' | 'BANK_TRANSFER' | string;
  cashReceived: number;
  changeGiven: number;
  createdBy: number;
  createdByName?: string;
  isMinPriceOverridden: boolean;
  overriddenBy?: number | null;
  notes?: string;
  createdAt: string;
  items?: any[];
}

export interface Purchase {
  id: number;
  purchaseNumber: string;
  supplierName: string;
  purchaseDate: string;
  totalAmount: number;
  paidAmount?: number;
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | string;
  paymentMethod?: string;
  notes?: string;
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  items?: any[];
}

export interface ExchangeItem {
  saleItemId: number;
  productId: number;
  article: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitRefundPrice: number;
  subtotal: number;
}

export interface ActiveExchange {
  originalSaleId: number;
  originalInvoiceNumber: string;
  originalSaleDate?: string;
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string;
  reason: string;
  items: ExchangeItem[];
}

export type AppSettingCategory = 'billing' | 'email' | 'notifications' | 'system';

export interface AppSettingItem {
  key: string;
  value: string;
  category: AppSettingCategory;
  description: string;
  isSecret: boolean;
  updatedAt?: string;
}

export type PlatformNotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'URGENT';

export interface PlatformNotification {
  id: number;
  tenantId?: number | null; // null for All Stores / Global Broadcast
  targetRole?: 'ALL' | 'ADMIN' | 'CASHIER' | 'SUPERADMIN';
  storeName?: string; // e.g. "All Stores" or specific store name
  title: string;
  message: string;
  type: PlatformNotificationType;
  actionUrl?: string;
  actionLabel?: string;
  createdBy?: number;
  createdByName?: string;
  createdAt: string;
  expiresAt?: string | null;
  readCount?: number;
  isRead?: boolean;
}

export interface GroupedNotificationsResponse {
  notices: PlatformNotification[];
  notifications: Array<{
    id: string; // e.g. "sale-101"
    rawId: number;
    itemType: 'SALE' | 'RETURN' | 'EXCHANGE' | 'COUNTER_EVENT' | string;
    type: string;
    title: string;
    message: string;
    totalAmount?: number;
    invoiceNumber?: string;
    returnNumber?: string;
    deepLinkUrl?: string;
    actionTab?: string;
    createdAt: string;
    timestamp: string;
    isRead?: boolean;
  }>;
  unreadNoticesCount: number;
  unreadNotificationsCount: number;
  totalUnread: number;
  limit: number;
}

export interface HistoricalNotificationItem {
  id: string;
  rawId: number;
  kind: 'NOTICE' | 'OPERATIONAL';
  itemType: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  deepLinkUrl?: string;
  totalAmount?: number;
  invoiceNumber?: string;
  returnNumber?: string;
  tenantId?: number | null;
  targetRole?: string;
  createdAt: string;
  expiresAt?: string | null;
  isRead: boolean;
}

export interface AllNotificationsResponse {
  items: HistoricalNotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    totalNotices: number;
    totalOperational: number;
    unreadNotices: number;
    unreadOperational: number;
  };
}
