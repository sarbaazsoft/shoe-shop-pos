import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { formatStockPrice, getProductRetailPrice } from './priceFormat.ts';

// Off-screen barcode image generator using JsBarcode on HTML5 canvas
function generateBarcodeDataUrl(value: string): string | null {
  try {
    const clean = String(value).trim();
    const isEan13 = /^\d{13}$/.test(clean);
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, clean, {
      format: isEan13 ? 'EAN13' : 'CODE128',
      width: 2,
      height: 45,
      displayValue: true,
      fontSize: 12,
      margin: 5,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, String(value).trim(), {
        format: 'CODE128',
        width: 2,
        height: 45,
        displayValue: true,
        fontSize: 12,
        margin: 5,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch {
      console.warn('Failed to generate barcode data URL:', e);
      return null;
    }
  }
}

export interface StickerCustomOptions {
  showStore?: boolean;
  showBrand?: boolean;
  showCategory?: boolean;
  showArticle?: boolean;
  showPrice?: boolean;
  showBarcodeText?: boolean;
  labelSize?: '50x30' | '40x25' | '60x40';
}

// 2. Export Stickers as PDF (Pure vector, thermal rolls: 50x30mm, 40x25mm, or 60x40mm)
export function exportStickersToPdf(
  product: any,
  copies: number,
  companySettings: any,
  options: StickerCustomOptions = {}
): boolean {
  try {
    const store = (
      companySettings?.name ||
      companySettings?.company_name ||
      companySettings?.companyName ||
      'Retail Store'
    ).toUpperCase();
    const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
    const brand = (product.brandName || product.brand_name || '').toUpperCase();
    const category = (product.categoryName || product.category_name || '').toUpperCase();
    const name = String(product.article || product.name || '').substring(0, 26);
    const barcode = String(product.barcode || '');
    const price = formatStockPrice(getProductRetailPrice(product, companySettings));

    const showStore = options.showStore !== false;
    const showBrand = options.showBrand !== false;
    const showCategory = options.showCategory !== false;
    const showArticle = options.showArticle !== false;
    const showPrice = options.showPrice !== false;
    const labelSize = options.labelSize || '50x30';

    let width = 50;
    let height = 30;
    if (labelSize === '40x25') {
      width = 40;
      height = 25;
    } else if (labelSize === '60x40') {
      width = 60;
      height = 40;
    }

    const pdf = new jsPDF({
      orientation: 'l',
      unit: 'mm',
      format: [height, width],
    });

    const barcodeData = generateBarcodeDataUrl(barcode);
    const centerX = width / 2;

    for (let i = 0; i < copies; i++) {
      if (i > 0) pdf.addPage([height, width], 'l');

      let currentY = labelSize === '40x25' ? 3.5 : 4;

      // Top line: Store, Brand, Category
      const topHeaderParts = [];
      if (showStore) topHeaderParts.push(store);
      if (showBrand && brand) topHeaderParts.push(brand);
      if (showCategory && category && topHeaderParts.length < 2) topHeaderParts.push(category);

      if (topHeaderParts.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(labelSize === '40x25' ? 5.5 : 6.5);
        pdf.text(topHeaderParts.join(' • '), centerX, currentY, { align: 'center' });
        currentY += labelSize === '40x25' ? 3.2 : 4;
      }

      // Article / Product Name
      if (showArticle) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(labelSize === '40x25' ? 6.5 : 7.5);
        pdf.text(name, centerX, currentY, { align: 'center' });
        currentY += labelSize === '40x25' ? 3 : 3.5;
      }

      // Barcode
      if (barcodeData) {
        const barcodeW = labelSize === '40x25' ? 32 : labelSize === '60x40' ? 48 : 38;
        const barcodeH = labelSize === '40x25' ? 8 : labelSize === '60x40' ? 14 : 10.5;
        const barcodeX = (width - barcodeW) / 2;
        pdf.addImage(barcodeData, 'PNG', barcodeX, currentY, barcodeW, barcodeH);
        currentY += barcodeH + (labelSize === '40x25' ? 2.5 : 3.5);
      }

      // Price
      if (showPrice) {
        const isFixed = String(
          companySettings?.pricingMode ||
          'FIXED'
        ).toUpperCase() === 'FIXED';
        const pricePrefix = isFixed ? 'Fixed Price :' : 'Price :';
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(labelSize === '40x25' ? 6.5 : 8);
        pdf.text(`${pricePrefix} ${currency} ${price}`, centerX, currentY, { align: 'center' });
      }
    }

    pdf.save(`Stickers-${barcode || 'barcode'}.pdf`);
    return true;
  } catch (err) {
    console.error('Stickers PDF failed:', err);
    throw err;
  }
}

// 2b. Export Batch Stickers as PDF (Roll 50x30, Roll 60x40, or A4 24-up sheet)
export function exportBatchStickersToPdf(
  items: Array<{ product: any; copies: number }>,
  companySettings: any,
  labelFormat: 'roll_50x30' | 'roll_60x40' | 'a4_sheet' = 'roll_50x30',
  options: {
    showStore?: boolean;
    showBrand?: boolean;
    showArticle?: boolean;
      showPrice?: boolean;
  } = {}
): boolean {
  try {
    const store = (
      companySettings?.name ||
      companySettings?.company_name ||
      companySettings?.companyName ||
      'Retail Store'
    ).toUpperCase();
    const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

    const showStore = options.showStore !== false;
    const showBrand = options.showBrand !== false;
    const showArticle = options.showArticle !== false;
    const showPrice = options.showPrice !== false;

    // Flatten items by copies
    const flattenedList: any[] = [];
    for (const item of items) {
      const copies = Math.max(1, item.copies || 1);
      for (let c = 0; c < copies; c++) {
        flattenedList.push(item.product);
      }
    }

    if (flattenedList.length === 0) return false;

    if (labelFormat === 'a4_sheet') {
      // Standard A4 Sticker Sheet: 3 columns x 8 rows = 24 labels per page
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const cols = 3;
      const rows = 8;
      const labelsPerPage = cols * rows; // 24
      const labelWidth = 63.5;
      const labelHeight = 33.9;
      const marginLeft = 7.5;
      const marginTop = 12.5;
      const gapX = 2.5;
      const gapY = 0;

      let currentPage = 0;

      flattenedList.forEach((prod, idx) => {
        const pageIdx = Math.floor(idx / labelsPerPage);
        if (pageIdx > currentPage) {
          pdf.addPage('a4', 'p');
          currentPage = pageIdx;
        }

        const slotOnPage = idx % labelsPerPage;
        const col = slotOnPage % cols;
        const row = Math.floor(slotOnPage / cols);

        const x = marginLeft + col * (labelWidth + gapX);
        const y = marginTop + row * (labelHeight + gapY);

        const brand = (prod.brandName || prod.brand_name || 'Shoes').toUpperCase();
        const name = String(prod.article || prod.name || '').substring(0, 22);
        const barcode = String(prod.barcode || '');
        const price = formatStockPrice(getProductRetailPrice(prod, companySettings));
        const barcodeData = generateBarcodeDataUrl(barcode);

        const centerX = x + labelWidth / 2;

        let curY = y + 4.5;
        if (showStore || showBrand) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.5);
          const headerTxt = [showStore ? store : '', showBrand ? brand : ''].filter(Boolean).join(' • ');
          pdf.text(headerTxt, centerX, curY, { align: 'center' });
          curY += 3.5;
        }

        if (showArticle) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.5);
          pdf.text(name, centerX, curY, { align: 'center' });
          curY += 3.5;
        }

        if (barcodeData) {
          pdf.addImage(barcodeData, 'PNG', x + 5, curY, labelWidth - 10, 12);
          curY += 13.5;
        }

        if (showPrice) {
          const isFixed = String(
          companySettings?.pricingMode ||
            'FIXED'
          ).toUpperCase() === 'FIXED';
          const pricePrefix = isFixed ? 'Fixed Price :' : 'Price :';
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.text(`${pricePrefix} ${currency} ${price}`, centerX, curY, { align: 'center' });
        }
      });

      pdf.save(`Barcode-Labels-A4-${new Date().toISOString().slice(0, 10)}.pdf`);
      return true;
    } else {
      // Thermal Roll Label: 50x30mm or 60x40mm
      const is60x40 = labelFormat === 'roll_60x40';
      const width = is60x40 ? 60 : 50;
      const height = is60x40 ? 40 : 30;
      const centerX = width / 2;

      const pdf = new jsPDF({
        orientation: 'l',
        unit: 'mm',
        format: [height, width],
      });

      flattenedList.forEach((prod, idx) => {
        if (idx > 0) {
          pdf.addPage([height, width], 'l');
        }

        const brand = (prod.brandName || prod.brand_name || 'Shoes').toUpperCase();
        const name = String(prod.article || prod.name || '').substring(0, 24);
        const barcode = String(prod.barcode || '');
        const price = formatStockPrice(getProductRetailPrice(prod, companySettings));
        const barcodeData = generateBarcodeDataUrl(barcode);

        let curY = 4;
        if (showStore || showBrand) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(is60x40 ? 8 : 7);
          const headerTxt = [showStore ? store : '', showBrand ? brand : ''].filter(Boolean).join(' • ');
          pdf.text(headerTxt, centerX, curY, { align: 'center' });
          curY += 4;
        }

        if (showArticle) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(is60x40 ? 9 : 8);
          pdf.text(name, centerX, curY, { align: 'center' });
          curY += 3.5;
        }

        if (barcodeData) {
          const barcodeW = width - (is60x40 ? 12 : 8);
          const barcodeH = is60x40 ? 15 : 11;
          pdf.addImage(barcodeData, 'PNG', (width - barcodeW) / 2, curY, barcodeW, barcodeH);
          curY += barcodeH + 3.5;
        }

        if (showPrice) {
          const isFixed = String(
          companySettings?.pricingMode ||
            'FIXED'
          ).toUpperCase() === 'FIXED';
          const pricePrefix = isFixed ? 'Fixed Price :' : 'Price :';
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(is60x40 ? 9 : 8);
          pdf.text(`${pricePrefix} ${currency} ${price}`, centerX, curY, { align: 'center' });
        }
      });

      pdf.save(`Barcode-Labels-Roll-${new Date().toISOString().slice(0, 10)}.pdf`);
      return true;
    }
  } catch (err) {
    console.error('Batch stickers PDF failed:', err);
    throw err;
  }
}

