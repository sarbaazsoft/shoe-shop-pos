/**
 * Clean modular domain contracts for offline POS transaction queuing & synchronization.
 * Decouples storage/transport interfaces from React UI components.
 */

export interface QueuedSaleItem {
  productId: number;
  article?: string;
  name?: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal?: number;
  totalStock?: number;
}

export interface QueuedSale {
  clientTxId: string;
  tenantId?: number | null;
  createdAt: string;
  items: QueuedSaleItem[];
  customerId: number | null;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | 'BANK_TRANSFER' | 'ONLINE' | 'KHATA' | string;
  transactionId?: string;
  cashReceived: number;
  changeGiven: number;
  subtotal?: number;
  totalDiscount?: number;
  totalAmount: number;
  notes: string;
  cashierName?: string;
  cashierId?: number;
  authToken?: string;
  isMinPriceOverridden?: boolean;
  adminOverrideEmail?: string;
  adminOverridePassword?: string;
  exchange?: any | null;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
  syncedInvoiceNumber?: string;
  syncedAt?: string;
}

export interface OfflineSyncResult {
  synced: number;
  failed: number;
  abortedByNetwork?: boolean;
}

export interface OfflineSyncStorageAdapter {
  getSales(): Promise<QueuedSale[]>;
  updateSaleStatus(
    clientTxId: string,
    status: QueuedSale['status'],
    extra?: { syncedInvoiceNumber?: string; errorMessage?: string; syncedAt?: string }
  ): Promise<void>;
}

export interface OfflineSyncTransport {
  submitCheckout(payload: any): Promise<{ sale?: { invoiceNumber?: string }; invoiceNumber?: string }>;
}
