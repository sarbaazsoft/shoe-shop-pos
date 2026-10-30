import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Users, UserCheck, UserPlus, Phone, X, Check, CornerDownLeft, ArrowUp, ArrowDown, Sparkles, AlertCircle, Wallet } from 'lucide-react';
import { api } from '../../services/api.ts';
import { formatStockPrice } from '../../utils/priceFormat.ts';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';
import { customerOpeningBalanceSchema } from '../../schemas/openingBalanceSchema.ts';

interface CustomerPickerProps {
  customers: any[];
  selectedCustomerId: number | null;
  onSelectCustomer: (customerId: number | null) => void;
  onCustomerCreated: (newCustomer: any) => void;
  currencySymbol: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  isWholesaleStore?: boolean;
}

interface IndexedCustomer {
  raw: any;
  idStr: string;
  displayCode: string;
  codeStr: string;
  nameLower: string;
  shopLower: string;
  phoneLower: string;
  phoneClean: string;
  balance: number;
  totalSpent: number;
  totalOrders: number;
  searchBlob: string;
}

const MAX_DROPDOWN_MATCHES = 10;
const INITIAL_MODAL_RENDER_LIMIT = 100;

function formatCustomerCode(id: number | string, code?: string): string {
  if (code && String(code).trim()) return String(code).trim();
  const num = Number(id);
  if (!Number.isNaN(num) && num > 0) return `CUS-${String(num).padStart(4, '0')}`;
  return `#${id}`;
}

function readBalance(c: any): number {
  return (
    parseFloat(
      String(
        c?.outstanding_balance ??
          c?.outstandingBalance ??
          c?.current_balance ??
          c?.currentBalance ??
          c?.balance ??
          0
      )
    ) || 0
  );
}