// 4. Export Sticker as PNG Image using Canvas
export function exportStickersToImage(
  product: any,
  companySettings: any,
  options: StickerCustomOptions = {}
): boolean {
  try {
    const canvas = document.createElement('canvas');
    const width = 380;
    const height = 240;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    const store = (
      companySettings?.name ||
      companySettings?.company_name ||
      companySettings?.companyName ||
      'Retail Store'
    ).toUpperCase();
    const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
    const brand = (product.brandName || product.brand_name || '').toUpperCase();
    const category = (product.categoryName || product.category_name || '').toUpperCase();
    const name = String(product.article || product.name || '').substring(0, 24);
    const barcode = String(product.barcode || '');
    const price = formatStockPrice(getProductRetailPrice(product, companySettings));

    const showStore = options.showStore !== false;
    const showBrand = options.showBrand !== false;
    const showCategory = options.showCategory !== false;
    const showArticle = options.showArticle !== false;
    const showPrice = options.showPrice !== false;
    const showBarcodeText = options.showBarcodeText !== false;

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';

    let currentY = 24;

    // Header (Store & Brand / Category)
    const headerParts: string[] = [];
    if (showStore) headerParts.push(store);
    if (showBrand && brand) headerParts.push(brand);
    if (showCategory && category && headerParts.length < 2) headerParts.push(category);

    if (headerParts.length > 0) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(headerParts.join(' • '), width / 2, currentY);
      currentY += 18;
    }

    // Name
    if (showArticle) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(name, width / 2, currentY);
      currentY += 18;
    }

    // Barcode image via JsBarcode
    const barcodeCanvas = document.createElement('canvas');
    JsBarcode(barcodeCanvas, barcode, {
      format: 'CODE128',
      width: 2,
      height: 40,
      displayValue: showBarcodeText,
      fontSize: 11,
      margin: 2,
      background: '#ffffff',
      lineColor: '#000000',
    });
    ctx.drawImage(barcodeCanvas, (width - 240) / 2, currentY, 240, 65);
    currentY += 75;

    // Price
    if (showPrice) {
      const isFixed = String(
        companySettings?.pricingMode ||
        'FIXED'
      ).toUpperCase() === 'FIXED';
      const pricePrefix = isFixed ? 'Fixed Price :' : 'Price :';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${pricePrefix} ${currency} ${price}`, width / 2, currentY);
    }

    const link = document.createElement('a');
    link.download = `Sticker-${barcode || 'barcode'}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Sticker image export failed:', err);
    throw err;
  }
}

