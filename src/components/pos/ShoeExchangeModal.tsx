import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertCircle, ArrowRight, X, Repeat, Minus, Plus, Package, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '../../services/api.ts';
import { playAudioFeedback } from '../../utils/audio.ts';
import { formatStockPrice } from '../../utils/priceFormat.ts';
import { calculateReturnNetUnitPrice } from '../../utils/posCalculations.ts';
import type { ActiveExchange, ExchangeItem } from '../../types.ts';

interface ShoeExchangeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onApplyExchange: (exchange: ActiveExchange) => void;
  currencySymbol?: string;
  companySettings?: any;
}

interface WholesaleReturnDraftItem {
  productId: number;
  article: string;
  productName: string;
  barcode?: string;
  pairsPerCarton: number;
  quantity: number;
  unitRefundPrice: number;
  subtotal: number;
}

export const ShoeExchangeModal: React.FC<ShoeExchangeModalProps> = ({
  isOpen = true,
  onClose,
  onApplyExchange,
  currencySymbol = 'PKR',
  companySettings,
}) => {
  const isWholesaleStore =
    String(companySettings?.businessType || companySettings?.business_type || '').toUpperCase() === 'WHOLESALE';

  // Common State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Retail-specific Exchange State (Requires Invoice Number)
  const [retailInvoiceInput, setRetailInvoiceInput] = useState('');
  const [isVerifyingRetail, setIsVerifyingRetail] = useState(false);
  const [verifiedSale, setVerifiedSale] = useState<any | null>(null);
  const [selectedQtys, setSelectedQtys] = useState<Record<number, number>>({});
  const [retailReason, setRetailReason] = useState('Size replacement (e.g. 41 -> 42)');
  const retailInputRef = useRef<HTMLInputElement>(null);

  // Wholesale-specific Return State (NO Invoice Required)
  const [wholesaleInvoiceInput, setWholesaleInvoiceInput] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [wholesaleReturnItems, setWholesaleReturnItems] = useState<WholesaleReturnDraftItem[]>([]);
  const [wholesaleReason, setWholesaleReason] = useState('Defective Sole / Upper');
  const wholesaleSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (isWholesaleStore) {
        setWholesaleInvoiceInput('');
        setProductSearchQuery('');
        setProductSearchResults([]);
        setWholesaleReturnItems([]);
        setWholesaleReason('Defective Sole / Upper');
        setTimeout(() => {
          wholesaleSearchInputRef.current?.focus();
        }, 120);
      } else {
        setRetailInvoiceInput('');
        setVerifiedSale(null);
        setSelectedQtys({});
        setRetailReason('Size replacement (e.g. 41 -> 42)');
        setTimeout(() => {
          retailInputRef.current?.focus();
        }, 120);
      }
    }
  }, [isOpen, isWholesaleStore]);

  if (!isOpen) return null;

  // =========================================================================
  // RETAIL FLOW: Look Up Sale Invoice & Select Items
  // =========================================================================
  const handleRetailLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = retailInvoiceInput.trim();
    if (!inv) return;

    setIsVerifyingRetail(true);
    setErrorMessage(null);

    try {
      const res = await api.returns.verifyInvoice(inv);
      const sale = res.sale;
      const items = res.items || sale?.items || [];
      const saleWithItems = { ...sale, items };
      setVerifiedSale(saleWithItems);

      // Pre-select 1 qty for the first item that has returnable stock
      const initialQtys: Record<number, number> = {};
      let firstSelected = false;
      items.forEach((item: any) => {
        if (!firstSelected && item.returnableQuantity > 0) {
          initialQtys[item.id] = 1;
          firstSelected = true;
        } else {
          initialQtys[item.id] = 0;
        }
      });
      setSelectedQtys(initialQtys);
      playAudioFeedback.barcodeScan();
    } catch (err: any) {
      playAudioFeedback.warning();
      setErrorMessage(err.message || 'Invoice not found or invalid.');
      setVerifiedSale(null);
    } finally {
      setIsVerifyingRetail(false);
    }
  };

  const handleRetailQtyChange = (itemId: number, delta: number, maxReturnable: number) => {
    const current = selectedQtys[itemId] || 0;
    const next = Math.max(0, Math.min(current + delta, maxReturnable));
    setSelectedQtys((prev) => ({ ...prev, [itemId]: next }));
  };

  const retailItems = verifiedSale?.items || [];

  const totalRetailExchangeCredit = retailItems.reduce((acc: number, item: any) => {
    const qty = selectedQtys[item.id] || 0;
    const netUnitPrice = calculateReturnNetUnitPrice(item);
    return acc + qty * netUnitPrice;
  }, 0);

  const totalRetailReturnCount = Object.values(selectedQtys).reduce((a: number, b: number) => a + (Number(b) || 0), 0);

  const handleConfirmRetailExchange = () => {
    if (!verifiedSale) return;

    const exchangeItems: ExchangeItem[] = [];
    for (const item of retailItems) {
      const qty = selectedQtys[item.id] || 0;
      if (qty > 0) {
        const netUnitPrice = calculateReturnNetUnitPrice(item);
        exchangeItems.push({
          saleItemId: item.id,
          productId: item.productId,
          article: item.article || item.productName || 'Shoe',
          productName: item.productName || item.article || 'Shoe',
          barcode: item.barcode,
          quantity: qty,
          unitRefundPrice: netUnitPrice,
          subtotal: Math.round(qty * netUnitPrice * 100) / 100,
        });
      }
    }

    if (exchangeItems.length === 0) {
      setErrorMessage('Please select at least 1 shoe item to return/exchange.');
      return;
    }

    const activeExchange: ActiveExchange = {
      originalSaleId: verifiedSale.id,
      originalInvoiceNumber: verifiedSale.invoiceNumber,
      originalSaleDate: verifiedSale.saleDate,
      customerId: verifiedSale.customerId || null,
      customerName: verifiedSale.customerName,
      customerPhone: verifiedSale.customerPhone,
      reason: retailReason.trim() || 'Direct Shoe Exchange at POS',
      items: exchangeItems,
    };

    playAudioFeedback.barcodeScan();
    onApplyExchange(activeExchange);
    onClose();
  };

  // =========================================================================
  // WHOLESALE FLOW: Direct Product Return without Invoice Requirement
  // =========================================================================
  const handleSearchProducts = async (q: string) => {
    setProductSearchQuery(q);
    const clean = q.trim();
    if (!clean) {
      setProductSearchResults([]);
      setIsSearchingProducts(false);
      return;
    }
    setIsSearchingProducts(true);
    try {
      const res = await api.products.list({ search: clean, limit: 10 });
      setProductSearchResults(res.products || []);
    } catch {
      setProductSearchResults([]);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  const handleSelectProductForWholesaleReturn = (prod: any) => {
    const ppc = Number(prod.pairsPerCarton || prod.pairs_per_carton || 12);
    const defaultQty = ppc > 0 ? ppc : 12;
    const defaultPrice = Math.round(Number(prod.wholesalePrice || prod.wholesale_price || prod.salePrice || prod.sale_price || prod.retailPrice || prod.retail_price || 0));

    setWholesaleReturnItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === prod.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + defaultQty;
        updated[existingIdx].quantity = newQty;
        updated[existingIdx].subtotal = Math.round(newQty * updated[existingIdx].unitRefundPrice * 100) / 100;
        return updated;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          article: prod.article || prod.name || 'Shoe Article',
          productName: prod.name || prod.article || 'Shoe',
          barcode: prod.barcode,
          pairsPerCarton: ppc,
          quantity: defaultQty,
          unitRefundPrice: defaultPrice,
          subtotal: defaultQty * defaultPrice,
        },
      ];
    });

    setProductSearchQuery('');
    setProductSearchResults([]);
    playAudioFeedback.barcodeScan();
  };

  const updateWholesaleItemQty = (productId: number, newQty: number) => {
    const validQty = Math.max(1, isNaN(newQty) ? 1 : Math.round(newQty));
    setWholesaleReturnItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: validQty,
              subtotal: Math.round(validQty * item.unitRefundPrice * 100) / 100,
            }
          : item
      )
    );
  };

  const updateWholesaleItemRate = (productId: number, newRate: number) => {
    const validRate = Math.max(0, isNaN(newRate) ? 0 : Math.round(newRate));
    setWholesaleReturnItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              unitRefundPrice: validRate,
              subtotal: Math.round(item.quantity * validRate * 100) / 100,
            }
          : item
      )
    );
  };

  const removeWholesaleItem = (productId: number) => {
    setWholesaleReturnItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const totalWholesaleReturnCredit = wholesaleReturnItems.reduce((acc, i) => acc + i.subtotal, 0);
  const totalWholesalePairsCount = wholesaleReturnItems.reduce((acc, i) => acc + i.quantity, 0);

  const handleConfirmWholesaleReturn = () => {
    if (wholesaleReturnItems.length === 0) {
      setErrorMessage('Please search and add at least 1 shoe item being returned.');
      return;
    }

    const exchangeItems: ExchangeItem[] = wholesaleReturnItems.map((item) => ({
      saleItemId: 0,
      productId: item.productId,
      article: item.article,
      productName: item.productName,
      barcode: item.barcode,
      quantity: item.quantity,
      unitRefundPrice: item.unitRefundPrice,
      subtotal: Math.round(item.quantity * item.unitRefundPrice * 100) / 100,
    }));

    const activeReturn: ActiveExchange = {
      originalSaleId: 0,
      originalInvoiceNumber: wholesaleInvoiceInput.trim() || 'Direct Return',
      originalSaleDate: new Date().toISOString().slice(0, 10),
      reason: wholesaleReason.trim() || 'Wholesale Dealer Shoe Return',
      items: exchangeItems,
    };

    playAudioFeedback.barcodeScan();
    onApplyExchange(activeReturn);
    onClose();
  };

  const retailReasonChips = [
    'Size replacement (e.g. 41 -> 42)',
    'Different style / model',
    'Color change',
    'Fit issue / discomfort',
    'Customer preference',
  ];

  const wholesaleReasonChips = [
    'Defective Sole / Upper',
    'Wrong Article Delivered',
    'Dealer Overstock Return',
    'Customer Return',
    'Transit Damage',
  ];

  return (
    <div className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl app-modal-container flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-900 dark:text-white">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl shadow-2xs border ${
              isWholesaleStore
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-blue-900/50'
            }`}>
              {isWholesaleStore ? <RotateCcw className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isWholesaleStore ? 'Dealer Shoe Return' : 'Direct Shoe Exchange'}</span>
                <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isWholesaleStore
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border-blue-200 dark:border-blue-900/50'
                }`}>
                  {isWholesaleStore ? 'Wholesale Return (No Invoice Req.)' : 'POS Combined Flow'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isWholesaleStore
                  ? 'Process returned footwear directly against current invoice with automatic balance deduction'
                  : 'Return customer shoe & scan replacement with automatic net difference calculation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center space-x-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* =================================================================== */}
          {/* WHOLESALE VIEW: NO INVOICE REQUIREMENT                              */}
          {/* =================================================================== */}
          {isWholesaleStore ? (
            <div className="space-y-4">
              {/* Optional Reference Invoice */}
              <div className="p-3 bg-slate-50 dark:bg-[#0A0E1A] border border-slate-200 dark:border-slate-800 rounded-xl">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Original Invoice # <span className="text-[10px] text-slate-400 font-normal">(Optional — Not Required)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-000123 (or leave blank for direct return)"
                  value={wholesaleInvoiceInput}
                  onChange={(e) => setWholesaleInvoiceInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131B2E] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
              </div>

              {/* Product Search & Barcode Scan for Returned Footwear */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  1. Search or Scan Footwear Article to Return
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={wholesaleSearchInputRef}
                    type="text"
                    placeholder="Scan barcode or type shoe article name to add returned pairs..."
                    value={productSearchQuery}
                    onChange={(e) => handleSearchProducts(e.target.value)}
                    className="app-input w-full pl-[2.125rem] pr-8 py-2.5 text-xs font-medium"
                  />
                  {isSearchingProducts ? (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-600 dark:text-purple-400 pointer-events-none">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  ) : productSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearchQuery('');
                        setProductSearchResults([]);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* Dropdown suggestions */}
                {productSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-[#0E1628] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {productSearchResults.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => handleSelectProductForWholesaleReturn(prod)}
                        className="p-2.5 flex items-center justify-between hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer transition"
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">{prod.article || prod.name}</span>
                          {prod.brandName && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-2">({prod.brandName})</span>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono">Barcode: {prod.barcode || 'N/A'}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {currencySymbol} {formatStockPrice(prod.wholesalePrice || prod.salePrice || 0)} /pr
                          </span>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-semibold">
                            + Add to Return
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Returned Items List */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  2. Footwear Items Being Returned ({wholesaleReturnItems.length})
                </label>
                {wholesaleReturnItems.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                    <Package className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
                    <p className="font-semibold">No returned items added yet.</p>
                    <p className="text-[11px] mt-0.5">Use the search box above to scan or select shoes being returned by the dealer.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs overflow-hidden">
                    {wholesaleReturnItems.map((item) => (
                      <div key={item.productId} className="p-3 flex flex-wrap items-center justify-between gap-3 bg-amber-50/40 dark:bg-amber-950/20">
                        <div className="flex-1 min-w-[140px]">
                          <strong className="block text-slate-900 dark:text-white text-sm font-bold">{item.article}</strong>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.pairsPerCarton} pairs/carton • Subtotal: {currencySymbol} {formatStockPrice(item.subtotal)}
                          </span>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => updateWholesaleItemQty(item.productId, item.quantity - 6)}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold"
                            title="Minus 6 pairs (half-carton)"
                          >
                            -6
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateWholesaleItemQty(item.productId, parseInt(e.target.value, 10))}
                            className="w-16 px-1.5 py-1 text-center font-mono font-bold text-xs bg-white dark:bg-[#0A0E1A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => updateWholesaleItemQty(item.productId, item.quantity + 6)}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold"
                            title="Add 6 pairs (half-carton)"
                          >
                            +6
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono">prs</span>
                        </div>

                        {/* Unit Refund Rate */}
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-500">Rate:</span>
                          <input
                            type="number"
                            min="0"
                            value={item.unitRefundPrice}
                            onChange={(e) => updateWholesaleItemRate(item.productId, parseFloat(e.target.value))}
                            className="w-20 px-1.5 py-1 text-right font-mono font-bold text-xs bg-white dark:bg-[#0A0E1A] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <span className="text-[10px] text-slate-500">/pr</span>
                        </div>

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeWholesaleItem(item.productId)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3: Reason for Wholesale Return */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  3. Reason for Return
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {wholesaleReasonChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setWholesaleReason(chip)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                        wholesaleReason === chip
                          ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-500 text-amber-900 dark:text-amber-200 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-400/40'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={wholesaleReason}
                  onChange={(e) => setWholesaleReason(e.target.value)}
                  placeholder="Specify reason for return (e.g. Defective Sole, Article replacement)..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0A0E1A] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Wholesale Return Credit Banner */}
              <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-300/80 dark:border-amber-800/80 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase font-extrabold tracking-wider text-amber-800 dark:text-amber-300">
                    Total Return Credit (Deducted from Invoice Remaining Balance)
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {totalWholesalePairsCount} shoe {totalWholesalePairsCount === 1 ? 'pair' : 'pairs'} selected for return
                  </div>
                </div>
                <div className="text-2xl font-black font-mono text-amber-900 dark:text-amber-200">
                  {currencySymbol} {formatStockPrice(totalWholesaleReturnCredit)}
                </div>
              </div>
            </div>
          ) : (
            /* =================================================================== */
            /* RETAIL VIEW: UNTOUCHED ORIGINAL EXCHANGE INVOICE VERIFICATION FLOW  */
            /* =================================================================== */
            <div className="space-y-4">
              {/* Step 1: Invoice Search Bar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  1. Original Receipt / Invoice Number
                </label>
                <form onSubmit={handleRetailLookup} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={retailInputRef}
                      type="text"
                      placeholder="Scan receipt barcode or enter invoice # (e.g. INV-000001)..."
                      value={retailInvoiceInput}
                      onChange={(e) => setRetailInvoiceInput(e.target.value)}
                      className="app-input w-full pl-[2.125rem] pr-8 py-2.5 text-xs font-mono font-bold"
                    />
                    {retailInvoiceInput && (
                      <button
                        type="button"
                        onClick={() => setRetailInvoiceInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 p-1 cursor-pointer"
                        title="Clear"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isVerifyingRetail || !retailInvoiceInput.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-bold border border-purple-400/40 dark:border-purple-400/50 flex items-center space-x-1.5 shrink-0 shadow-md shadow-purple-600/25 transition disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    <Search className="w-4 h-4" />
                    <span>{isVerifyingRetail ? 'Verifying...' : 'Look Up Invoice'}</span>
                  </button>
                </form>
              </div>

              {/* Step 2: Invoice Details & Select Shoes to Return */}
              {verifiedSale && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 bg-slate-50 dark:bg-[#0A0E1A] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Invoice:</span>{' '}
                      <strong className="text-slate-900 dark:text-white font-mono">{verifiedSale.invoiceNumber}</strong>
                      <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Date:</span>{' '}
                      <span className="text-slate-800 dark:text-slate-200">{verifiedSale.saleDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Customer:</span>{' '}
                      <strong className="text-slate-900 dark:text-white">{verifiedSale.customerName}</strong>
                      {verifiedSale.customerPhone && verifiedSale.customerPhone !== '-' && (
                        <span className="text-slate-500 dark:text-slate-400 font-mono ml-1">({verifiedSale.customerPhone})</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      2. Select Shoe(s) Customer is Returning
                    </label>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {retailItems.map((item: any) => {
                        const isFullyReturned = item.returnableQuantity <= 0;
                        const qty = selectedQtys[item.id] || 0;
                        const netUnitPrice = calculateReturnNetUnitPrice(item);
                        const isSelected = qty > 0;

                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 flex items-center justify-between gap-3 transition ${
                              isSelected
                                ? 'bg-amber-50/80 dark:bg-amber-950/30 border-l-4 border-amber-500'
                                : isFullyReturned
                                ? 'bg-slate-50/60 dark:bg-slate-900/40 opacity-60'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white text-sm">
                                {item.article || item.productName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex flex-wrap gap-x-3 mt-0.5">
                                {item.barcode && <span>Barcode: {item.barcode}</span>}
                                <span>Sold: {item.soldQuantity}</span>
                                <span>Returned: {item.alreadyReturnedQuantity}</span>
                                <span className={item.returnableQuantity > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                                  Returnable: {item.returnableQuantity}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {currencySymbol} {formatStockPrice(netUnitPrice)}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">Credit / Pair</div>
                            </div>

                            <div className="shrink-0">
                              {isFullyReturned ? (
                                <span className="text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md">
                                  Already Returned
                                </span>
                              ) : (
                                <div className="flex items-center space-x-1.5 bg-white dark:bg-[#0A0E1A] border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleRetailQtyChange(item.id, -1, item.returnableQuantity)}
                                    disabled={qty === 0}
                                    className="p-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="w-6 text-center font-bold font-mono text-sm text-slate-900 dark:text-white">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRetailQtyChange(item.id, 1, item.returnableQuantity)}
                                    disabled={qty >= item.returnableQuantity}
                                    className="p-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 3: Reason for Exchange */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      3. Reason for Exchange
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {retailReasonChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setRetailReason(chip)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                            retailReason === chip
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={retailReason}
                      onChange={(e) => setRetailReason(e.target.value)}
                      placeholder="Specify reason (e.g. Size 41 was too tight, exchanging for Size 42)..."
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0A0E1A] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950/40 outline-none"
                    />
                  </div>

                  {/* Exchange Credit Banner */}
                  <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-300/80 dark:border-amber-800/80 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase font-extrabold tracking-wider text-amber-800 dark:text-amber-300">
                        Total Return Credit (Deducted from POS Cart)
                      </div>
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        {totalRetailReturnCount} shoe {totalRetailReturnCount === 1 ? 'pair' : 'pairs'} selected for return
                      </div>
                    </div>
                    <div className="text-2xl font-black font-mono text-amber-900 dark:text-amber-200">
                      {currencySymbol} {formatStockPrice(totalRetailExchangeCredit)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          {isWholesaleStore ? (
            <button
              type="button"
              onClick={handleConfirmWholesaleReturn}
              disabled={wholesaleReturnItems.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl text-xs font-bold border border-amber-400 flex items-center space-x-2 disabled:opacity-50 shadow-md transition cursor-pointer active:scale-95"
            >
              <span>Apply Return to Current Invoice</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmRetailExchange}
              disabled={!verifiedSale || totalRetailReturnCount === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-bold border border-purple-400/40 dark:border-purple-400/50 flex items-center space-x-2 disabled:opacity-50 shadow-md shadow-purple-600/25 transition cursor-pointer active:scale-95"
            >
              <span>Apply Exchange to POS Cart</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
