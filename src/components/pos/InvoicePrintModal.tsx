import React, { useState, useEffect, useMemo } from 'react';
import { Printer, X, FileText, Receipt, CheckCircle, Zap, MessageCircle, Send, Copy, Smartphone, ChevronDown, ChevronUp, Package, Truck } from 'lucide-react';
import { formatStockPrice } from '../../utils/priceFormat.ts';
import { executePrintReceipt, getSavedPrinterSettings } from '../../utils/printer/printerManager.ts';
import { buildWhatsAppInvoiceText, buildSmsInvoiceText, buildWhatsAppLink, buildSmsLink } from '../../utils/pdfExport.ts';

interface InvoicePrintModalProps {
  sale: any;
  companySettings: any;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  sale,
  companySettings,
  onClose,
}) => {
  // ---------------------------------------------------------------------------
  // 1. Customer Type & Transaction Mode Resolution
  // ---------------------------------------------------------------------------
  const customerTypeRaw = String(
    sale.customer_type ||
    sale.customerType ||
    sale.customer?.customer_type ||
    sale.customer?.customerType ||
    sale.customer?.type ||
    ''
  ).toUpperCase();

  const isExplicitWholesaler =
    customerTypeRaw === 'WHOLESALER' ||
    customerTypeRaw === 'WHOLESALE' ||
    customerTypeRaw === 'DEALER';

  const isExplicitRetailer =
    customerTypeRaw === 'RETAILER' ||
    customerTypeRaw === 'RETAIL' ||
    customerTypeRaw === 'WALK_IN';

  const isWholesaleStore =
    String(companySettings?.businessType || companySettings?.business_type || '').toUpperCase() === 'WHOLESALE';

  const isWholesaleSale =
    String(sale.sale_type || sale.saleType || '').toUpperCase() === 'WHOLESALE';

  const hasWholesaleAttributes = Boolean(
    sale.customer_shop_name ||
    sale.customer?.shop_name ||
    sale.customer?.shopName ||
    sale.bilty_number ||
    sale.transport_name ||
    (Number(sale.total_cartons) > 0)
  );

  // Wholesale if explicitly wholesale customer, OR (not explicit retailer AND (wholesale sale or wholesale store or wholesale dispatch attributes))
  const isWholesaleTransaction =
    isExplicitWholesaler ||
    (!isExplicitRetailer && (isWholesaleSale || isWholesaleStore || hasWholesaleAttributes));

  // Layout behavior based on customer & transaction type:
  // - Retail Invoices: Always default to 50mm thermal receipt preview for all retail transactions.
  // - Wholesale Invoices: Default to A4 invoice preview for wholesale transactions.
  const [selectedFormat, setSelectedFormat] = useState<'thermal_50mm' | 'a4'>(() => {
    return isWholesaleTransaction ? 'a4' : 'thermal_50mm';
  });

  const useThermalLayout = selectedFormat === 'thermal_50mm';
  const [printerSettings] = useState(getSavedPrinterSettings());
  const [isPrintingDirect, setIsPrintingDirect] = useState(false);
  const [directFeedback, setDirectFeedback] = useState<string | null>(null);

  // Identify whether customer is a registered profile customer (not walk-in) with a set phone number
  const customerName = String(sale.customer_name || sale.customer?.name || '').trim();
  const customerPhone = String(sale.customer_phone || sale.customer?.phone || '').trim();
  const isWalkInCustomer =
    !customerName ||
    /^(walk[\s-]?in(\s+customer)?|counter(\s+sale)?|cash(\s+customer)?)$/i.test(customerName);
  const hasCustomerPhone = customerPhone.length > 0;
  const shouldShowDigitalReceipt = !isWalkInCustomer && hasCustomerPhone;

  // Wholesale Dealer & Cargo Details
  const dealerShopName = String(
    sale.customer_shop_name ||
    sale.customer?.shop_name ||
    sale.customer?.shopName ||
    ''
  ).trim();
  const dealerMarket = String(
    sale.customer_market_name ||
    sale.customer?.market_name ||
    sale.customer?.marketName ||
    ''
  ).trim();
  const dealerCity = String(
    sale.customer_city ||
    sale.customer?.city ||
    ''
  ).trim();
  const dealerNtn = String(
    sale.customer_ntn ||
    sale.customer?.ntn_number ||
    sale.customer?.ntnNumber ||
    ''
  ).trim();
  const transportName = String(sale.transport_name || '').trim();
  const biltyNumber = String(sale.bilty_number || '').trim();
  const bookingDestination = String(sale.booking_destination || '').trim();
  const items = sale.items || [];

  // Wholesale Calculations & Half-Carton Detection
  const { totalPairsDispatched, calculatedTotalCartons, halfCartonItemsCount, fullCartonsCount } = useMemo(() => {
    let pairsSum = 0;
    let cartonsSum = 0;
    let halfCount = 0;
    let fullCount = 0;

    items.forEach((it: any) => {
      const qty = Number(it.quantity) || 0;
      pairsSum += qty;
      const ppc = Number(it.pairs_per_carton || it.pairsPerCarton || 12);
      const rawCtn = it.carton_quantity !== undefined && it.carton_quantity !== null
        ? parseFloat(String(it.carton_quantity))
        : (it.cartonQuantity !== undefined && it.cartonQuantity !== null
            ? parseFloat(String(it.cartonQuantity))
            : (qty / ppc));
      const ctn = !isNaN(rawCtn) && rawCtn > 0 ? rawCtn : (qty / ppc);
      cartonsSum += ctn;

      if (ctn === 0.5 || ctn % 1 === 0.5) {
        halfCount += 1;
        fullCount += Math.floor(ctn);
      } else {
        fullCount += Math.round(ctn);
      }
    });

    return {
      totalPairsDispatched: pairsSum,
      calculatedTotalCartons: cartonsSum,
      halfCartonItemsCount: halfCount,
      fullCartonsCount: fullCount,
    };
  }, [items]);

  const totalCartons = Number(sale.total_cartons || calculatedTotalCartons || 0);
  const displayTotalCartons = totalCartons > 0
    ? (totalCartons % 1 === 0 ? totalCartons.toString() : totalCartons.toFixed(1))
    : (calculatedTotalCartons > 0
        ? (calculatedTotalCartons % 1 === 0 ? calculatedTotalCartons.toString() : calculatedTotalCartons.toFixed(1))
        : '0');

  // Digital Receipt State (SMS & WhatsApp)
  const [recipientPhone, setRecipientPhone] = useState<string>(customerPhone);
  const [customNote, setCustomNote] = useState<string>('');
  const [showPreviewDrawer, setShowPreviewDrawer] = useState<boolean>(false);
  const [previewType, setPreviewType] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [copiedType, setCopiedType] = useState<'whatsapp' | 'sms' | null>(null);

  const currencySymbol = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    (isWholesaleTransaction ? 'Footwear Wholesale Traders' : 'Retail Store');
  const storeAddress = companySettings?.address || '';
  const storePhone = companySettings?.phone || '';
  const storeEmail = companySettings?.email || '';
  const taxNumber = companySettings?.tax_number || companySettings?.taxNumber || '';
  const invoiceFooter =
    companySettings?.invoice_footer ||
    companySettings?.invoiceFooter ||
    'Thank you for your business!';
  const showReceiptLogo = Boolean(
    companySettings?.show_receipt_logo ?? companySettings?.showReceiptLogo ?? false
  );
  const receiptLogo =
    companySettings?.receipt_logo ||
    companySettings?.receiptLogo ||
    companySettings?.logo ||
    '';

  const subtotal = parseFloat(sale.subtotal || 0);
  const discount = parseFloat(sale.discount || 0);
  const itemsSubtotal = items.reduce(
    (acc: number, it: any) =>
      acc + (parseFloat(it.subtotal || it.quantity * it.unit_price) || 0),
    0
  );
  const effectiveSubtotal =
    subtotal > 0
      ? subtotal
      : itemsSubtotal > 0
      ? itemsSubtotal
      : parseFloat(sale.total_amount || 0);
  const currentItemsTotal = Math.max(0, effectiveSubtotal - discount);

  const previousBalance = parseFloat(sale.previous_balance || 0);
  const grandTotalDue = parseFloat(
    sale.total_amount || currentItemsTotal + previousBalance
  );
  const paidAmount = parseFloat(
    sale.paid_amount ?? sale.cash_received ?? grandTotalDue
  );
  const remainingBalance = parseFloat(
    sale.remaining_balance ?? Math.max(0, grandTotalDue - paidAmount)
  );
  const changeGiven = parseFloat(
    sale.change_given || (paidAmount > grandTotalDue ? paidAmount - grandTotalDue : 0)
  );

  // Generate WhatsApp & SMS text dynamically with optional custom note
  const whatsAppText = useMemo(() => {
    let text = buildWhatsAppInvoiceText(sale, companySettings);
    if (customNote.trim()) {
      text += `\n📝 *Note:* ${customNote.trim()}\n`;
    }
    return text;
  }, [sale, companySettings, customNote]);

  const smsText = useMemo(() => {
    let text = buildSmsInvoiceText(sale, companySettings);
    if (customNote.trim()) {
      text += `\nNote: ${customNote.trim()}`;
    }
    return text;
  }, [sale, companySettings, customNote]);

  const whatsAppUrl = useMemo(() => {
    return buildWhatsAppLink(recipientPhone, whatsAppText);
  }, [recipientPhone, whatsAppText]);

  const smsUrl = useMemo(() => {
    return buildSmsLink(recipientPhone, smsText);
  }, [recipientPhone, smsText]);

  const handlePrintStandard = () => {
    window.print();
  };

  const handleCopyReceipt = (type: 'whatsapp' | 'sms') => {
    const textToCopy = type === 'whatsapp' ? whatsAppText : smsText;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          setCopiedType(type);
          setDirectFeedback(
            `${type === 'whatsapp' ? 'WhatsApp' : 'SMS'} receipt text copied to clipboard!`
          );
          setTimeout(() => setCopiedType(null), 2500);
        })
        .catch(() => {
          setDirectFeedback('Could not copy text to clipboard.');
        });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedType(type);
      setDirectFeedback('Receipt text copied to clipboard!');
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  const handlePrintDirect = async () => {
    setIsPrintingDirect(true);
    setDirectFeedback(null);
    try {
      const res = await executePrintReceipt(sale, companySettings, {
        receiptPaperWidth: useThermalLayout ? 50 : 80,
      });
      if (res.modeUsed === 'webusb') {
        setDirectFeedback('Receipt sent directly to USB printer without dialog!');
      } else if (res.modeUsed === 'local_agent') {
        setDirectFeedback('Receipt sent to Local Print Agent!');
      } else {
        setDirectFeedback('Printed via system printer.');
      }
    } catch (err: any) {
      setDirectFeedback(
        err.message || 'Direct print error, fallback to system dialog.'
      );
      window.print();
    } finally {
      setIsPrintingDirect(false);
    }
  };

  const triggerPrintReceipt = () => {
    if (
      printerSettings.receiptMode === 'webusb' &&
      printerSettings.receiptDeviceName
    ) {
      handlePrintDirect();
    } else {
      handlePrintStandard();
    }
  };

  // Listen for F9 (Print Receipt) and F8/Escape (Dismiss)
  useEffect(() => {
    const handleInvoicePrintEvent = () => {
      triggerPrintReceipt();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        triggerPrintReceipt();
      } else if (e.key === 'F8' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('invoice:print', handleInvoicePrintEvent);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('invoice:print', handleInvoicePrintEvent);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [printerSettings, sale, companySettings, recipientPhone, whatsAppUrl, smsUrl, selectedFormat]);

  return (
    <div className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible print:block">
      {/* Screen Container */}
      <div className="relative w-full max-w-4xl app-modal-container overflow-hidden flex flex-col max-h-[94vh] no-print shadow-2xl rounded-2xl border border-slate-200 dark:border-purple-800/80">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 rounded-xl shadow-2xs">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Invoice {sale.invoice_number}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                    isWholesaleTransaction
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  {isWholesaleTransaction ? '🏢 Wholesaler' : '🛍️ Retailer'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transaction recorded · Layout defaulted by customer classification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Layout Format Selector & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 bg-slate-50/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
          {/* Format Switcher: Retail defaults to 50mm Thermal, Wholesale defaults to A4 */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800/90 rounded-xl border border-slate-300/60 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSelectedFormat('thermal_50mm')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedFormat === 'thermal_50mm'
                  ? 'bg-white dark:bg-purple-900 text-purple-700 dark:text-purple-200 shadow-xs ring-1 ring-purple-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>50mm Thermal Receipt</span>
              {!isWholesaleTransaction && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold uppercase">
                  Default (Retail)
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFormat('a4')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedFormat === 'a4'
                  ? 'bg-white dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>A4 Commercial Invoice</span>
              {isWholesaleTransaction && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold uppercase">
                  Default (Wholesale)
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Direct USB Silent Print if hardware paired */}
            {printerSettings.receiptMode === 'webusb' &&
            printerSettings.receiptDeviceName ? (
              <button
                onClick={handlePrintDirect}
                disabled={isPrintingDirect}
                className="flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 font-bold text-xs rounded-lg shadow-md shadow-purple-600/25 transition cursor-pointer active:scale-95"
                title={`Direct silent print to ${printerSettings.receiptDeviceName} (F9)`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>{isPrintingDirect ? 'Printing...' : '⚡ Silent'}</span>
                <kbd className="text-[10px] bg-blue-800 px-1 rounded font-mono text-blue-200">
                  F9
                </kbd>
              </button>
            ) : null}

            {/* Standard Browser Print */}
            <button
              onClick={handlePrintStandard}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-xs rounded-lg shadow-xs transition cursor-pointer"
              title="Open browser print dialog (F9)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print {selectedFormat === 'a4' ? 'A4 Invoice' : '50mm Receipt'}</span>
              <kbd className="text-[10px] bg-slate-700 px-1.5 py-0.2 rounded font-mono text-slate-300">
                F9
              </kbd>
            </button>

            <button
              onClick={onClose}
              className="px-2.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CUSTOMER DIGITAL RECEIPTS (SMS & WhatsApp Direct Links) */}
        {shouldShowDigitalReceipt && (
          <div className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-sky-50/90 dark:from-emerald-950/40 dark:via-[#0E2030] dark:to-sky-950/40 border-b border-emerald-200/80 dark:border-emerald-800/40">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Digital Customer Receipt
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      {customerPhone}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Send paperless invoice summary directly to customer
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPreviewDrawer(!showPreviewDrawer)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                >
                  <span>Preview Text</span>
                  {showPreviewDrawer ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-md shadow-xs transition flex items-center space-x-1 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href={smsUrl}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-md shadow-xs transition flex items-center space-x-1 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>SMS</span>
                </a>
              </div>
            </div>

            {showPreviewDrawer && (
              <div className="mt-2.5 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex space-x-1">
                    <button
                      type="button"
                      onClick={() => setPreviewType('whatsapp')}
                      className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                        previewType === 'whatsapp'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      WhatsApp Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewType('sms')}
                      className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                        previewType === 'sms'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      SMS Preview
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyReceipt(previewType)}
                    className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-semibold cursor-pointer text-xs"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy message</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-slate-900 text-emerald-300 font-mono text-[11px] leading-relaxed rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap border border-slate-700 select-all">
                  {previewType === 'whatsapp' ? whatsAppText : smsText}
                </pre>
              </div>
            )}
          </div>
        )}

        {directFeedback && (
          <div className="px-6 py-2 bg-slate-900 text-emerald-300 text-xs flex items-center justify-between">
            <span className="font-medium">{directFeedback}</span>
            <button
              onClick={() => setDirectFeedback(null)}
              className="text-slate-400 hover:text-white ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* INTERACTIVE PREVIEW CONTAINER                                       */}
        {/* =================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-[#080D1A] flex justify-center items-start">
          {useThermalLayout ? (
            /* =============================================================== */
            /* 50MM THERMAL RECEIPT PREVIEW (DEFAULT FOR RETAIL TRANSACTIONS)  */
            /* =============================================================== */
            <div className="invoice-preview-receipt w-[210px] sm:w-[220px] max-w-[220px] h-fit shrink-0 bg-white p-3 shadow-xl border border-gray-300 font-mono text-[10px] text-gray-900 leading-snug select-all rounded-xs">
              {/* Header */}
              <div className="text-center pb-2 border-b border-dashed border-gray-500">
                {showReceiptLogo && receiptLogo && (
                  <div className="flex justify-center mb-1.5">
                    <img
                      src={receiptLogo}
                      alt={storeName}
                      className="max-h-8 max-w-[80px] object-contain mx-auto"
                    />
                  </div>
                )}
                <h3 className="font-black text-xs uppercase tracking-tight text-black">
                  {storeName}
                </h3>
                {storeAddress && (
                  <p className="text-[8.5px] text-gray-600 mt-0.5 leading-tight">
                    {storeAddress}
                  </p>
                )}
                {storePhone && (
                  <p className="text-[8.5px] text-gray-600">Tel: {storePhone}</p>
                )}
                {taxNumber && (
                  <p className="text-[8.5px] text-gray-600">Tax Reg: {taxNumber}</p>
                )}
              </div>

              {/* Meta details */}
              <div className="py-1.5 border-b border-dashed border-gray-500 text-[9px] space-y-0.5 text-gray-700">
                <div className="flex justify-between font-bold text-black">
                  <span>Inv:</span>
                  <span>{sale.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{sale.sale_date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{sale.cashier_name || 'Counter'}</span>
                </div>
                {sale.customer_name && (
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span className="font-semibold text-black truncate max-w-[120px]">
                      {sale.customer_name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span className="font-bold text-emerald-800">
                    {isExplicitWholesaler ? 'Wholesaler' : 'Retailer'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payment:</span>
                  <span className="font-semibold">{sale.payment_method}</span>
                </div>
              </div>

              {/* Items List (Narrow 50mm columns) */}
              <div className="py-1.5 border-b border-dashed border-gray-500">
                <div className="flex justify-between font-bold pb-0.5 text-[9px] border-b border-gray-300">
                  <span className="w-7/12">Item</span>
                  <span className="w-2/12 text-center">Qty</span>
                  <span className="w-3/12 text-right">Total</span>
                </div>
                {items.map((item: any, idx: number) => (
                  <div key={idx} className="py-1 text-[9px] border-b border-gray-100 last:border-b-0">
                    <p className="font-bold text-black truncate">
                      {item.article || item.product_name || item.name}
                    </p>
                    <div className="flex justify-between text-[8.5px] text-gray-500 pt-0.5">
                      <span>
                        {item.quantity} × {currencySymbol} {formatStockPrice(item.unit_price)}
                      </span>
                      <span className="font-bold text-black">
                        {currencySymbol} {formatStockPrice(item.subtotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-1.5 space-y-0.5 text-[9.5px] border-b border-dashed border-gray-500">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">{currencySymbol} {formatStockPrice(currentItemsTotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span className="font-mono">-{currencySymbol} {formatStockPrice(discount)}</span>
                  </div>
                )}
                {isWholesaleTransaction && previousBalance !== 0 && (
                  <div className="flex justify-between font-medium text-slate-700 text-[9px]">
                    <span>Prev Khata:</span>
                    <span className="font-mono">{currencySymbol} {formatStockPrice(previousBalance)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-[11px] text-black pt-1 border-t border-gray-300">
                  <span>TOTAL DUE:</span>
                  <span className="font-mono">{currencySymbol} {formatStockPrice(isWholesaleTransaction ? grandTotalDue : currentItemsTotal)}</span>
                </div>
                <div className="flex justify-between pt-0.5 text-[9px]">
                  <span>Paid:</span>
                  <span className="font-mono font-bold">{currencySymbol} {formatStockPrice(paidAmount)}</span>
                </div>
                {changeGiven > 0 ? (
                  <div className="flex justify-between font-bold text-emerald-700 text-[9px]">
                    <span>Change:</span>
                    <span className="font-mono">{currencySymbol} {formatStockPrice(changeGiven)}</span>
                  </div>
                ) : remainingBalance > 0 ? (
                  <div className="flex justify-between font-bold text-rose-700 text-[9px]">
                    <span>Balance:</span>
                    <span className="font-mono">{currencySymbol} {formatStockPrice(remainingBalance)}</span>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="pt-2 text-center space-y-1">
                <p className="text-[8px] text-gray-600 italic px-1">{invoiceFooter}</p>
                <p className="text-[7.5px] text-gray-500">*** 7-DAY SHOE EXCHANGE WITH RECEIPT ***</p>
                <p className="text-[7px] text-gray-400 pt-1 border-t border-gray-100">
                  Powered by SarbaazSoft POS
                </p>
              </div>
            </div>
          ) : (
            /* =============================================================== */
            /* A4 INVOICE PREVIEW (DEFAULT FOR WHOLESALE TRANSACTIONS)         */
            /* =============================================================== */
            <div className="invoice-preview-receipt w-full max-w-[720px] h-fit shrink-0 bg-white p-7 shadow-xl border border-gray-300 text-gray-800 text-xs rounded-sm">
              {/* Header */}
              <div className="flex justify-between items-start pb-5 border-b-2 border-gray-800">
                <div className="flex items-start gap-3.5">
                  {showReceiptLogo && receiptLogo && (
                    <img
                      src={receiptLogo}
                      alt={storeName}
                      className="max-h-14 max-w-[100px] object-contain shrink-0"
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-black text-gray-950 tracking-tight uppercase">
                      {storeName}
                    </h1>
                    {storeAddress && <p className="text-gray-600 mt-0.5 text-xs">{storeAddress}</p>}
                    <p className="text-gray-600 text-xs">
                      Phone: {storePhone || 'N/A'} {storeEmail ? `| Email: ${storeEmail}` : ''}
                    </p>
                    {taxNumber && (
                      <p className="text-gray-800 font-bold text-xs mt-0.5">
                        STRN / NTN Tax ID: {taxNumber}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block px-3 py-1 font-black text-xs tracking-wider uppercase rounded border border-indigo-700 bg-indigo-50 text-indigo-900 shadow-2xs">
                    WHOLESALE COMMERCIAL TAX INVOICE &amp; DISPATCH
                  </div>
                  <p className="text-gray-950 font-mono font-black mt-2 text-sm">
                    {sale.invoice_number}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">Date: {sale.sale_date}</p>
                  <p className="text-[11px] font-bold text-indigo-700 mt-1">
                    Customer: Wholesale Dealer
                  </p>
                </div>
              </div>

              {/* Dealer Billed To & Payment Details */}
              <div className="grid grid-cols-2 gap-4 py-4 border-b border-gray-200 text-xs">
                <div>
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-1">
                    DEALER / BILLED TO:
                  </span>
                  {dealerShopName ? (
                    <p className="font-black text-gray-950 text-sm">{dealerShopName}</p>
                  ) : null}
                  <p className="font-bold text-gray-900 mt-0.5">
                    {sale.customer_name || 'Wholesale Client / Walk-in Dealer'}
                  </p>
                  {sale.customer_phone && (
                    <p className="text-gray-600">Contact: {sale.customer_phone}</p>
                  )}
                  {(dealerMarket || dealerCity || sale.customer_address) && (
                    <p className="text-gray-600">
                      Market / City: {[dealerMarket, dealerCity || sale.customer_address].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {dealerNtn && (
                    <p className="text-gray-700 font-mono font-medium">NTN: {dealerNtn}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-1">
                    PAYMENT &amp; OPERATOR:
                  </span>
                  <p className="text-gray-800">
                    <span className="font-medium">Payment Mode:</span>{' '}
                    <strong className="text-gray-950 font-bold">
                      {sale.payment_method === 'KHATA' ? 'Khata (Credit Ledger)' : sale.payment_method}
                    </strong>
                  </p>
                  <p className="text-gray-800 mt-0.5">
                    <span className="font-medium">Cashier / Dispatch:</span>{' '}
                    {sale.cashier_name || 'Counter Operator'}
                  </p>
                </div>
              </div>

              {/* Wholesale Cargo / Transport Dispatch Card */}
              {(transportName || biltyNumber || bookingDestination || totalCartons > 0) && (
                <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <Truck className="w-3 h-3 text-indigo-600" />
                      Transport / Cargo
                    </span>
                    <strong className="text-gray-900 block mt-0.5">{transportName || 'Direct Delivery'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block">Bilty / LR #</span>
                    <strong className="text-gray-900 font-mono block mt-0.5">{biltyNumber || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block">Destination City</span>
                    <strong className="text-gray-900 block mt-0.5">{bookingDestination || dealerCity || 'Local'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <Package className="w-3 h-3 text-indigo-600" />
                      Total Master Cartons
                    </span>
                    <strong className="text-indigo-700 font-mono font-black text-sm block mt-0.5">
                      {displayTotalCartons} Ctns ({totalPairsDispatched} prs)
                    </strong>
                  </div>
                </div>
              )}

              {/* Wholesale Items Table (Handles carton counts, pairs, and half-carton quantities cleanly) */}
              <table className="w-full mt-3 border-collapse text-xs">
                <thead>
                  <tr className="border-y-2 border-gray-800 bg-gray-50 text-gray-800">
                    <th className="py-2 px-2 text-left font-bold w-8">#</th>
                    <th className="py-2 px-3 text-left font-bold">Article / Item</th>
                    <th className="py-2 px-3 text-center font-bold">Cartons</th>
                    <th className="py-2 px-3 text-center font-bold">Packing</th>
                    <th className="py-2 px-3 text-center font-bold">Total Pairs</th>
                    <th className="py-2 px-3 text-right font-bold">Wholesale Rate</th>
                    <th className="py-2 px-3 text-right font-bold">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item: any, idx: number) => {
                    const ppc = Number(item.pairs_per_carton || item.pairsPerCarton || 12);
                    const rawCtn = item.carton_quantity !== undefined && item.carton_quantity !== null
                      ? parseFloat(String(item.carton_quantity))
                      : (item.cartonQuantity !== undefined && item.cartonQuantity !== null
                          ? parseFloat(String(item.cartonQuantity))
                          : (Number(item.quantity) / ppc));
                    const parsedCtn = !isNaN(rawCtn) && rawCtn > 0 ? rawCtn : (Number(item.quantity) / ppc);
                    const isHalfCarton = parsedCtn === 0.5;
                    const hasFraction = parsedCtn % 1 !== 0;

                    return (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-2 text-gray-500 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-950 text-xs">
                            {item.article || item.product_name || item.name}
                          </div>
                          {item.brand_name && (
                            <div className="text-[10px] text-gray-500 font-medium">
                              Brand: {item.brand_name}
                            </div>
                          )}
                        </td>
                        {/* Cartons Column with Clean Half-Carton Handling */}
                        <td className="py-2.5 px-3 text-center">
                          {isHalfCarton ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-mono">
                              <span>0.5 Ctn</span>
                              <span className="text-[10px] font-extrabold uppercase tracking-tight text-emerald-700">
                                (Half)
                              </span>
                            </span>
                          ) : hasFraction ? (
                            <span className="font-bold text-gray-950 font-mono">
                              {parsedCtn.toFixed(1)} Ctns{' '}
                              <span className="text-[10px] text-indigo-700 font-normal">
                                ({Math.floor(parsedCtn)} + ½)
                              </span>
                            </span>
                          ) : (
                            <span className="font-bold text-gray-950 font-mono">
                              {parsedCtn} {parsedCtn === 1 ? 'Ctn' : 'Ctns'}
                            </span>
                          )}
                        </td>
                        {/* Packing Specification */}
                        <td className="py-2.5 px-3 text-center text-gray-600 font-mono text-[11px]">
                          {ppc} pr/ctn
                        </td>
                        {/* Total Pairs */}
                        <td className="py-2.5 px-3 text-center font-bold text-gray-900 font-mono">
                          {item.quantity} pr
                        </td>
                        {/* Wholesale Rate (Pairs & Carton equivalents) */}
                        <td className="py-2.5 px-3 text-right text-gray-800 font-mono">
                          <div>
                            {currencySymbol} {formatStockPrice(item.unit_price)} <span className="text-[10px] text-gray-500">/pr</span>
                          </div>
                          <div className="text-[9.5px] text-gray-500">
                            ({currencySymbol} {formatStockPrice(item.unit_price * ppc)}/ctn)
                          </div>
                        </td>
                        {/* Total Amount */}
                        <td className="py-2.5 px-3 text-right font-bold text-gray-950 font-mono">
                          {currencySymbol} {formatStockPrice(item.subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Wholesale Dispatched Quantities Summary Card */}
              <div className="mt-3 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-700" />
                  <span className="font-bold text-indigo-950">Wholesale Dispatch Summary:</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono font-bold">
                  <span className="text-indigo-900">
                    Total Master Cartons:{' '}
                    <strong className="text-black underline">{displayTotalCartons} Ctns</strong>
                    {halfCartonItemsCount > 0 && (
                      <span className="text-[11px] text-emerald-700 ml-1 font-semibold">
                        (includes {halfCartonItemsCount} half-carton{halfCartonItemsCount > 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                  <span className="text-indigo-900">
                    Total Footwear Pairs:{' '}
                    <strong className="text-black underline">{totalPairsDispatched} Pairs</strong>
                  </span>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="flex justify-end mt-4 pt-3 border-t border-gray-300">
                <div className="w-80 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Current Items Subtotal:</span>
                    <span>{currencySymbol} {formatStockPrice(subtotal > 0 ? subtotal : currentItemsTotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Total Discount:</span>
                      <span>-{currencySymbol} {formatStockPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                    <span>Current Invoice Total:</span>
                    <span className="font-mono">{currencySymbol} {formatStockPrice(currentItemsTotal)}</span>
                  </div>

                  {previousBalance !== 0 && (
                    <div className="flex justify-between text-gray-700 font-medium">
                      <span>Previous Khata Ledger Balance:</span>
                      <span className="font-mono">{currencySymbol} {formatStockPrice(previousBalance)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-sm text-gray-950 border-t-2 border-gray-800 pt-1.5">
                    <span>GRAND TOTAL DUE:</span>
                    <span className="font-mono">{currencySymbol} {formatStockPrice(grandTotalDue)}</span>
                  </div>

                  <div className="flex justify-between text-gray-800 pt-1">
                    <span>{sale.payment_method === 'KHATA' ? 'Payment Received Now:' : 'Amount Paid:'}</span>
                    <span className="font-mono font-bold">{currencySymbol} {formatStockPrice(paidAmount)}</span>
                  </div>

                  {remainingBalance > 0 ? (
                    <div className="flex justify-between text-rose-700 font-bold border-t border-dashed border-gray-300 pt-1">
                      <span>Balance Carried Forward (Khata):</span>
                      <span className="font-mono">{currencySymbol} {formatStockPrice(remainingBalance)}</span>
                    </div>
                  ) : changeGiven > 0 ? (
                    <div className="flex justify-between text-emerald-700 font-bold border-t border-dashed border-gray-300 pt-1">
                      <span>Change Given:</span>
                      <span className="font-mono">{currencySymbol} {formatStockPrice(changeGiven)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-emerald-700 font-semibold border-t border-dashed border-gray-300 pt-1">
                      <span>Account Status:</span>
                      <span>Paid in Full</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dual Signatures & Acceptance Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-2 gap-4 items-end">
                <div>
                  <p className="text-[10px] text-gray-500 max-w-xs">{invoiceFooter}</p>
                  <p className="text-[9px] text-gray-400 mt-2">Powered by SarbaazSoft Shoe POS</p>
                </div>
                <div className="flex justify-end gap-8">
                  <div className="text-center">
                    <div className="w-32 border-b border-gray-500 pb-1 mb-1"></div>
                    <p className="text-[9px] text-gray-600 uppercase font-bold tracking-wider">
                      Dealer Stamp &amp; Sign
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-32 border-b border-gray-800 pb-1 mb-1"></div>
                    <p className="text-[9px] text-gray-950 uppercase font-bold tracking-wider">
                      Authorized Signature
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* PRINT-ONLY CONTAINER (Output strictly to physical printer / PDF)     */}
      {/* =================================================================== */}
      <div className="print-only">
        {useThermalLayout ? (
          /* 50MM THERMAL RECEIPT FOR PHYSICAL PRINTER */
          <div
            className="print-thermal-receipt print-thermal-50mm"
            style={{ backgroundColor: '#ffffff', color: '#000000', width: '48mm', maxWidth: '50mm' }}
          >
            <div style={{ textAlign: 'center', paddingBottom: '6px', borderBottom: '1px dashed #444' }}>
              {showReceiptLogo && receiptLogo && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                  <img
                    src={receiptLogo}
                    alt={storeName}
                    style={{ maxHeight: '36px', maxWidth: '80px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.02em', color: '#000000' }}>
                {storeName}
              </div>
              {storeAddress && <div style={{ fontSize: '9px', color: '#333333', marginTop: '2px' }}>{storeAddress}</div>}
              {storePhone && <div style={{ fontSize: '9px', color: '#333333' }}>Tel: {storePhone}</div>}
              {taxNumber && <div style={{ fontSize: '9px', color: '#333333' }}>Tax Reg: {taxNumber}</div>}
            </div>

            <div style={{ padding: '4px 0', borderBottom: '1px dashed #444', fontSize: '9.5px', color: '#000000' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' }}>
                <span>Invoice:</span>
                <strong>{sale.invoice_number}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' }}>
                <span>Date:</span>
                <span>{sale.sale_date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' }}>
                <span>Cashier:</span>
                <span>{sale.cashier_name || 'Counter'}</span>
              </div>
              {sale.customer_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5px' }}>
                  <span>Customer:</span>
                  <strong>{sale.customer_name}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment:</span>
                <strong>{sale.payment_method}</strong>
              </div>
            </div>

            <div style={{ padding: '4px 0', borderBottom: '1px dashed #444', color: '#000000' }}>
              <table style={{ width: '100%', fontSize: '9.5px', textAlign: 'left', borderCollapse: 'collapse', color: '#000000' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #aaa' }}>
                    <th style={{ width: '55%', paddingBottom: '3px', fontWeight: 'bold' }}>Item</th>
                    <th style={{ width: '15%', paddingBottom: '3px', textAlign: 'center', fontWeight: 'bold' }}>Qty</th>
                    <th style={{ width: '30%', paddingBottom: '3px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ paddingTop: '3px', paddingBottom: '2px' }}>
                        <div style={{ fontWeight: 'bold', color: '#000000' }}>{item.article || item.product_name || item.name}</div>
                        <div style={{ fontSize: '8.5px', color: '#555555' }}>
                          {currencySymbol} {formatStockPrice(item.unit_price)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '3px', color: '#000000' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '3px', fontWeight: 600, color: '#000000' }}>
                        {currencySymbol} {formatStockPrice(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '4px 0', borderBottom: '1px dashed #444', fontSize: '9.5px', color: '#000000' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Subtotal:</span>
                <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(currentItemsTotal)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Discount:</span>
                  <span style={{ fontFamily: 'monospace' }}>-{currencySymbol} {formatStockPrice(discount)}</span>
                </div>
              )}
              {isWholesaleTransaction && previousBalance !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: 600 }}>
                  <span>Prev Khata:</span>
                  <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(previousBalance)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #000', color: '#000000' }}>
                <span>TOTAL DUE:</span>
                <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(isWholesaleTransaction ? grandTotalDue : currentItemsTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                <span>Paid:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{currencySymbol} {formatStockPrice(paidAmount)}</span>
              </div>
              {changeGiven > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
                  <span>Change:</span>
                  <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(changeGiven)}</span>
                </div>
              ) : remainingBalance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px', color: '#000' }}>
                  <span>Balance:</span>
                  <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(remainingBalance)}</span>
                </div>
              ) : null}
            </div>

            <div style={{ textAlign: 'center', paddingTop: '6px', color: '#000000' }}>
              <div style={{ fontSize: '8.5px', fontStyle: 'italic', color: '#333333' }}>{invoiceFooter}</div>
              <div style={{ fontSize: '8px', color: '#555555', marginTop: '3px' }}>*** 7-DAY SHOE EXCHANGE WITH RECEIPT ***</div>
              <div style={{ fontSize: '7px', color: '#777777', marginTop: '3px', borderTop: '1px dashed #ccc', paddingTop: '2px' }}>Powered by SarbaazSoft Shoe POS</div>
            </div>
          </div>
        ) : (
          /* A4 INVOICE FOR PHYSICAL PRINTER */
          <div className="print-a4-invoice" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {showReceiptLogo && receiptLogo && (
                  <img
                    src={receiptLogo}
                    alt={storeName}
                    style={{ maxHeight: '52px', maxWidth: '100px', objectFit: 'contain' }}
                  />
                )}
                <div>
                  <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#000000', textTransform: 'uppercase' }}>{storeName}</h1>
                  <p style={{ margin: '3px 0', color: '#333333' }}>{storeAddress}</p>
                  <p style={{ margin: '3px 0', color: '#333333' }}>Phone: {storePhone} | Email: {storeEmail}</p>
                  {taxNumber && <p style={{ margin: '3px 0', fontWeight: 'bold', color: '#000000' }}>STRN / NTN Tax ID: {taxNumber}</p>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0, color: '#000000', textTransform: 'uppercase' }}>
                  WHOLESALE COMMERCIAL TAX INVOICE &amp; DISPATCH
                </h2>
                <p style={{ margin: '4px 0', fontWeight: 'bold', color: '#000000', fontSize: '13px' }}>{sale.invoice_number}</p>
                <p style={{ margin: '2px 0', color: '#444444' }}>Date: {sale.sale_date}</p>
                <p style={{ margin: '2px 0', fontWeight: 'bold', color: '#333333' }}>Customer: Wholesale Dealer</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #ddd', color: '#000000' }}>
              <div>
                <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: '#555' }}>
                  Dealer / Billed To:
                </strong>
                {dealerShopName ? (
                  <div style={{ fontWeight: 'bold', fontSize: '13px', marginTop: '2px' }}>{dealerShopName}</div>
                ) : null}
                <div>{sale.customer_name || 'Walk-in Customer'}</div>
                {sale.customer_phone && <div>Contact: {sale.customer_phone}</div>}
                {(dealerMarket || dealerCity || sale.customer_address) && (
                  <div>{[dealerMarket, dealerCity || sale.customer_address].filter(Boolean).join(', ')}</div>
                )}
                {dealerNtn && <div>NTN: {dealerNtn}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div><strong>Payment:</strong> {sale.payment_method === 'KHATA' ? 'Khata (Credit Ledger)' : sale.payment_method}</div>
                <div><strong>Cashier / Dispatch:</strong> {sale.cashier_name || 'Counter Operator'}</div>
              </div>
            </div>

            {/* Wholesale Cargo / Transport Dispatch Details */}
            {(transportName || biltyNumber || bookingDestination || totalCartons > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '8px', backgroundColor: '#f8f8f8', border: '1px solid #ddd', marginTop: '8px', marginBottom: '8px', fontSize: '11px' }}>
                <div>
                  <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', display: 'block' }}>Transport</span>
                  <strong>{transportName || 'Direct Delivery'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', display: 'block' }}>Bilty / LR #</span>
                  <strong style={{ fontFamily: 'monospace' }}>{biltyNumber || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', display: 'block' }}>Destination City</span>
                  <strong>{bookingDestination || dealerCity || 'Local'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', display: 'block' }}>Total Cartons</span>
                  <strong>{displayTotalCartons} Ctns ({totalPairsDispatched} prs)</strong>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', color: '#000000', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000', backgroundColor: '#f0f0f0' }}>
                  <th style={{ padding: '6px', textAlign: 'left', width: '28px' }}>#</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Article / Item</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>Cartons</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>Packing</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>Total Pairs</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Wholesale Rate</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const ppc = Number(item.pairs_per_carton || item.pairsPerCarton || 12);
                  const rawCtn = item.carton_quantity !== undefined && item.carton_quantity !== null
                    ? parseFloat(String(item.carton_quantity))
                    : (item.cartonQuantity !== undefined && item.cartonQuantity !== null
                        ? parseFloat(String(item.cartonQuantity))
                        : (Number(item.quantity) / ppc));
                  const parsedCtn = !isNaN(rawCtn) && rawCtn > 0 ? rawCtn : (Number(item.quantity) / ppc);
                  const isHalf = parsedCtn === 0.5;
                  const hasFraction = parsedCtn % 1 !== 0;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '6px' }}>{idx + 1}</td>
                      <td style={{ padding: '6px' }}>
                        <strong>{item.article || item.product_name || item.name}</strong>
                        {item.brand_name && <div style={{ fontSize: '9px', color: '#555' }}>Brand: {item.brand_name}</div>}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>
                        {isHalf ? '0.5 Ctn (Half)' : hasFraction ? `${parsedCtn.toFixed(1)} Ctns` : `${parsedCtn} Ctns`}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center', fontSize: '10px' }}>{ppc} pr/ctn</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity} pr</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>
                        {currencySymbol} {formatStockPrice(item.unit_price)}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                        {currencySymbol} {formatStockPrice(item.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Total Cartons and Pairs Note in Print */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', marginTop: '8px', fontSize: '11px', fontWeight: 'bold' }}>
              <span>Total Dispatched Cartons: {displayTotalCartons} Ctns {halfCartonItemsCount > 0 ? `(with ${halfCartonItemsCount} half-carton)` : ''}</span>
              <span>Total Dispatched Pairs: {totalPairsDispatched} Pairs</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', color: '#000000' }}>
              <div style={{ width: '290px', lineHeight: '1.6', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Current Items Subtotal:</span>
                  <span>{currencySymbol} {formatStockPrice(subtotal > 0 ? subtotal : currentItemsTotal)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Discount:</span>
                    <span>-{currencySymbol} {formatStockPrice(discount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', paddingTop: '3px', fontWeight: 'bold' }}>
                  <span>Current Items Total:</span>
                  <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(currentItemsTotal)}</span>
                </div>

                {previousBalance !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Previous Khata Balance:</span>
                    <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(previousBalance)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: '2px solid #000', paddingTop: '4px' }}>
                  <span>GRAND TOTAL DUE:</span>
                  <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(grandTotalDue)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
                  <span>{sale.payment_method === 'KHATA' ? 'Payment Received Now:' : 'Amount Paid:'}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{currencySymbol} {formatStockPrice(paidAmount)}</span>
                </div>

                {remainingBalance > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px dashed #666', paddingTop: '3px', color: '#b91c1c' }}>
                    <span>Balance Remaining (Khata):</span>
                    <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(remainingBalance)}</span>
                  </div>
                ) : changeGiven > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px dashed #666', paddingTop: '3px' }}>
                    <span>Change Given:</span>
                    <span style={{ fontFamily: 'monospace' }}>{currencySymbol} {formatStockPrice(changeGiven)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px dashed #666', paddingTop: '3px' }}>
                    <span>Account Status:</span>
                    <span>Paid in Full</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#000000' }}>
              <div>
                <div style={{ fontSize: '10px' }}>{invoiceFooter}</div>
                <div style={{ fontSize: '8.5px', color: '#666666', marginTop: '4px' }}>Powered by SarbaazSoft Shoe POS</div>
              </div>
              <div style={{ display: 'flex', gap: '40px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '130px', borderBottom: '1px solid #777', marginBottom: '4px' }}></div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#555' }}>Dealer Stamp &amp; Sign</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '130px', borderBottom: '1px solid #000', marginBottom: '4px' }}></div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 'bold' }}>Authorized Signature</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