// 5. Generate WhatsApp Receipt Text
export function buildWhatsAppInvoiceText(sale: any, companySettings: any): string {
  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Retail Store';
  const phone = companySettings?.phone || '';
  const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
  const footerNote = companySettings?.invoice_footer || companySettings?.invoiceFooter || 'Thank you for shopping with us!';

  const items = sale.items || [];
  const itemsText = items
    .map((item: any) => {
      const name = item.article || item.product_name || item.name;
      const qty = item.quantity;
      const unitPrice = formatStockPrice(item.unit_price || 0);
      const total = formatStockPrice(item.subtotal || 0);
      return `• *${name}* (${qty}x @ ${currency} ${unitPrice}) = *${currency} ${total}*`;
    })
    .join('\n');

  const subtotal = parseFloat(sale.subtotal || 0);
  const discount = parseFloat(sale.discount || 0);
  const exchangeCredit = parseFloat(sale.exchange_credit || 0);
  const itemsSubtotal = items.reduce((acc: number, it: any) => acc + (parseFloat(it.subtotal || (it.quantity * it.unit_price)) || 0), 0);
  const currentItemsTotal = Math.max(0, (subtotal > 0 ? subtotal : itemsSubtotal) - discount);
  const previousBalance = parseFloat(sale.previous_balance || 0);
  const grandTotalDue = Math.round((currentItemsTotal + previousBalance) * 100) / 100;
  const paidAmount = parseFloat(sale.paid_amount ?? sale.cash_received ?? grandTotalDue);
  const remainingBalance = parseFloat(sale.remaining_balance ?? Math.max(0, grandTotalDue - paidAmount));
  const changeGiven = parseFloat(sale.change_given || (paidAmount > grandTotalDue ? paidAmount - grandTotalDue : 0));

  let message = `🛍️ *${storeName}* - Digital Receipt\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `🧾 Invoice: *${sale.invoice_number}*\n`;
  message += `📅 Date: ${sale.sale_date || ''}\n`;
  if (sale.customer_name) message += `👤 Customer: *${sale.customer_name}*\n`;
  if (sale.cashier_name) message += `🏷️ Cashier: ${sale.cashier_name}\n`;
  message += `💳 Payment: *${sale.payment_method || 'CASH'}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `*Purchased Footwear:*\n${itemsText}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (discount > 0) message += `💰 Discount: -${currency} ${formatStockPrice(discount)}\n`;
  if (exchangeCredit > 0) {
    message += `🔄 Exchange Credit: -${currency} ${formatStockPrice(exchangeCredit)}\n`;
    if (sale.return_number) message += `📑 Exchange Return #: ${sale.return_number}\n`;
  }
  if (previousBalance !== 0) {
    message += `📋 Previous Khata Balance: ${currency} ${formatStockPrice(previousBalance)}\n`;
    message += `📦 Current Items Total: ${currency} ${formatStockPrice(currentItemsTotal)}\n`;
  }
  message += `⭐ *GRAND TOTAL DUE: ${currency} ${formatStockPrice(grandTotalDue)}*\n`;
  message += `💵 Amount Paid: ${currency} ${formatStockPrice(paidAmount)}\n`;
  if (remainingBalance > 0) {
    message += `🔴 *Balance Carried Forward: ${currency} ${formatStockPrice(remainingBalance)}*\n`;
  } else if (changeGiven > 0) {
    message += `🪙 Change Returned: ${currency} ${formatStockPrice(changeGiven)}\n`;
  }
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `${footerNote} 🙏\n`;
  if (phone) message += `📞 Store Contact: ${phone}\n`;

  return message;
}

