import React, { useState } from 'react';
import { X, Edit2, Phone, Receipt, DollarSign, ShoppingBag, RefreshCw, BookOpen, PlusCircle, CheckCircle2, AlertCircle, Building, Banknote } from 'lucide-react';
import { formatStockPrice } from '../../utils/priceFormat.ts';
import { api } from '../../services/api.ts';

interface CustomerDetailsModalProps {
  customer: any;
  currencySymbol: string;
  isLoadingHistory: boolean;
  onEdit: () => void;
  onClose: () => void;
  onPaymentRecorded?: () => void;
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  customer,
  currencySymbol,
  isLoadingHistory,
  onEdit,
  onClose,
  onPaymentRecorded,
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'sales'>('ledger');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'ONLINE'>('CASH');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);
  const [paymentErrorMsg, setPaymentErrorMsg] = useState<string | null>(null);

  // Local state for ledger entries and balance to reflect instant payment updates
  const [localCustomer, setLocalCustomer] = useState<any>(customer);

  if (!customer) return null;

  const sales = localCustomer.sales || [];
  const ledger = localCustomer.ledger || [];
  const totalOrders = sales.length;
  const totalSpent = sales.reduce(
    (acc: number, s: any) => acc + (parseFloat(s.total_amount || s.totalAmount || 0) || 0),
    0
  );

  const outstandingBalance = parseFloat(
    localCustomer.outstanding_balance ??
    localCustomer.outstandingBalance ??
    localCustomer.current_balance ??
    localCustomer.currentBalance ??
    localCustomer.balance ??
    0
  ) || 0;

  const initials = (customer.name || 'C')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentErrorMsg(null);
    setPaymentSuccessMsg(null);

    const amount = typeof paymentAmount === 'number' ? paymentAmount : parseFloat(String(paymentAmount));
    if (isNaN(amount) || amount <= 0) {
      setPaymentErrorMsg('Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await api.customers.recordPayment(customer.id, {
        amount,
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
        paymentDate: new Date().toISOString().slice(0, 10),
      });

      const updatedBal = parseFloat(String(res.newBalance ?? Math.max(0, outstandingBalance - amount)));
      const newEntry = res.ledgerEntry || {
        id: Date.now(),
        transaction_date: new Date().toISOString().slice(0, 10),
        invoice_id: null,
        invoice_number: 'PAYMENT',
        total_bill: 0,
        amount_paid: amount,
        balance_change: -amount,
        running_balance: updatedBal,
        payment_method: paymentMethod,
        notes: paymentNotes.trim() || `Payment received (${paymentMethod})`,
      };

      setLocalCustomer((prev: any) => ({
        ...prev,
        outstanding_balance: updatedBal,
        current_balance: updatedBal,
        ledger: [newEntry, ...(prev.ledger || [])],
      }));

      setPaymentAmount('');
      setPaymentNotes('');
      setIsRecordingPayment(false);
      setPaymentSuccessMsg(`Payment of ${currencySymbol} ${formatStockPrice(amount)} recorded successfully!`);
      setTimeout(() => setPaymentSuccessMsg(null), 4000);

      onPaymentRecorded?.();
    } catch (err: any) {
      setPaymentErrorMsg(err?.message || 'Failed to record payment.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-purple-800/80 my-auto">
        {/* Header with Gradient Accent */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-800 dark:text-white">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 dark:bg-purple-500/20 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center text-blue-600 dark:text-purple-300 font-bold text-sm shadow-2xs">
              {initials}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">{customer.name}</h3>
                {(customer.shop_name || customer.shopName) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                    {customer.shop_name || customer.shopName}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-800/60 font-mono">
                  ID #{customer.id}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-purple-200/80 mt-0.5">
                <span className="flex items-center space-x-1">
                  <Phone className="w-3 h-3" />
                  <span className="font-mono">{customer.phone}</span>
                </span>
                {(customer.market_name || customer.marketName || customer.city) && (
                  <span className="flex items-center space-x-1">
                    <Building className="w-3 h-3" />
                    <span>{[customer.market_name || customer.marketName, customer.city].filter(Boolean).join(', ')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsRecordingPayment((prev) => !prev)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Receive Payment</span>
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Notification Messages */}
          {paymentSuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{paymentSuccessMsg}</span>
            </div>
          )}
          {paymentErrorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{paymentErrorMsg}</span>
            </div>
          )}

          {/* Quick Payment Form */}
          {isRecordingPayment && (
            <form
              onSubmit={handleRecordPaymentSubmit}
              className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl space-y-3"
            >
              <div className="flex items-center justify-between font-bold text-indigo-950 dark:text-indigo-200">
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Record Customer Payment / Account Settlement</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Current Balance: {currencySymbol} {formatStockPrice(outstandingBalance)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount Received ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={`e.g. ${outstandingBalance > 0 ? outstandingBalance : 5000}`}
                    value={paymentAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setPaymentAmount(isNaN(val) ? '' : val);
                    }}
                    required
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#0B0F1A] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#0B0F1A] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="ONLINE">Online / Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Payment Note (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Account clearing / slip #302"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-[#0B0F1A] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRecordingPayment(false)}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Saving...' : 'Save & Update Khata'}
                </button>
              </div>
            </form>
          )}

          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Outstanding Khata Balance */}
            <div className={`p-4 rounded-xl border ${
              outstandingBalance > 0
                ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60'
                : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Outstanding Khata Balance
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  outstandingBalance > 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                }`}>
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className={`mt-2 text-2xl font-black font-mono tracking-tight ${
                outstandingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {currencySymbol} {formatStockPrice(outstandingBalance)}
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {outstandingBalance > 0 ? 'Unpaid balance carried forward' : 'Account in good standing (Nil)'}
              </span>
            </div>

            {/* Total Orders Placed */}
            <div className="app-stat-card p-4 rounded-xl border border-slate-200 dark:border-purple-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Total Orders Placed
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-500/30 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                {totalOrders} {totalOrders === 1 ? 'invoice' : 'invoices'}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Recorded sales invoices</span>
            </div>

            {/* Lifetime Spend Value */}
            <div className="app-stat-card p-4 rounded-xl border border-slate-200 dark:border-purple-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Lifetime Spend Value
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                {currencySymbol} {formatStockPrice(totalSpent)}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Cumulative account purchases</span>
            </div>
          </div>

          {/* TAB SELECTOR: Khata Ledger vs Sales Invoices */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'ledger'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Khata Ledger Audit History ({ledger.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'sales'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Invoices History ({sales.length})</span>
            </button>
          </div>

          {/* TAB 1: KHATA LEDGER AUDIT HISTORY */}
          {activeTab === 'ledger' && (
            <div className="space-y-2.5">
              {isLoadingHistory ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-600 dark:text-purple-400 mx-auto" />
                  <p className="font-medium text-xs">Loading Khata ledger audit trail...</p>
                </div>
              ) : ledger.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-purple-800/60 rounded-xl bg-slate-50/50 dark:bg-[#0B1120]">
                  No Khata transactions recorded yet for {customer.name}.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-purple-800/80 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 text-slate-600 dark:text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-purple-800/80">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Reference / Inv #</th>
                          <th className="py-2.5 px-3 text-right">Total Bill</th>
                          <th className="py-2.5 px-3 text-right">Amount Paid</th>
                          <th className="py-2.5 px-3 text-right">Khata Change</th>
                          <th className="py-2.5 px-3 text-right">Running Balance</th>
                          <th className="py-2.5 px-3">Mode</th>
                          <th className="py-2.5 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-purple-900/40">
                        {ledger.map((entry: any) => {
                          const bill = parseFloat(entry.total_bill ?? entry.totalBill ?? 0);
                          const paid = parseFloat(entry.amount_paid ?? entry.amountPaid ?? 0);
                          const change = parseFloat(entry.balance_change ?? entry.balanceChange ?? 0);
                          const running = parseFloat(entry.running_balance ?? entry.runningBalance ?? 0);

                          return (
                            <tr
                              key={entry.id}
                              className="table-row-hover hover:bg-blue-50/30 dark:hover:bg-purple-900/30 transition text-[11px]"
                            >
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
                                {entry.transaction_date || entry.transactionDate || '-'}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-cyan-400 whitespace-nowrap">
                                {entry.invoice_number || entry.invoiceNumber || (entry.invoice_id ? `#${entry.invoice_id}` : 'PAYMENT')}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                {bill > 0 ? `${currencySymbol} ${formatStockPrice(bill)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                {paid > 0 ? `${currencySymbol} ${formatStockPrice(paid)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                                <span className={change > 0 ? 'text-rose-600 dark:text-rose-400' : change < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                                  {change > 0 ? `+${currencySymbol} ${formatStockPrice(change)}` : change < 0 ? `-${currencySymbol} ${formatStockPrice(Math.abs(change))}` : '0.00'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                                {currencySymbol} {formatStockPrice(running)}
                              </td>
                              <td className="py-2 px-3">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-[#1A2235] text-slate-700 dark:text-slate-300 uppercase">
                                  {entry.payment_method || entry.paymentMethod || 'KHATA'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                                {entry.notes || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SALES INVOICES */}
          {activeTab === 'sales' && (
            <div className="space-y-2.5">
              {isLoadingHistory ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                  <p className="font-medium text-xs">Loading invoice history...</p>
                </div>
              ) : sales.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-purple-800/60 rounded-xl bg-slate-50/50 dark:bg-[#0B1120]">
                  No sales invoices recorded yet for {customer.name}.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-purple-800/80 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 text-slate-600 dark:text-white font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-purple-800/80">
                      <tr>
                        <th className="py-2.5 px-3.5">Invoice #</th>
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3.5">Payment Method</th>
                        <th className="py-2.5 px-3.5 text-right">Items Subtotal</th>
                        <th className="py-2.5 px-3.5 text-right">Grand Total Due</th>
                        <th className="py-2.5 px-3.5 text-right">Remaining Khata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-purple-900/40">
                      {sales.map((s: any) => {
                        const grandTotal = parseFloat(s.total_amount || s.totalAmount || 0);
                        const sub = parseFloat(s.subtotal || grandTotal);
                        const rem = parseFloat(s.remaining_balance || s.remainingBalance || 0);

                        return (
                          <tr
                            key={s.id}
                            className="table-row-hover hover:bg-blue-50/30 dark:hover:bg-purple-900/30 transition text-[11px]"
                          >
                            <td className="py-2.5 px-3.5 font-mono font-bold text-blue-600 dark:text-cyan-400">
                              {s.invoice_number || s.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300">
                              {s.sale_date || s.saleDate || '-'}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-[#131D33] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-purple-800/50">
                                {s.payment_method || s.paymentMethod || 'CASH'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                              {currencySymbol} {formatStockPrice(sub)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {currencySymbol} {formatStockPrice(grandTotal)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                              <span className={rem > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                {currencySymbol} {formatStockPrice(rem)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex justify-between items-center">
          <div className="text-[11px] text-slate-500 font-mono">
            Khata Balance: <strong className={outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>{currencySymbol} {formatStockPrice(outstandingBalance)}</strong>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary px-4 py-1.5 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
