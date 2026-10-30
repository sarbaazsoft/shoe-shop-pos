export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'MANAGER';
export type UserStatus = 'PENDING' | 'APPROVED';

export interface User {
  id: number;
  tenantId?: number;
  tenantName?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  originalRole?: string;
  status: UserStatus;
  active?: boolean;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionType = 'free_tier' | '6_months' | '1_year' | 'TRIAL' | '6_MONTHS' | 'YEARLY';
export type SubscriptionPlan = 'free_tier' | 'TRIAL' | '6_MONTHS' | 'YEARLY' | '6_months' | '1_year';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type BusinessType = 'RETAIL' | 'WHOLESALE';
export type PricingMode = 'FIXED' | 'NEGOTIABLE';
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type PackingType = 'PAIR' | 'CARTON';
export type SaleType = 'RETAIL' | 'WHOLESALE';
export type StoreRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type StoreRequestType = 'NEW_STORE' | 'RENEWAL';

export interface TrialActivation {
  id: number;
  userId?: number | null;
  tenantId?: number | null;
  email: string;
  userName?: string;
  phone?: string;
  storeName: string;
  businessType: BusinessType;
  pricingMode: PricingMode;
  plan: string;
  trialDurationDays: number;
  trialStartDate: string;
  trialEndDate: string;
  daysRemaining?: number;
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED';
  ipAddress?: string;
  userAgent?: string;
  activatedAt: string;
  details?: Record<string, any>;
}

export interface TenantInfo {
  id: number;
  name: string;
  status: TenantStatus;
  businessType?: BusinessType;
  pricingMode?: PricingMode;
  subscriptionType?: SubscriptionType;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: SubscriptionStatus;
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
  businessType?: BusinessType;
  pricingMode?: PricingMode;
  minSellingQuantity?: number;
  allowHalfCarton?: boolean;
  subscriptionType?: SubscriptionType;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  subscriptionStatus: SubscriptionStatus;
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
  lastSeenAt?: string | null;
  manifestUrl: string;
  appUrl: string;
  installUrl: string;
}

export interface SuperAdminReportProduct {
  id: number;
  tenantId: number;
  storeName: string;
  currency: string;
  productName: string;
  barcode: string;
  brand: string;
  category: string;
  imageUrl?: string;
  sellingPrice: number;
  costPrice: number;
  totalStock: number;
  unitsSold: number;
  totalRevenue: number;
  orderCount: number;
}

export interface SuperAdminSevenDayPoint {
  date: string;
  label: string;
  amount: number;
  txCount: number;
}

export interface SuperAdminRecentTransaction {
  id?: number;
  tenantId?: number;
  invoiceNumber?: string;
  saleDate?: string;
  cashierName?: string;
  paymentMethod?: string;
  totalAmount?: number;
  type: string;
  reference: string;
  storeName: string;
  customerName: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  timeString?: string;
}

export interface SuperAdminReportBreakdown {
  name: string;
  productCount: number;
  totalStock: number;
  unitsSold: number;
  totalRevenue: number;
  revenue?: number;
}

export interface StoreRequestRecord {
  id: number;
  storeName: string;
  ownerEmail: string;
  ownerPhone: string;
  plan: string;
  businessType?: BusinessType;
  pricingMode?: PricingMode;
  requestType?: StoreRequestType;
  notes?: string;
  provisionedTenantId?: number | null;
  status: StoreRequestStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CompanySettings {
  id: number;
  tenantId?: number;
  tenantStatus?: TenantStatus;
  businessType?: BusinessType;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: SubscriptionStatus;
  name: string;
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
  currencySymbol: string;
  invoiceFooter: string;
  lowStockLimit: number;
  pricingMode: PricingMode;
  pricingPolicyLocked: boolean;
  minSellingQuantity?: number;
  min_selling_quantity?: number;
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  updatedAt: string;
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
  pairsPerCarton?: number; // Stored product lot size for retail or wholesale
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

export type CustomerType = 'RETAILER' | 'WHOLESALER';

export interface Customer {
  id: number;
  code?: string;
  name: string;
  customerType?: CustomerType;
  customer_type?: CustomerType;
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

export interface CustomerLedgerEntry {
  id: number;
  tenantId?: number;
  customerId: number;
  transactionDate: string;
  transaction_date?: string;
  invoiceId?: number | null;
  invoice_id?: number | null;
  invoiceNumber?: string;
  invoice_number?: string;
  totalBill: number;
  total_bill?: number;
  amountPaid: number;
  amount_paid?: number;
  balanceChange: number;
  balance_change?: number;
  runningBalance: number;
  running_balance?: number;
  paymentMethod?: string;
  payment_method?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
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

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  article?: string;
  productName?: string;
  packingType?: PackingType;
  cartonQuantity?: number;
  pairsPerCarton?: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  purchasePrice: number;
}

export interface Sale {
  id: number;
  invoiceNumber: string;
  saleType?: SaleType;
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
  items?: SaleItem[];
}

export interface PurchaseItem {
  id?: number;
  purchaseId?: number;
  productId: number;
  article?: string;
  productName?: string;
  quantity: number;
  unitPurchasePrice: number;
  subtotal: number;
}

export interface Purchase {
  id: number;
  purchaseNumber: string;
  supplierName: string;
  purchaseDate: string;
  totalAmount: number;
  paidAmount?: number;
  paymentStatus?: PurchasePaymentStatus;
  paymentMethod?: string;
  notes?: string;
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  items?: PurchaseItem[];
}

export interface PurchaseReturnItem {
  id?: number;
  purchaseReturnId?: number;
  productId: number;
  article?: string;
  productName?: string;
  barcode?: string;
  quantity: number;
  unitPurchasePrice: number;
  subtotal: number;
  defectType?: string;
}

export interface PurchaseReturn {
  id: number;
  returnNumber: string;
  purchaseId?: number | null;
  purchaseNumber?: string | null;
  supplierId?: number | null;
  supplierName: string;
  supplierPhone?: string;
  returnDate: string;
  totalDebitAmount: number;
  reason: string;
  notes?: string;
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  items?: PurchaseReturnItem[];
}

export interface ReturnItem {
  id: number;
  returnId: number;
  saleItemId: number;
  productId: number;
  article?: string;
  productName?: string;
  quantity: number;
  unitRefundPrice: number;
  subtotal: number;
}

export interface ReturnRecord {
  id: number;
  returnNumber: string;
  originalSaleId: number;
  invoiceNumber?: string;
  customerId?: number | null;
  customerName?: string;
  returnDate: string;
  totalRefundAmount: number;
  reason: string;
  createdBy: number;
  createdByName?: string;
  createdAt: string;
  items?: ReturnItem[];
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

export type MovementType = 'PURCHASE' | 'SALE' | 'SALE_RETURN' | 'PURCHASE_RETURN' | 'ADJUSTMENT';

export interface StockMovement {
  id: number;
  productId: number;
  article?: string;
  productName?: string;
  qtyChange: number;
  prevStock: number;
  newStock: number;
  movementType: MovementType;
  referenceId?: string;
  userId: number;
  userName?: string;
  notes?: string;
  createdAt: string;
}

export interface ApiToken {
  id: number;
  name: string;
  token: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
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

export type AppSettingsMap = Record<string, string>;
export type AppSettingsGrouped = Record<AppSettingCategory, AppSettingItem[]>;

export type PlatformNotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'URGENT';

export interface PlatformNotification {
  id: number;
  tenantId?: number | null; // null for All Stores / Global Broadcast
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