// 5b. Generate SMS Receipt Text (Concise, high-deliverability format)
export function buildSmsInvoiceText(sale: any, companySettings: any): string {
  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Retail Store';
  const phone = companySettings?.phone || '';
  const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
  const footerNote = companySettings?.invoice_footer || companySettings?.invoiceFooter || 'Thank you for shopping with us!';

  const items = sale.items || [];
  const itemsSummary = items
    .map((item: any) => {
      const name = item.article || item.product_name || item.name || 'Shoe';
      const qty = item.quantity;
      const total = formatStockPrice(item.subtotal || 0);
      return `${name} (${qty}x)=${currency}${total}`;
    })
    .join(', ');

  const subtotal = parseFloat(sale.subtotal || 0);
  const discount = parseFloat(sale.discount || 0);
  const exchangeCredit = parseFloat(sale.exchange_credit || 0);
  const itemsSubtotal = items.reduce((acc: number, it: any) => acc + (parseFloat(it.subtotal || (it.quantity * it.unit_price)) || 0), 0);
  const currentItemsTotal = Math.max(0, (subtotal > 0 ? subtotal : itemsSubtotal) - discount);
  const previousBalance = parseFloat(sale.previous_balance || 0);
  const grandTotalDue = Math.round((currentItemsTotal + previousBalance) * 100) / 100;
  const paidAmount = parseFloat(sale.paid_amount ?? sale.cash_received ?? grandTotalDue);
  const remainingBalance = parseFloat(sale.remaining_balance ?? Math.max(0, grandTotalDue - paidAmount));

  let sms = `${storeName} Receipt\n`;
  sms += `Inv: ${sale.invoice_number} | ${sale.sale_date || ''}\n`;
  if (sale.customer_name) sms += `Cust: ${sale.customer_name}\n`;
  sms += `Items: ${itemsSummary}\n`;
  if (discount > 0) sms += `Disc: -${currency}${formatStockPrice(discount)}\n`;
  if (exchangeCredit > 0) sms += `Exch Credit: -${currency}${formatStockPrice(exchangeCredit)}\n`;
  if (previousBalance !== 0) sms += `Prev Bal: ${currency}${formatStockPrice(previousBalance)} | Items: ${currency}${formatStockPrice(currentItemsTotal)}\n`;
  sms += `Total Due: ${currency}${formatStockPrice(grandTotalDue)} | Paid: ${currency}${formatStockPrice(paidAmount)}\n`;
  if (remainingBalance > 0) sms += `Khata Bal: ${currency}${formatStockPrice(remainingBalance)}\n`;
  sms += `${footerNote}`;
  if (phone) sms += ` | Tel: ${phone}`;

  return sms;
}