export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onCustomerCreated,
  currencySymbol,
  onModalOpenChange,
  isWholesaleStore = false,
}) => {
  // Combobox state (suggestions only open while typing)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Find Customer modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [debouncedModalQuery, setDebouncedModalQuery] = useState('');
  const [modalHighlightedIndex, setModalHighlightedIndex] = useState(0);
  const [modalRenderLimit, setModalRenderLimit] = useState(INITIAL_MODAL_RENDER_LIMIT);
  const [modalSortBy, setModalSortBy] = useState<'recent' | 'name' | 'balance' | 'spent'>('recent');

  // Quick-add state (inline card or inside the modal)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddInModal, setQuickAddInModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [newOpeningBalance, setNewOpeningBalance] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const comboboxInputRef = useRef<HTMLInputElement | null>(null);
  const modalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const modalTableBodyRef = useRef<HTMLTableSectionElement | null>(null);
  const dropdownListRef = useRef<HTMLDivElement | null>(null);

  // Pause global barcode shortcuts in the POS while a modal / quick-add form is open
  useEffect(() => {
    onModalOpenChange?.(isModalOpen || isQuickAddOpen);
  }, [isModalOpen, isQuickAddOpen, onModalOpenChange]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 90);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModalQuery(modalSearchQuery.trim());
      setModalRenderLimit(INITIAL_MODAL_RENDER_LIMIT);
    }, 120);
    return () => clearTimeout(timer);
  }, [modalSearchQuery]);

  const indexedCustomers = useMemo<IndexedCustomer[]>(() => {
    return (customers || []).map((c: any) => {
      const idStr = String(c.id ?? '');
      const displayCode = formatCustomerCode(c.id, c.code);
      const nameLower = String(c.name ?? '').toLowerCase();
      const shopLower = String(c.shopName ?? c.shop_name ?? '').toLowerCase();
      const phoneLower = String(c.phone ?? '').toLowerCase();
      const phoneClean = phoneLower.replace(/[\s\-()+]/g, '');
      const codeStr = displayCode.toLowerCase();
      return {
        raw: c,
        idStr,
        displayCode,
        codeStr,
        nameLower,
        shopLower,
        phoneLower,
        phoneClean,
        balance: readBalance(c),
        totalSpent: parseFloat(String(c.total_spent ?? c.totalSpent ?? 0)) || 0,
        totalOrders: parseInt(String(c.total_orders ?? c.totalOrders ?? 0), 10) || 0,
        searchBlob: `${nameLower} ${shopLower} ${phoneLower} ${phoneClean} #${idStr} ${idStr} ${codeStr}`,
      };
    });
  }, [customers]);

  const selectedCustomer = useMemo<IndexedCustomer | null>(() => {
    if (!selectedCustomerId) return null;
    return indexedCustomers.find((item) => Number(item.raw.id) === Number(selectedCustomerId)) || null;
  }, [indexedCustomers, selectedCustomerId]);

  const filterByQuery = useCallback(
    (rawQuery: string): IndexedCustomer[] => {
      if (!rawQuery) return indexedCustomers;
      const q = rawQuery.toLowerCase().trim();
      const qDigits = q.replace(/[\s\-()+]/g, '');
      const matches: { item: IndexedCustomer; score: number }[] = [];

      for (const item of indexedCustomers) {
        let score = 0;
        if (item.idStr === q || `#${item.idStr}` === q || item.codeStr === q) score = 100;
        else if (item.nameLower.startsWith(q)) score = 85;
        else if (qDigits.length >= 2 && item.phoneClean.startsWith(qDigits)) score = 80;
        else if (item.codeStr.includes(q) || `#${item.idStr}`.includes(q)) score = 70;
        else if (item.nameLower.includes(q)) score = 60;
        else if (item.shopLower && item.shopLower.includes(q)) score = 58;
        else if (item.phoneLower.includes(q) || (qDigits.length >= 2 && item.phoneClean.includes(qDigits))) score = 55;
        else if (item.searchBlob.includes(q)) score = 40;
        if (score > 0) matches.push({ item, score });
      }

      matches.sort((a, b) => b.score - a.score || Number(b.item.raw.id) - Number(a.item.raw.id));
      return matches.map((m) => m.item);
    },
    [indexedCustomers]
  );

  const comboboxTopMatches = useMemo(() => {
    const activeQuery = debouncedQuery || searchQuery.trim();
    if (!activeQuery) return [];
    return filterByQuery(activeQuery).slice(0, MAX_DROPDOWN_MATCHES);
  }, [filterByQuery, debouncedQuery, searchQuery]);

  const modalFilteredMatches = useMemo(() => {
    const filtered = filterByQuery(debouncedModalQuery);
    if (debouncedModalQuery && modalSortBy === 'recent') return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (modalSortBy === 'name') return String(a.raw.name || '').localeCompare(String(b.raw.name || ''));
      if (modalSortBy === 'balance') return b.balance - a.balance || b.totalSpent - a.totalSpent;
      if (modalSortBy === 'spent') return b.totalSpent - a.totalSpent || b.totalOrders - a.totalOrders;
      return Number(b.raw.id || 0) - Number(a.raw.id || 0);
    });
    return copy;
  }, [filterByQuery, debouncedModalQuery, modalSortBy]);

  const modalVisibleRows = useMemo(
    () => modalFilteredMatches.slice(0, modalRenderLimit),
    [modalFilteredMatches, modalRenderLimit]
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedQuery, searchQuery]);

  useEffect(() => {
    setModalHighlightedIndex(0);
  }, [debouncedModalQuery, modalSortBy, isModalOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setIsInputFocused(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isModalOpen || !modalTableBodyRef.current) return;
    const row = modalTableBodyRef.current.querySelector(
      `[data-modal-customer-idx="${modalHighlightedIndex}"]`
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [modalHighlightedIndex, isModalOpen]);

  useEffect(() => {
    if (!isDropdownOpen || !dropdownListRef.current) return;
    const item = dropdownListRef.current.querySelector(
      `[data-dropdown-customer-idx="${highlightedIndex}"]`
    ) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isDropdownOpen]);

  const handleChooseCustomer = (customer: any | null) => {
    onSelectCustomer(customer ? Number(customer.id) : null);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsInputFocused(false);
    setIsModalOpen(false);
    setQuickAddInModal(false);
    setIsQuickAddOpen(false);
  };

  const handleClearSelection = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    onSelectCustomer(null);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsInputFocused(false);
  };

  const openQuickAdd = (inModal = false, prefillText = '') => {
    setCreateError(null);
    const clean = prefillText.trim();
    if (clean && /^[0-9+\-\s()]{4,}$/.test(clean)) {
      setNewPhone(clean);
      setNewName('');
    } else {
      setNewName(clean);
      setNewPhone('');
    }
    setNewShopName('');
    setNewOpeningBalance('');
    if (inModal) {
      setQuickAddInModal(true);
    } else {
      setIsQuickAddOpen(true);
      setIsDropdownOpen(false);
    }
  };

  const handleCreateCustomer = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCreateError(null);

    if (!newName.trim()) {
      setCreateError('Customer name is required.');
      return;
    }
    if (!newPhone.trim()) {
      setCreateError('Customer phone number is required.');
      return;
    }

    let openingBalanceValue = 0;
    if (isWholesaleStore) {
      const parsedBalance = customerOpeningBalanceSchema.safeParse({ openingBalance: newOpeningBalance });
      if (!parsedBalance.success) {
        setCreateError(parsedBalance.error.issues[0]?.message || 'Invalid opening balance.');
        return;
      }
      openingBalanceValue = parsedBalance.data.openingBalance;
    }

    setIsCreating(true);
    try {
      const res: any = await api.customers.create({
        name: toTitleCaseTrimmed(newName),
        phone: newPhone.trim(),
        customerType: isWholesaleStore ? 'WHOLESALER' : 'RETAILER',
        customer_type: isWholesaleStore ? 'WHOLESALER' : 'RETAILER',
        ...(isWholesaleStore && newShopName.trim() ? { shopName: toTitleCaseTrimmed(newShopName) } : {}),
        ...(isWholesaleStore ? { openingBalance: openingBalanceValue } : {}),
        email: '',
        address: '',
        notes: '',
      });
      const created = res?.customer;
      if (!created) throw new Error('Customer was not returned by the server.');
      onCustomerCreated(created);
      setNewName('');
      setNewPhone('');
      setNewShopName('');
      setNewOpeningBalance('');
      setIsQuickAddOpen(false);
      setQuickAddInModal(false);
      setIsModalOpen(false);
      setIsDropdownOpen(false);
      setIsInputFocused(false);
      setSearchQuery('');
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to register customer.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleComboboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasTypedQuery = searchQuery.trim().length > 0;

    if (e.key === 'ArrowDown') {
      if (!hasTypedQuery) return;
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setHighlightedIndex(0);
        return;
      }
      const maxIdx = Math.max(0, comboboxTopMatches.length - 1);
      setHighlightedIndex((prev) => (prev < maxIdx ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      if (!hasTypedQuery) return;
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        return;
      }
      const maxIdx = Math.max(0, comboboxTopMatches.length - 1);
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIdx));
    } else if (e.key === 'Enter') {
      if (!hasTypedQuery) return;
      e.preventDefault();
      e.stopPropagation();
      if (comboboxTopMatches.length > 0) {
        const target = comboboxTopMatches[highlightedIndex] || comboboxTopMatches[0];
        if (target) handleChooseCustomer(target.raw);
      } else {
        openQuickAdd(false, searchQuery);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsDropdownOpen(false);
      setIsInputFocused(false);
      setSearchQuery('');
      comboboxInputRef.current?.blur();
    }
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (quickAddInModal) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setQuickAddInModal(false);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsModalOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIdx = Math.max(0, modalVisibleRows.length - 1);
      setModalHighlightedIndex((prev) => (prev < maxIdx ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const maxIdx = Math.max(0, modalVisibleRows.length - 1);
      setModalHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const chosen = modalVisibleRows[modalHighlightedIndex] || modalVisibleRows[0];
      if (chosen) handleChooseCustomer(chosen.raw);
    }
  };

  const openFindCustomerModal = () => {
    setIsDropdownOpen(false);
    setIsInputFocused(false);
    setModalSearchQuery(searchQuery.trim());
    setDebouncedModalQuery(searchQuery.trim());
    setQuickAddInModal(false);
    setIsModalOpen(true);
    setTimeout(() => modalSearchInputRef.current?.focus(), 30);
  };

  const showSuggestionsPopup = isDropdownOpen && searchQuery.trim().length > 0;
  const hasSelection = Boolean(selectedCustomer);

  const displayedValue = useMemo(() => {
    if (isInputFocused) return searchQuery;
    if (selectedCustomer) {
      const phonePart = selectedCustomer.raw.phone ? ` (${selectedCustomer.raw.phone})` : '';
      return `${selectedCustomer.raw.name}${phonePart}`;
    }
    return searchQuery;
  }, [isInputFocused, searchQuery, selectedCustomer]);

  const inputPlaceholder = selectedCustomer
    ? `${selectedCustomer.raw.name} — Type to change...`
    : isWholesaleStore
    ? 'Search Dealer / Customer (name, shop, phone, #ID...)'
    : 'Walk-in Customer — search name, phone, #ID...';

  const getInitials = (name: string) =>
    String(name || 'C')
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const quickAddFields = (compact: boolean) => (
    <div className={compact ? (isWholesaleStore ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-2') : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
      <input
        type="text"
        placeholder="Customer Name *"
        value={newName}
        onChange={(e) => setNewName(toTitleCaseLive(e.target.value))}
        className="capitalize app-input w-full px-3 py-2 text-xs"
        autoFocus
      />
      <input
        type="tel"
        placeholder="Mobile / Phone *"
        value={newPhone}
        onChange={(e) => setNewPhone(e.target.value)}
        className="app-input w-full px-3 py-2 text-xs font-mono"
      />
      {isWholesaleStore && (
        <input
          type="text"
          placeholder="Shop Name (optional)"
          value={newShopName}
          onChange={(e) => setNewShopName(toTitleCaseLive(e.target.value))}
          className="capitalize app-input w-full px-3 py-2 text-xs"
        />
      )}
      {isWholesaleStore && (
        <div className="relative">
          <Wallet className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder={`Opening Balance (${currencySymbol}) - optional`}
            value={newOpeningBalance}
            onChange={(e) => setNewOpeningBalance(e.target.value)}
            className="app-input w-full pl-8 pr-3 py-2 text-xs font-mono"
          />
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-extrabold text-blue-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-cyan-400"></span>
          <span>{isWholesaleStore ? 'Dealer / Customer' : 'Customer'}</span>
        </h3>
        <span className="text-[10px] font-mono text-slate-400">{indexedCustomers.length} registered</span>
      </div>

      {isQuickAddOpen ? (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              handleCreateCustomer(e);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setIsQuickAddOpen(false);
            }
          }}
          className="space-y-2 text-xs p-3 rounded-xl bg-white dark:bg-[#0E1628] border border-indigo-200 dark:border-purple-800/60 shadow-xs"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
              <span>Register New Customer</span>
            </span>
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
          {createError && (
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-rose-700 dark:text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{createError}</span>
            </div>
          )}
          {quickAddFields(true)}
          <button
            type="button"
            onClick={handleCreateCustomer}
            disabled={isCreating}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isCreating ? 'Saving Customer...' : 'Save & Select Customer'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-stretch gap-1.5">
            <div className="relative flex-1 min-w-0">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                {hasSelection && !isInputFocused && !searchQuery ? (
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Search className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                )}
              </div>

              <input
                ref={comboboxInputRef}
                type="text"
                id="pos-customer-search-input"
                role="combobox"
                aria-expanded={showSuggestionsPopup}
                aria-autocomplete="list"
                aria-controls="pos-customer-listbox"
                value={displayedValue}
                placeholder={inputPlaceholder}
                onFocus={() => {
                  setIsInputFocused(true);
                  if (searchQuery.trim().length > 0) setIsDropdownOpen(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
                      setIsInputFocused(false);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                    }
                  }, 150);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  setIsDropdownOpen(val.trim().length > 0);
                }}
                onKeyDown={handleComboboxKeyDown}
                className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold outline-none transition border ${
                  hasSelection && !isInputFocused && !searchQuery
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/70 text-emerald-950 dark:text-emerald-200 focus:bg-white dark:focus:bg-slate-900/80 focus:border-indigo-500'
                    : 'bg-slate-50/90 dark:bg-slate-900/60 border-slate-200/90 dark:border-indigo-500/20 text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20'
                }`}
              />

              {(hasSelection || searchQuery.length > 0) && (
                <button
                  type="button"
                  id="pos-customer-clear-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClearSelection}
                  title="Clear selected customer"
                  aria-label="Clear selected customer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition cursor-pointer font-bold text-sm leading-none"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="button"
              id="pos-find-customer-modal-btn"
              onClick={openFindCustomerModal}
              title="Find Customer (Lookup Modal)"
              aria-label="Open Find Customer Modal"
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200/90 dark:border-indigo-500/20 shadow-2xs transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              id="pos-quick-new-customer-btn"
              onClick={() => openQuickAdd(false, searchQuery)}
              title="Register New Customer"
              aria-label="Register New Customer"
              className="px-2.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-bold shadow-2xs transition cursor-pointer active:scale-95 flex items-center gap-1 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>

          {/* Selected customer balance strip */}
          {selectedCustomer && !showSuggestionsPopup && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
              <span className="text-slate-500 dark:text-slate-400 truncate">{selectedCustomer.displayCode}</span>
              <span
                className={`font-bold ${
                  selectedCustomer.balance > 0
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {selectedCustomer.balance > 0
                  ? `Due: ${currencySymbol} ${formatStockPrice(selectedCustomer.balance)}`
                  : 'No balance due'}
              </span>
            </div>
          )}

          <AnimatePresence>
            {showSuggestionsPopup && (
              <motion.div
                id="pos-customer-listbox"
                role="listbox"
                ref={dropdownListRef}
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'top left' }}
                className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#0D1322] border border-slate-200 dark:border-indigo-500/30 rounded-2xl shadow-2xl p-2.5 z-50 max-h-[26rem] overflow-y-auto space-y-2 backdrop-blur-md"
              >
                {comboboxTopMatches.length > 0 ? (
                  comboboxTopMatches.map((item, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    const isSelected = Number(selectedCustomerId) === Number(item.raw.id);
                    const shop = item.raw.shopName ?? item.raw.shop_name;
                    return (
                      <div
                        key={item.raw.id}
                        data-dropdown-customer-idx={idx}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => handleChooseCustomer(item.raw)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isHighlighted
                            ? 'border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/40 dark:bg-[#16203A]'
                            : 'border-slate-200/90 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#121A2F] hover:border-indigo-400 dark:hover:border-indigo-500/50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] flex items-center justify-center font-bold text-xs text-indigo-600 dark:text-indigo-400 select-none">
                            {getInitials(item.raw.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {item.raw.name}
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 font-mono">
                                    {item.displayCode}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 font-mono flex-wrap">
                                  <span>Phone: {item.raw.phone || 'N/A'}</span>
                                  {shop && <span>• {shop}</span>}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isSelected
                                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                                }`}
                              >
                                {isSelected ? 'Selected' : `${item.totalOrders} ${item.totalOrders === 1 ? 'order' : 'orders'}`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 grid grid-cols-2 gap-1.5">
                          <div className="p-1.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-700/50 text-center">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Balance Due
                            </div>
                            <div className="text-xs font-mono font-extrabold text-amber-800 dark:text-amber-200 mt-0.5">
                              {currencySymbol} {formatStockPrice(item.balance)}
                            </div>
                          </div>
                          <div className="p-1.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-700/50 text-center">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              Total Spent
                            </div>
                            <div className="text-xs font-mono font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5">
                              {currencySymbol} {formatStockPrice(item.totalSpent)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChooseCustomer(item.raw);
                            }}
                            className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isSelected ? 'Selected for Sale' : 'Add to Sale'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-4 px-2 text-center space-y-2">
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      No registered customer found for "{searchQuery}"
                    </div>
                    <button
                      type="button"
                      onClick={() => openQuickAdd(false, searchQuery)}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Add "{searchQuery.slice(0, 22)}" as New Customer</span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* FIND CUSTOMER LOOKUP MODAL */}
      {isModalOpen && (
        <div
          className="form-modal-theme fixed inset-0 z-70 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4"
          onKeyDown={handleModalKeyDown}
        >
          <div className="relative w-full max-w-4xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-purple-500/20 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center text-blue-600 dark:text-purple-300">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base text-slate-900 dark:text-white tracking-tight">
                      Find Customer
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-100 dark:bg-purple-950/80 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-700/70">
                      {indexedCustomers.length} Registered
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80">
                    Search by Name, Phone, Shop, or Customer Code/ID • Use ↑↓ and Enter to select
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (quickAddInModal) setQuickAddInModal(false);
                    else openQuickAdd(true, modalSearchQuery);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 text-xs font-bold shadow-sm shadow-purple-600/25 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{quickAddInModal ? 'Back to Customer List' : '+ New Customer'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {quickAddInModal ? (
              <div
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateCustomer(e);
                  }
                }}
                className="p-6 space-y-4 text-xs flex-1 overflow-y-auto"
              >
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-purple-800/60 pb-3">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Quick Register New Customer</h4>
                </div>
                {createError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}
                {quickAddFields(false)}
                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-purple-800/60">
                  <button
                    type="button"
                    onClick={() => setQuickAddInModal(false)}
                    className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCustomer}
                    disabled={isCreating}
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/25 transition cursor-pointer disabled:opacity-50"
                  >
                    {isCreating ? 'Creating Customer...' : 'Save & Select for Sale'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-purple-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={modalSearchInputRef}
                      type="text"
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      placeholder="Type customer Name, Phone, Shop, or Code/ID (#4, CUS-0004)..."
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-[#090E1A] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-purple-300/50 border border-slate-200 dark:border-purple-800/70 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
                    />
                    {modalSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalSearchQuery('');
                          modalSearchInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white cursor-pointer"
                        title="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold mr-1 hidden md:inline">Sort:</span>
                    {(
                      [
                        { id: 'recent', label: 'Recent ID' },
                        { id: 'name', label: 'Name A-Z' },
                        { id: 'balance', label: 'Balance Due' },
                        { id: 'spent', label: 'Top Spenders' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setModalSortBy(tab.id)}
                        className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer border ${
                          modalSortBy === tab.id
                            ? 'bg-blue-50 dark:bg-purple-900/60 text-blue-600 dark:text-purple-200 border-blue-200 dark:border-purple-600'
                            : 'bg-slate-50 dark:bg-[#0B1120] text-slate-600 dark:text-slate-400 border-slate-200/70 dark:border-purple-900/40 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[52vh]">
                  {modalVisibleRows.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-purple-950/50 border border-blue-100 dark:border-purple-800/60 flex items-center justify-center text-blue-600 dark:text-purple-400 mx-auto">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No matching customers found</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {modalSearchQuery
                          ? `No registered customer matches "${modalSearchQuery}". You can register them right now.`
                          : 'No registered customers yet.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => openQuickAdd(true, modalSearchQuery)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/25 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>+ New Customer</span>
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-[#0D1425]/95 backdrop-blur-xs text-slate-600 dark:text-purple-200 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-purple-800/80">
                        <tr>
                          <th className="py-3 px-4">Customer Name &amp; Code</th>
                          <th className="py-3 px-4">Phone</th>
                          <th className="py-3 px-4 text-right">Balance Due / Spent</th>
                          <th className="py-3 px-4 text-right w-28">Action</th>
                        </tr>
                      </thead>
                      <tbody ref={modalTableBodyRef} className="divide-y divide-slate-100 dark:divide-purple-900/30">
                        {modalVisibleRows.map((item, idx) => {
                          const isHighlighted = idx === modalHighlightedIndex;
                          const isSelected = Number(selectedCustomerId) === Number(item.raw.id);
                          const shop = item.raw.shopName ?? item.raw.shop_name;
                          return (
                            <tr
                              key={item.raw.id}
                              data-modal-customer-idx={idx}
                              onMouseEnter={() => setModalHighlightedIndex(idx)}
                              onClick={() => handleChooseCustomer(item.raw)}
                              className={`transition cursor-pointer ${
                                isHighlighted
                                  ? 'bg-blue-50/90 dark:bg-purple-900/45'
                                  : isSelected
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/25'
                                  : 'hover:bg-slate-50 dark:hover:bg-purple-950/20'
                              }`}
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-purple-950/70 border border-blue-200/80 dark:border-purple-800/70 flex items-center justify-center text-blue-600 dark:text-purple-300 font-bold text-xs shrink-0">
                                    {getInitials(item.raw.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-900 dark:text-white truncate">
                                        {item.raw.name}
                                      </span>
                                      <span className="px-1.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-purple-950/80 text-blue-600 dark:text-purple-300 border border-slate-200 dark:border-purple-800/60">
                                        {item.displayCode}
                                      </span>
                                    </div>
                                    {shop && (
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{shop}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200">
                                {item.raw.phone ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{item.raw.phone}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-600">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end">
                                  <div
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                                      item.balance > 0
                                        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60'
                                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                                    }`}
                                  >
                                    <Wallet className="w-3 h-3" />
                                    <span>
                                      {item.balance > 0 ? `Due: ${currencySymbol} ${formatStockPrice(item.balance)}` : 'Settled'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                                    Spent:{' '}
                                    <strong className="text-slate-900 dark:text-white">
                                      {currencySymbol} {formatStockPrice(item.totalSpent)}
                                    </strong>
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      ({item.totalOrders} {item.totalOrders === 1 ? 'order' : 'orders'})
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleChooseCustomer(item.raw);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white'
                                      : isHighlighted
                                      ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-xs'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-600 hover:text-white'
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Selected</span>
                                    </>
                                  ) : (
                                    <span>Select</span>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {modalFilteredMatches.length > modalRenderLimit && (
                    <div className="p-3 text-center bg-slate-50/70 dark:bg-[#0B1120] border-t border-slate-200 dark:border-purple-900/50">
                      <button
                        type="button"
                        onClick={() => setModalRenderLimit((prev) => prev + 100)}
                        className="px-4 py-1.5 rounded-xl bg-blue-50 dark:bg-purple-900/50 text-blue-600 dark:text-purple-200 font-bold text-xs hover:bg-blue-100 dark:hover:bg-purple-800/60 transition cursor-pointer"
                      >
                        Show More Customers ({modalFilteredMatches.length - modalRenderLimit} remaining)
                      </button>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-purple-200/80">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[10px] inline-flex items-center">
                        <ArrowUp className="w-2.5 h-2.5" />
                        <ArrowDown className="w-2.5 h-2.5" />
                      </kbd>
                      <span>Navigate</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[10px] inline-flex items-center gap-0.5">
                        <CornerDownLeft className="w-2.5 h-2.5" /> Enter
                      </kbd>
                      <span>Select</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[10px]">
                        Esc
                      </kbd>
                      <span>Close</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>
                      Showing <strong>{modalVisibleRows.length}</strong> of <strong>{modalFilteredMatches.length}</strong> matches
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="btn-secondary px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
