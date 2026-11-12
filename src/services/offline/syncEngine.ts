/**
 * Modular FIFO Offline Sync Engine.
 * Handles idempotent payload serialization, transient network error detection,
 * and chronological queue replay without coupling to DOM/IndexedDB globals.
 */

import type {
  QueuedSale,
  OfflineSyncResult,
  OfflineSyncStorageAdapter,
  OfflineSyncTransport,
} from './offlineTypes.ts';

export function buildCheckoutRequestPayload(sale: QueuedSale): any {
  const payload: any = {
    clientTxId: sale.clientTxId,
    saleDate: sale.createdAt,
    items: sale.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
    })),
    customerId: sale.customerId,
    paymentMethod: sale.paymentMethod,
    transactionId: sale.transactionId,
    cashReceived: sale.cashReceived,
    changeGiven: sale.changeGiven,
    notes: sale.notes,
    isMinPriceOverridden: Boolean(sale.isMinPriceOverridden),
    adminOverrideEmail: sale.adminOverrideEmail,
    adminOverridePassword: sale.adminOverridePassword,
  };

  if (sale.exchange && Array.isArray(sale.exchange.items) && sale.exchange.items.length > 0) {
    payload.exchange = {
      originalInvoiceNumber: sale.exchange.originalInvoiceNumber,
      items: sale.exchange.items.map((ex: any) => ({
        saleItemId: ex.saleItemId,
        productId: ex.productId,
        returnQty: ex.returnQty || ex.quantity || 1,
      })),
    };
  }

  return payload;
}

export function isTransientNetworkError(err: unknown): boolean {
  const rawMsg = String((err as any)?.message || err || '');
  return (
    rawMsg.includes('Failed to fetch') ||
    rawMsg.includes('NetworkError') ||
    rawMsg.includes('Network request failed') ||
    rawMsg.includes('Load failed') ||
    rawMsg.includes('ERR_CONNECTION') ||
    rawMsg.includes('abort')
  );
}

/**
 * Replays pending/failed offline sales in strict chronological (FIFO) order
 * to preserve sequential inventory stock deductions.
 */
export async function processOfflineSalesQueue(
  storage: OfflineSyncStorageAdapter,
  transport: OfflineSyncTransport,
  onProgress?: () => void
): Promise<OfflineSyncResult> {
  const allSales = await storage.getSales();
  const pendingSales = allSales.filter((s) => s.status === 'PENDING' || s.status === 'FAILED');

  if (pendingSales.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const sorted = [...pendingSales].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let synced = 0;
  let failed = 0;
  let abortedByNetwork = false;

  for (const sale of sorted) {
    try {
      await storage.updateSaleStatus(sale.clientTxId, 'SYNCING');
      onProgress?.();

      const payload = buildCheckoutRequestPayload(sale);
      const res = await transport.submitCheckout(payload);

      await storage.updateSaleStatus(sale.clientTxId, 'SYNCED', {
        syncedInvoiceNumber: res?.sale?.invoiceNumber || res?.invoiceNumber,
        syncedAt: new Date().toISOString(),
        errorMessage: undefined,
      });

      synced++;
    } catch (err: any) {
      if (isTransientNetworkError(err)) {
        await storage.updateSaleStatus(sale.clientTxId, 'PENDING', {
          errorMessage: 'Server offline (will auto-retry on reconnect)',
        });
        failed++;
        abortedByNetwork = true;
        break;
      } else {
        await storage.updateSaleStatus(sale.clientTxId, 'FAILED', {
          errorMessage: String(err?.message || err || 'Unknown sync error'),
        });
        failed++;
      }
    }
  }

  return { synced, failed, abortedByNetwork };
}