/**
 * Normalizes phone number for digital messaging.
 * Converts local Pakistani phone numbers (e.g. 03001234567) to international format (923001234567) for WhatsApp.
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('00')) {
    return cleaned.substring(2);
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '92' + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Normalizes phone number for SMS URI protocol.
 */
export function formatPhoneForSms(phone: string): string {
  if (!phone) return '';
  return phone.trim().replace(/[\s\-\(\)]/g, '');
}

/**
 * Generates an SMS link compatible with iOS, Android, and desktop messaging clients.
 */
export function buildSmsLink(phone: string, text: string): string {
  const cleanPhone = formatPhoneForSms(phone);
  const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  const separator = isApple ? '&' : '?';
  const encodedText = encodeURIComponent(text);
  return cleanPhone ? `sms:${cleanPhone}${separator}body=${encodedText}` : `sms:${separator}body=${encodedText}`;
}

/**
 * Generates a WhatsApp link compatible with WhatsApp Web and mobile WhatsApp app.
 */
export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}


// 6. Export Side-End Box Label for Shoe Box Shelf Storage as PDF (3"x4" / 76mm x 102mm)
export function exportSideEndBoxLabelToPdf(
  product: any,
  copies: number = 1,
  companySettings: any,
  options: {
    color?: string;
    size?: string;
    orientation?: 'portrait' | 'landscape';
    storeName?: string;
  } = {}
): boolean {
  try {
    const orientation = options.orientation || 'portrait';
    const isPortrait = orientation === 'portrait';
    const width = isPortrait ? 76 : 102;
    const height = isPortrait ? 102 : 76;

    const storeName = (
      options.storeName ||
      companySettings?.name ||
      companySettings?.company_name ||
      companySettings?.companyName ||
      'DWU Retail'
    ).toUpperCase();
    const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
    const brand = (product.brandName || product.brand_name || 'SHOES').toUpperCase();
    const article = String(product.article || product.name || 'Shoe Article').toUpperCase();
    const barcode = String(product.barcode || '');
    const price = formatStockPrice(getProductRetailPrice(product, companySettings));
    const barcodeData = generateBarcodeDataUrl(barcode);

    const pdf = new jsPDF({
      orientation: isPortrait ? 'p' : 'l',
      unit: 'mm',
      format: [width, height],
    });

    const totalCopies = Math.max(1, copies);
    for (let c = 0; c < totalCopies; c++) {
      if (c > 0) {
        pdf.addPage([width, height], isPortrait ? 'p' : 'l');
      }

      // Outer border for industrial rack storage visibility
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.8);
      pdf.rect(3, 3, width - 6, height - 6);

      if (isPortrait) {
        // --- PORTRAIT LAYOUT (76mm x 102mm) ---
        // Top Header Banner
        pdf.setFillColor(0, 0, 0);
        pdf.rect(3, 3, width - 6, 9.5, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text(`${storeName}${brand ? ' • ' + brand : ''}`, width / 2, 9.5, { align: 'center' });

        // Article Title (Large readable typography)
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        const splitTitle = pdf.splitTextToSize(article, width - 10);
        let curY = 19;
        pdf.text(splitTitle, width / 2, curY, { align: 'center' });
        curY += splitTitle.length * 5.5 + 2;

        // Divider
        pdf.setLineWidth(0.3);
        pdf.line(5, curY, width - 5, curY);
        curY += 2;

        // Barcode Section
        if (barcodeData) {
          const bcW = 58;
          const bcH = 18;
          pdf.addImage(barcodeData, 'PNG', (width - bcW) / 2, curY, bcW, bcH);
          curY += bcH + 4;
        } else {
          curY += 10;
        }

        // Retail Price Section
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14.5);
        pdf.text(`RETAIL PRICE: ${currency} ${price}`, width / 2, curY, { align: 'center' });
        curY += 5;

        // Manual Write-In Box (For Rack Visibility)
        const boxTop = curY;
        const boxHeight = height - boxTop - 5;
        pdf.setLineWidth(0.6);
        pdf.rect(6, boxTop, width - 12, boxHeight);

        // Rack storage tag
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(90, 90, 90);
        pdf.text('RACK STORAGE IDENTIFICATION', width / 2, boxTop + 4.5, { align: 'center' });

        pdf.setTextColor(0, 0, 0);
        // Color row
        const colorY = boxTop + 13.5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text('COLOR :', 9, colorY);
        if (options.color && options.color.trim()) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12.5);
          pdf.text(options.color.trim().toUpperCase(), 30, colorY);
        } else {
          pdf.setLineWidth(0.3);
          pdf.line(28, colorY + 1, width - 10, colorY + 1);
        }

        // Size row
        const sizeY = boxTop + 24;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text('SIZE   :', 9, sizeY);
        if (options.size && options.size.trim()) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(13.5);
          pdf.text(options.size.trim().toUpperCase(), 30, sizeY);
        } else {
          pdf.setLineWidth(0.3);
          pdf.line(28, sizeY + 1, width - 10, sizeY + 1);
        }
      } else {
        // --- LANDSCAPE LAYOUT (102mm x 76mm) ---
        // Header
        pdf.setFillColor(0, 0, 0);
        pdf.rect(3, 3, width - 6, 8.5, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text(`${storeName}${brand ? ' • ' + brand : ''}`, width / 2, 9, { align: 'center' });

        pdf.setTextColor(0, 0, 0);
        // Left Column: Title, Price
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13.5);
        const splitTitle = pdf.splitTextToSize(article, 52);
        pdf.text(splitTitle, 6, 18);
        let leftY = 18 + splitTitle.length * 5 + 2;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(`PRICE: ${currency} ${price}`, 6, leftY);

        // Right Column: Barcode
        if (barcodeData) {
          const bcW = 44;
          const bcH = 20;
          pdf.addImage(barcodeData, 'PNG', 54, 15, bcW, bcH);
        }

        // Manual Write-in Box across bottom
        const boxTop = 38;
        const boxHeight = height - boxTop - 5;
        pdf.setLineWidth(0.6);
        pdf.rect(6, boxTop, width - 12, boxHeight);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(90, 90, 90);
        pdf.text('RACK STORAGE IDENTIFICATION', width / 2, boxTop + 4.5, { align: 'center' });

        pdf.setTextColor(0, 0, 0);
        const colorY = boxTop + 14;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text('COLOR :', 10, colorY);
        if (options.color && options.color.trim()) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12.5);
          pdf.text(options.color.trim().toUpperCase(), 32, colorY);
        } else {
          pdf.setLineWidth(0.3);
          pdf.line(30, colorY + 1, width - 12, colorY + 1);
        }

        const sizeY = boxTop + 24;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.text('SIZE   :', 10, sizeY);
        if (options.size && options.size.trim()) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(13.5);
          pdf.text(options.size.trim().toUpperCase(), 32, sizeY);
        } else {
          pdf.setLineWidth(0.3);
          pdf.line(30, sizeY + 1, width - 12, sizeY + 1);
        }
      }
    }

    pdf.save(`SideEnd-BoxLabel-${product.article || product.barcode || product.id}-${orientation}.pdf`);
    return true;
  } catch (err) {
    console.error('Side-end label PDF export failed:', err);
    throw err;
  }
}

// 7. Export Side-End Box Label for Shoe Box Shelf Storage as PNG Image
export function exportSideEndBoxLabelToImage(
  product: any,
  companySettings: any,
  options: {
    color?: string;
    size?: string;
    orientation?: 'portrait' | 'landscape';
    storeName?: string;
  } = {}
): boolean {
  try {
    const orientation = options.orientation || 'portrait';
    const isPortrait = orientation === 'portrait';
    // 300 DPI high resolution
    const width = isPortrait ? 900 : 1200;
    const height = isPortrait ? 1200 : 900;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    const storeName = (
      options.storeName ||
      companySettings?.name ||
      companySettings?.company_name ||
      companySettings?.companyName ||
      'DWU Retail'
    ).toUpperCase();
    const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
    const brand = (product.brandName || product.brand_name || 'SHOES').toUpperCase();
    const article = String(product.article || product.name || 'SHOE ARTICLE').toUpperCase();
    const barcode = String(product.barcode || '');
    const price = formatStockPrice(getProductRetailPrice(product, companySettings));

    if (isPortrait) {
      // Header Banner
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, width - 40, 110);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${storeName}${brand ? ' • ' + brand : ''}`, width / 2, 88);

      // Article Title
      ctx.fillStyle = '#000000';
      ctx.font = '900 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(article.substring(0, 24), width / 2, 220);

      // Barcode
      const barcodeCanvas = document.createElement('canvas');
      JsBarcode(barcodeCanvas, barcode, {
        format: 'CODE128',
        width: 3.2,
        height: 140,
        displayValue: true,
        fontSize: 26,
        margin: 5,
        background: '#ffffff',
        lineColor: '#000000',
      });
      ctx.drawImage(barcodeCanvas, (width - 700) / 2, 320, 700, 220);

      // Price
      ctx.fillStyle = '#000000';
      ctx.font = '900 56px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RETAIL PRICE: ${currency} ${price}`, width / 2, 600);

      // Manual Write-in Box
      const boxX = 60;
      const boxY = 660;
      const boxW = width - 120;
      const boxH = height - boxY - 60;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#555555';
      ctx.fillText('RACK STORAGE IDENTIFICATION', width / 2, boxY + 50);

      // Color line
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.fillText('COLOR :', boxX + 40, boxY + 160);

      if (options.color && options.color.trim()) {
        ctx.font = '900 48px sans-serif';
        ctx.fillText(options.color.trim().toUpperCase(), boxX + 240, boxY + 160);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 4;
        ctx.moveTo(boxX + 230, boxY + 165);
        ctx.lineTo(boxX + boxW - 40, boxY + 165);
        ctx.stroke();
      }

      // Size line
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('SIZE   :', boxX + 40, boxY + 300);

      if (options.size && options.size.trim()) {
        ctx.font = '900 56px sans-serif';
        ctx.fillText(options.size.trim().toUpperCase(), boxX + 240, boxY + 300);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 4;
        ctx.moveTo(boxX + 230, boxY + 305);
        ctx.lineTo(boxX + boxW - 40, boxY + 305);
        ctx.stroke();
      }
    } else {
      // Landscape Layout (1200 x 900)
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, width - 40, 90);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${storeName}${brand ? ' • ' + brand : ''}`, width / 2, 75);

      // Left column
      ctx.fillStyle = '#000000';
      ctx.font = '900 46px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(article.substring(0, 20), 50, 200);

      ctx.font = '900 48px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(`PRICE: ${currency} ${price}`, 50, 300);

      // Barcode on right
      const barcodeCanvas = document.createElement('canvas');
      JsBarcode(barcodeCanvas, barcode, {
        format: 'CODE128',
        width: 3.0,
        height: 130,
        displayValue: true,
        fontSize: 24,
        margin: 5,
        background: '#ffffff',
        lineColor: '#000000',
      });
      ctx.drawImage(barcodeCanvas, 680, 140, 480, 200);

      // Manual Write-in Box
      const boxX = 50;
      const boxY = 380;
      const boxW = width - 100;
      const boxH = height - boxY - 50;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText('RACK STORAGE IDENTIFICATION', width / 2, boxY + 50);

      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.fillText('COLOR :', boxX + 40, boxY + 160);

      if (options.color && options.color.trim()) {
        ctx.font = '900 48px sans-serif';
        ctx.fillText(options.color.trim().toUpperCase(), boxX + 240, boxY + 160);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 4;
        ctx.moveTo(boxX + 230, boxY + 165);
        ctx.lineTo(boxX + boxW - 40, boxY + 165);
        ctx.stroke();
      }

      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('SIZE   :', boxX + 40, boxY + 300);

      if (options.size && options.size.trim()) {
        ctx.font = '900 56px sans-serif';
        ctx.fillText(options.size.trim().toUpperCase(), boxX + 240, boxY + 300);
      } else {
        ctx.beginPath();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 4;
        ctx.moveTo(boxX + 230, boxY + 305);
        ctx.lineTo(boxX + boxW - 40, boxY + 305);
        ctx.stroke();
      }
    }

    const link = document.createElement('a');
    link.download = `SideEnd-BoxLabel-${product.article || product.barcode || product.id}-${orientation}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Side-end label image export failed:', err);
    throw err;
  }
}

