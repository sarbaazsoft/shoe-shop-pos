import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Edit2, Trash2, AlertTriangle, Barcode, SlidersHorizontal, ShoppingBag, Boxes, Layers, DollarSign, Box, RefreshCw, Upload, CheckCircle2, Check, X, Loader2, LayoutGrid, List } from 'lucide-react';
import { api } from '../../services/api.ts';
import { ProductFormModal } from './ProductFormModal.tsx';
import { CsvImportModal } from './CsvImportModal.tsx';
import { BarcodeStickerModal } from './BarcodeStickerModal.tsx';
import { BarcodeGeneratorTool } from './BarcodeGeneratorTool.tsx';
import { SideEndBoxLabelModal } from './SideEndBoxLabelModal.tsx';
import { StockAdjustModal } from './StockAdjustModal.tsx';
import { BarcodeSvg } from '../common/BarcodeSvg.tsx';
import { formatStockPrice, getProductRetailPrice, getProductMinFloorPrice } from '../../utils/priceFormat.ts';
import { useTheme } from '../../context/ThemeContext.tsx';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';
import { STANDARD_FOOTWEAR_CATEGORIES, isHalfCartonAllowed } from '../../utils/footwear.ts';

interface ProductManagementProps {
  currentUser: any;
  companySettings: any;
  initialBrand?: string;
  initialCategory?: string;
  initialBrandId?: string | number | '';
  initialCategoryId?: string | number | '';
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  currentUser,
  companySettings,
  initialBrand,
  initialCategory,
  initialBrandId,
  initialCategoryId,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [products, setProducts] = useState<any[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<any[]>(STANDARD_FOOTWEAR_CATEGORIES);

  const [searchTerm, setSearchTerm] = useState('');
  const initialBrandStr = initialBrand || (typeof initialBrandId === 'string' ? initialBrandId : '') || '';
  const initialCatStr = initialCategory || (typeof initialCategoryId === 'string' ? initialCategoryId : '') || '';
  const [selectedBrand, setSelectedBrand] = useState<string>(initialBrandStr);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCatStr);
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState<number>(25);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [stickerProduct, setStickerProduct] = useState<any | null>(null);
  const [sideEndLabelProduct, setSideEndLabelProduct] = useState<any | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [isBarcodeToolOpen, setIsBarcodeToolOpen] = useState(false);
  const [barcodeToolProduct, setBarcodeToolProduct] = useState<any | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [importToastMessage, setImportToastMessage] = useState<string | null>(null);

  const handleOpenBarcodeTool = (product?: any) => {
    setBarcodeToolProduct(product || null);
    setIsBarcodeToolOpen(true);
  };

  const currencySymbol = companySettings?.currencySymbol || 'Rs.';
  const rawPricingMode = String(companySettings?.pricingMode || 'FIXED').toUpperCase();
  const isFixedPolicy = rawPricingMode === 'FIXED';
  const isWholesaleStore = String(companySettings?.businessType || companySettings?.business_type || '').toUpperCase() === 'WHOLESALE';
  
  // Store Admin role check
  const userRole = String(currentUser?.role || currentUser?.originalRole || '').toUpperCase();
  const isStoreAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN' || userRole === 'STORE_ADMIN';
  const isAdmin = isStoreAdmin;

  // Inline Stock Editing State
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [inlineStockValue, setInlineStockValue] = useState<string>('');
  const [savingStockId, setSavingStockId] = useState<number | null>(null);
  const [justUpdatedStockId, setJustUpdatedStockId] = useState<number | null>(null);
  const [inlineStockError, setInlineStockError] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select text when entering inline edit mode
  useEffect(() => {
    if (editingStockId !== null && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingStockId]);

  const handleStartInlineEdit = (p: any) => {
    if (!isStoreAdmin || savingStockId !== null) return;
    setEditingStockId(p.id);
    setInlineStockValue(String(p.totalStock ?? 0));
    setInlineStockError(null);
  };

  const handleCancelInlineEdit = () => {
    setEditingStockId(null);
    setInlineStockValue('');
    setInlineStockError(null);
  };

  const handleSaveInlineStock = async (p: any) => {
    const parsed = parseInt(inlineStockValue, 10);
    if (isNaN(parsed) || parsed < 0) {
      setInlineStockError('Must be 0 or more');
      return;
    }

    if (parsed === Number(p.totalStock)) {
      handleCancelInlineEdit();
      return;
    }

    setSavingStockId(p.id);
    setInlineStockError(null);
    try {
      await api.inventory.updateInlineStock({
        productId: p.id,
        newStock: parsed,
        reason: 'Inline table update by Store Admin',
      });

      // Optimistically update product in local state
      setProducts((prev) =>
        prev.map((prod) => (prod.id === p.id ? { ...prod, totalStock: parsed } : prod))
      );

      // Trigger visual success pulse
      setJustUpdatedStockId(p.id);
      setTimeout(() => {
        setJustUpdatedStockId((curr) => (curr === p.id ? null : curr));
      }, 2500);

      // Broadcast inventory update event for headers, POS and report sync
      window.dispatchEvent(new CustomEvent('inventory:updated', { detail: { productId: p.id, newStock: parsed } }));
      triggerStatRecount();
      setEditingStockId(null);
    } catch (err: any) {
      setInlineStockError(err?.message || 'Failed to update stock');
    } finally {
      setSavingStockId(null);
    }
  };

  useEffect(() => {
    loadFilterData();

    // Check for pending edit or barcode actions from Quick Price search bar
    const handleEditEvent = (e: any) => {
      const product = e.detail?.product;
      if (product) {
        setEditingProduct(product);
        setIsFormModalOpen(true);
      }
    };

    const handleBarcodeEvent = (e: any) => {
      const product = e.detail?.product;
      if (product) {
        handleOpenBarcodeTool(product);
      }
    };

    window.addEventListener('product:edit', handleEditEvent);
    window.addEventListener('inventory:print-barcode', handleBarcodeEvent);

    const pendingEditStr = sessionStorage.getItem('pending_edit_product');
    if (pendingEditStr) {
      try {
        const prod = JSON.parse(pendingEditStr);
        sessionStorage.removeItem('pending_edit_product');
        setEditingProduct(prod);
        setIsFormModalOpen(true);
      } catch {}
    }

    const pendingBarcodeStr = sessionStorage.getItem('pending_barcode_product');
    if (pendingBarcodeStr) {
      try {
        const prod = JSON.parse(pendingBarcodeStr);
        sessionStorage.removeItem('pending_barcode_product');
        handleOpenBarcodeTool(prod);
      } catch {}
    }

    return () => {
      window.removeEventListener('product:edit', handleEditEvent);
      window.removeEventListener('inventory:print-barcode', handleBarcodeEvent);
    };
  }, []);

  useEffect(() => {
    loadProducts();
  }, [selectedBrand, selectedCategory, lowStockFilter]);

  useEffect(() => {
    if (initialBrand !== undefined) {
      setSelectedBrand(initialBrand || '');
    } else if (initialBrandId !== undefined) {
      setSelectedBrand(String(initialBrandId || ''));
    }
    if (initialCategory !== undefined) {
      setSelectedCategory(initialCategory || '');
    } else if (initialCategoryId !== undefined) {
      setSelectedCategory(String(initialCategoryId || ''));
    }
  }, [initialBrand, initialCategory, initialBrandId, initialCategoryId]);

  const loadFilterData = async () => {
    try {
      const cRes = await api.categories.getCategories();
      const seenC = new Set<string>();
      const uniqueC: any[] = [];
      for (const c of (cRes.categories || [])) {
        const name = (typeof c === 'string' ? c : c.name || '').trim();
        if (name && !seenC.has(name.toLowerCase())) {
          seenC.add(name.toLowerCase());
          uniqueC.push(typeof c === 'string' ? { id: name, name } : c);
        }
      }
      setCategories(uniqueC);
    } catch (e: any) {
      console.warn('Notice loading filter metadata:', e?.message || e);
    }
  };

  const isRefreshingRef = useRef(false);

  const loadProducts = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsLoading(true);
    try {
      const res = await api.products.list({
        search: searchTerm.trim() || undefined,
        brand: selectedBrand || undefined,
        category: selectedCategory || undefined,
        lowStockOnly: lowStockFilter || undefined,
      });
      const fetched = res.products || [];
      setProducts(fetched);
      const distinctBrands = Array.from(new Set(fetched.map((p: any) => String(p.brand || '').trim()).filter(Boolean))).sort() as string[];
      setBrands(distinctBrands);
    } catch (err: any) {
      console.warn('Notice loading products:', err?.message || err);
    } finally {
      isRefreshingRef.current = false;
      setIsLoading(false);
      triggerStatRecount();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadProducts();
  };

  const handleDeleteProduct = async (product: any) => {
    if (
      !window.confirm(
        `Are you sure you want to remove "${product.article || product.name}"? If it has historic sales, it will be deactivated to protect your accounts.`
      )
    ) {
      return;
    }

    try {
      await api.products.delete(product.id);
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product.');
    }
  };

  const totalStockPairs = products.reduce((acc, p) => acc + (Number(p.totalStock) || 0), 0);
  const lowStockCount = products.filter((p) => (Number(p.totalStock) || 0) <= (Number(p.lowStockLimit) || 5)).length;
  const totalValuation = products.reduce((acc, p) => acc + (Number(p.totalStock) || 0) * (Number(p.costPrice ?? p.cost_price) || 0), 0);

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      {/* CSV Import Completion Toast Notification */}
      <AnimatePresence>
        {importToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            className="fixed top-4 right-4 z-50 max-w-md bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl border border-emerald-400/50 flex items-center justify-between gap-3 text-xs font-bold"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{importToastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportToastMessage(null)}
              className="text-white/80 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Action */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-sm transition-colors dark:text-white"
      >
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Product Inventory &amp; Catalog
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 font-medium mt-0.5">
            1 Product = 1 Barcode = Total Stock
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="open-barcode-generator-btn"
            type="button"
            onClick={() => handleOpenBarcodeTool()}
            className="bg-[#0284C7] hover:bg-[#0369A1] dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-white dark:text-purple-200 border border-[#0284C7] dark:border-purple-400/40 shadow-sm dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all cursor-pointer"
            title="Open Barcode Generation & Physical Label Printing Tool"
          >
            <Barcode className="w-4 h-4" />
            <span>Barcode Generator &amp; Labels</span>
          </button>

          {isAdmin && (
            <>
              <button
                id="open-csv-import-btn"
                type="button"
                onClick={() => setIsCsvImportOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-white dark:text-emerald-200 border border-emerald-500 dark:border-emerald-400/40 shadow-sm font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                title="Bulk Import or Update Products via CSV"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsFormModalOpen(true);
                }}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </button>
            </>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {importToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700/70 text-emerald-800 dark:text-emerald-200 text-xs font-bold shadow-md"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{importToastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportToastMessage(null)}
              className="text-emerald-700 dark:text-emerald-300 hover:underline text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inventory KPI Summary Cards with Animated Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* CARD 1: TOTAL ARTICLES */}
        <StatCard
          id="stat-total-articles"
          title="Total Articles"
          value={products.length}
          icon={Boxes}
          iconColor="blue"
          valueClassName="font-mono text-slate-900 dark:text-white"
          subtext={<span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">Active catalog items</span>}
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        {/* CARD 2: STOCK ON HAND */}
        <StatCard
          id="stat-stock-on-hand"
          title="Stock on Hand"
          value={totalStockPairs}
          suffix=" pairs"
          icon={Layers}
          iconColor="cyan"
          valueClassName="font-mono text-cyan-600 dark:text-cyan-400"
          subtext={<span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">Total physical pairs</span>}
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        {/* CARD 3: LOW STOCK */}
        <StatCard
          id="stat-inventory-low-stock"
          title="Low Stock"
          value={lowStockCount}
          suffix={lowStockCount > 0 ? " articles" : ""}
          icon={AlertTriangle}
          iconColor="amber"
          valueClassName={`font-mono ${lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}
          subtext={<span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">Need restocking</span>}
          loading={isLoading}
          delay={0}
          duration={1200}
        />

        {/* CARD 4: STOCK VALUATION */}
        <StatCard
          id="stat-stock-valuation"
          title="Stock Valuation"
          value={totalValuation}
          prefix={`${currencySymbol} `}
          icon={DollarSign}
          iconColor="purple"
          valueClassName="font-mono text-purple-700 dark:text-purple-400"
          subtext={<span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">At purchase cost</span>}
          loading={isLoading}
          delay={0}
          duration={1200}
        />
      </div>

      {/* Filter and Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="app-card p-4 flex flex-wrap items-center gap-3 text-xs transition-colors dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:border-purple-800/80 dark:text-white"
      >
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by article or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="app-input w-full pl-[2.125rem] pr-8 py-2.5 text-xs font-medium dark:bg-slate-900/80 dark:border-purple-800/60 dark:text-white dark:placeholder-slate-400"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 p-1 text-xs cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </form>

        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="capitalize px-3.5 py-2.5 bg-slate-50 dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 text-slate-800 dark:text-purple-200 hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] rounded-xl outline-none font-medium focus:border-blue-500 dark:focus:border-purple-400 cursor-pointer transition"
        >
          <option value="">All Brands</option>
          {brands.map((bName) => (
            <option key={`brand-opt-${bName}`} value={bName} className="dark:bg-[#120726] dark:text-purple-100">
              {bName} {bName.toLowerCase() === 'local' ? '(Default)' : ''}
            </option>
          ))}
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="capitalize px-3.5 py-2.5 bg-slate-50 dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 text-slate-800 dark:text-purple-200 hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] rounded-xl outline-none font-medium focus:border-blue-500 dark:focus:border-purple-400 cursor-pointer transition"
        >
          <option value="">All Categories</option>
          {categories.map((c, idx) => {
            const cName = typeof c === 'string' ? c : c.name;
            const optKey = c?.id ? `cat-opt-${c.id}` : `cat-opt-${cName || 'c'}-${idx}`;
            return (
              <option key={optKey} value={cName} className="dark:bg-[#120726] dark:text-purple-100">
                {cName}
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl font-bold border transition cursor-pointer ${
            lowStockFilter
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 shadow-xs'
              : 'bg-slate-50 dark:bg-purple-500/20 text-slate-700 dark:text-purple-200 border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Low Stock Alert</span>
        </button>

        {selectedProductIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const firstSelected = products.find((p) => p.id === selectedProductIds[0]);
              handleOpenBarcodeTool(firstSelected);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 text-white font-bold rounded-xl border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] transition cursor-pointer active:scale-95"
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>Generate Labels ({selectedProductIds.length} Selected)</span>
          </button>
        )}

        <button
          type="button"
          onClick={loadProducts}
          disabled={isLoading}
          className="btn-outline-landing flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold rounded-xl transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          title={isLoading ? "Refreshing inventory..." : "Refresh inventory stats & records"}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-blue-600 dark:text-purple-300'}`} />
          <span>Refresh</span>
        </button>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-100 dark:bg-purple-950/40 p-1 rounded-xl border border-slate-200 dark:border-purple-800/60 ml-auto sm:ml-0">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            title="Card Grid View"
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-purple-500/20 text-blue-600 dark:text-purple-200 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            title="Table View"
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white dark:bg-purple-500/20 text-blue-600 dark:text-purple-200 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>

      {/* Product Content: Dynamic CSS Grid or Table View */}
      {isLoading ? (
        <div className="app-card p-12 text-center text-slate-400 dark:text-slate-500">
          <div className="flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
            <p className="font-medium text-xs">Loading inventory...</p>
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="app-card p-12 text-center text-slate-400 dark:text-slate-500">
          No products found matching filters.
        </div>
      ) : viewMode === 'grid' ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="space-y-4"
        >
          {/* Grid Selection & Count Utility Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={products.length > 0 && selectedProductIds.length === products.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedProductIds(products.map((p) => p.id));
                  else setSelectedProductIds([]);
                }}
                className="rounded border-slate-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 focus:ring-0 cursor-pointer"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Select All Products ({products.length})
              </span>
            </label>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Showing {Math.min(visibleCount, products.length)} of {products.length} products
            </span>
          </div>

          {/* Dynamic CSS Grid: 1 col on mobile, scaling up to 5 cols on wide desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
            {products.slice(0, visibleCount).map((p) => {
              const isLowStock = p.totalStock <= p.lowStockLimit;
              const isOutOfStock = p.totalStock <= 0;
              const isChecked = selectedProductIds.includes(p.id);
              const retailPrice = getProductRetailPrice(p, companySettings);
              const minFloor = getProductMinFloorPrice(p, companySettings);

              return (
                <div
                  key={p.id}
                  className={`group app-card flex flex-col justify-between overflow-hidden transition-all duration-200 border rounded-2xl ${
                    isChecked
                      ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/20 dark:bg-purple-950/30'
                      : 'border-slate-200/90 dark:border-purple-900/40 hover:border-purple-400/60 dark:hover:border-purple-600/60 shadow-xs hover:shadow-md'
                  }`}
                >
                  {/* Card Top: Checkbox, Brand, Category */}
                  <div className="p-3 pb-2 flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedProductIds(selectedProductIds.filter((id) => id !== p.id));
                          } else {
                            setSelectedProductIds([...selectedProductIds, p.id]);
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-600 dark:bg-[#0E1628] text-purple-600 focus:ring-0 cursor-pointer shrink-0"
                      />
                      <BrandLogo logo={p.brandLogo} name={p.brandName || 'Unbranded'} size="xs" />
                      <span className="truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-300 max-w-[90px]">
                        {p.brandName || 'Unbranded'}
                      </span>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
                      {p.categoryName || 'General'}
                    </span>
                  </div>

                  {/* Card Image & Overlay */}
                  <div className="relative p-3 pb-2 flex flex-col items-center">
                    <div className="w-full aspect-4/3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-slate-100 dark:bg-[#0A0E1A] overflow-hidden flex items-center justify-center p-1 relative shadow-inner">
                      {p.primaryImageUrl ? (
                        <img
                          src={p.primaryImageUrl}
                          alt={p.article || p.name}
                          className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                          <ShoppingBag className="w-9 h-9 stroke-[1.5]" />
                        </div>
                      )}

                      {/* Stock status badge overlay */}
                      <div className="absolute top-2 right-2">
                        {isOutOfStock ? (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-rose-600 text-white shadow-xs uppercase tracking-wider">
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-amber-500 text-white shadow-xs uppercase tracking-wider">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-600/90 text-white shadow-xs">
                            In Stock
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Article */}
                    <div className="w-full mt-2.5 text-left">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight truncate" title={p.article || p.name}>
                        {p.article || p.name}
                      </h3>
                      {p.name && p.article && p.name.toUpperCase() !== p.article.toUpperCase() ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {p.name}
                        </p>
                      ) : null}
                    </div>

                    {/* Barcode Graphic & Click to Print */}
                    <div
                      onClick={() => handleOpenBarcodeTool(p)}
                      className="w-full mt-2 p-1.5 rounded-lg bg-slate-50 hover:bg-purple-50 dark:bg-[#0E1628] dark:hover:bg-purple-950/40 border border-slate-200/80 dark:border-slate-800 transition cursor-pointer flex flex-col items-center group/barcode"
                      title={`Click to open barcode label printer for ${p.article || p.barcode}`}
                    >
                      <BarcodeSvg
                        value={p.barcode}
                        width={1.0}
                        height={20}
                        displayValue={false}
                        lineColor={isDark ? '#FFFFFF' : '#000000'}
                      />
                      <span className="font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200 group-hover/barcode:text-purple-600 dark:group-hover/barcode:text-purple-300 mt-0.5 tracking-wider">
                        {p.barcode}
                      </span>
                    </div>
                  </div>

                  {/* Pricing Section */}
                  <div className="px-3 py-2 bg-slate-50/70 dark:bg-[#0B1120] border-t border-b border-slate-100 dark:border-slate-800/80">
                    {isWholesaleStore ? (
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Wholesale</span>
                          <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
                            {currencySymbol} {formatStockPrice(p.sellingPrice ?? p.maxPrice)}
                            <span className="text-[10px] text-slate-400 font-normal">/pr</span>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-purple-600 dark:text-purple-300 font-bold block">
                            {p.pairsPerCarton || 12} prs lot
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            Cost: {currencySymbol} {formatStockPrice(p.costPrice)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                            {isFixedPolicy ? 'Fixed Retail' : 'Max Retail'}
                          </span>
                          <span className="font-mono font-black text-purple-600 dark:text-purple-400 text-sm">
                            {currencySymbol} {formatStockPrice(retailPrice)}
                          </span>
                        </div>
                        <div className="text-right font-mono text-[10px]">
                          {!isFixedPolicy && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold block">
                              Min: {currencySymbol} {formatStockPrice(minFloor)}
                            </span>
                          )}
                          <span className="text-slate-400">
                            Cost: {currencySymbol} {formatStockPrice(p.costPrice ?? p.cost_price)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Total Stock / Inline Edit Section */}
                  <div className="p-3 pt-2">
                    {editingStockId === p.id ? (
                      <div
                        className="flex flex-col items-center gap-1.5 p-1.5 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-300 dark:border-purple-700/70 shadow-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1 w-full justify-center">
                          <input
                            ref={inlineInputRef}
                            type="number"
                            min={0}
                            step={1}
                            value={inlineStockValue}
                            disabled={savingStockId === p.id}
                            onChange={(e) => {
                              setInlineStockValue(e.target.value);
                              setInlineStockError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveInlineStock(p);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelInlineEdit();
                              }
                            }}
                            className="w-20 px-2 py-1 text-center font-mono font-bold text-xs rounded-lg border-2 border-purple-500 dark:border-purple-400 bg-white dark:bg-[#0A0E1A] text-slate-900 dark:text-white shadow-inner focus:outline-none focus:ring-2 focus:ring-purple-400"
                            placeholder="Pairs"
                            autoFocus
                          />
                          <button
                            type="button"
                            disabled={savingStockId === p.id}
                            onClick={() => handleSaveInlineStock(p)}
                            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition cursor-pointer shadow-xs disabled:opacity-50"
                            title="Save stock quantity (Enter)"
                          >
                            {savingStockId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={savingStockId === p.id}
                            onClick={handleCancelInlineEdit}
                            className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {inlineStockError ? (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold px-1 text-center">
                            {inlineStockError}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                            Press ↵ to save • Esc
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        {isStoreAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleStartInlineEdit(p)}
                            title={`Click to edit stock for ${p.article || p.name}`}
                            className={`group/btn flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                              justUpdatedStockId === p.id
                                ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500'
                                : isOutOfStock
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : isLowStock
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-slate-100 hover:bg-purple-50 dark:bg-slate-800 dark:hover:bg-purple-950/40 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <span>{p.totalStock} Pairs</span>
                            <Edit2 className="w-3 h-3 text-purple-600 dark:text-purple-400 opacity-60 group-hover/btn:opacity-100" />
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {p.totalStock} Pairs
                          </span>
                        )}
                        {isWholesaleStore && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {Math.floor(p.totalStock / (p.pairsPerCarton || 12))} Lots
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className="p-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {/* Barcode Price Tag Button */}
                      <button
                        type="button"
                        id={`print-barcode-${p.id}`}
                        title={`Print Barcode Price Tag for ${p.article || p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setStickerProduct(p);
                        }}
                        className="p-1.5 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-[#0E1628] hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white transition cursor-pointer"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                      </button>

                      {/* Side-End Label Button */}
                      {!isWholesaleStore && (
                        <button
                          type="button"
                          id={`side-end-label-${p.id}`}
                          title="Print Side-End Box Label"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSideEndLabelProduct(p);
                          }}
                          className="p-1.5 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-[#0E1628] text-purple-700 dark:text-purple-400 hover:bg-purple-600 hover:text-white transition cursor-pointer"
                        >
                          <Box className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Adjust Stock"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdjustingProduct(p);
                          }}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-[#0E1628] hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit Product"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProduct(p);
                            setIsFormModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg border border-purple-200 dark:border-purple-400/40 bg-purple-50 dark:bg-purple-500/20 hover:bg-purple-600 text-purple-600 dark:text-purple-200 hover:text-white transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete Product"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProduct(p);
                          }}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-[#0E1628] hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show More Pagination for Grid View */}
          {products.length > visibleCount && (
            <div className="p-3 text-center bg-slate-50/70 dark:bg-[#0B1120] rounded-2xl border border-slate-200 dark:border-purple-900/50">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 25)}
                className="px-5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/40 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-bold text-xs border border-purple-200 dark:border-purple-700/60 transition cursor-pointer active:scale-95 shadow-xs"
              >
                Show More ({products.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </motion.div>
      ) : (
        /* Table View */
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="app-card overflow-hidden transition-colors dark:border-purple-800/60"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-700 dark:text-white font-bold border-b border-slate-200 dark:border-purple-800/80 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={products.length > 0 && selectedProductIds.length === products.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProductIds(products.map((p) => p.id));
                        else setSelectedProductIds([]);
                      }}
                      className="rounded border-slate-300 dark:border-purple-600 dark:bg-[#0E1628] text-blue-600 focus:ring-0 cursor-pointer"
                      title="Select all products"
                    />
                  </th>
                  <th className="py-3.5 px-4 w-14">Image</th>
                  <th className="py-3.5 px-4">Article &amp; Identifiers</th>
                  <th className="py-3.5 px-3">Brand &amp; Category</th>
                  <th className="py-3.5 px-4">Barcode (Click to Print)</th>
                  <th className="py-3.5 px-3 text-right" title="Product cost price and saved selling price according to pricing policy">Pricing &amp; Cost</th>
                  <th className="py-3.5 px-3 text-center" title={isStoreAdmin ? "Click any stock quantity in the table below to edit directly" : "Total inventory stock"}>
                    <div className="flex flex-col items-center justify-center">
                      <span>Total Stock</span>
                      {isStoreAdmin && (
                        <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-300 tracking-normal flex items-center gap-1 mt-0.5 normal-case">
                          <Edit2 className="w-2.5 h-2.5 inline" /> Click to edit
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {products.slice(0, visibleCount).map((p) => {
                  const isLowStock = p.totalStock <= p.lowStockLimit;
                  const isOutOfStock = p.totalStock <= 0;
                  const isChecked = selectedProductIds.includes(p.id);
                  const isUnbranded = !p.brandName || ['unbranded', 'local'].includes(p.brandName.trim().toLowerCase());

                  return (
                    <tr
                      key={p.id}
                      className={`table-row-hover border-b border-slate-100 dark:border-slate-800/80 ${
                        isChecked ? 'bg-blue-50/70 dark:bg-blue-600/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedProductIds(selectedProductIds.filter((id) => id !== p.id));
                            } else {
                              setSelectedProductIds([...selectedProductIds, p.id]);
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-600 dark:bg-[#0E1628] text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Image */}
                      <td className="py-3.5 px-4">
                        {p.primaryImageUrl ? (
                          <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] overflow-hidden flex items-center justify-center shrink-0 p-0.5 shadow-2xs">
                            <img
                              src={p.primaryImageUrl}
                              alt={p.article || p.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] flex items-center justify-center text-slate-400 shrink-0">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                      </td>

                      {/* Article & Identifiers */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {p.article || p.name}
                        </div>
                        {p.name && p.article && p.name.toUpperCase() !== p.article.toUpperCase() ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] mt-0.5">
                            {p.name}
                          </div>
                        ) : null}
                      </td>

                      {/* Brand & Category Capsules (Pills) */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <BrandLogo
                            logo={p.brandLogo}
                            name={p.brandName || 'Unbranded'}
                            size="xs"
                          />
                          {isUnbranded ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 dark:bg-[#312E81]/60 text-indigo-700 dark:text-[#A5B4FC] border border-indigo-200 dark:border-[#6366F1]/40">
                              {p.brandName || 'Unbranded'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-50 dark:bg-[#1E3A8A]/50 text-blue-800 dark:text-[#93C5FD] border border-blue-200 dark:border-[#3B82F6]/40">
                              {p.brandName}
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-sky-50 dark:bg-[#0284C7]/20 text-sky-700 dark:text-[#38BDF8] border border-sky-200 dark:border-[#0284C7]/40">
                            {p.categoryName || 'General'}
                          </span>
                        </div>
                      </td>

                      {/* Barcode graphic & text */}
                      <td className="py-3.5 px-4">
                        <div
                          onClick={() => handleOpenBarcodeTool(p)}
                          className="flex flex-col items-start cursor-pointer group"
                          title={`Click to generate & print barcode labels for ${p.article || p.barcode}`}
                        >
                          <div className="group-hover:opacity-85 transition">
                            <BarcodeSvg
                              value={p.barcode}
                              width={1.0}
                              height={22}
                              displayValue={false}
                              lineColor={isDark ? '#FFFFFF' : '#000000'}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-300 mt-0.5 tracking-wider flex items-center space-x-1">
                            <span>{p.barcode}</span>
                          </span>
                        </div>
                      </td>

                      {/* Cost Price & Selling Price */}
                      <td className="py-3.5 px-3 text-right">
                        {isWholesaleStore ? (
                          <div className="flex flex-col items-end space-y-0.5">
                            <div className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs">
                              {currencySymbol} {formatStockPrice(p.sellingPrice ?? p.maxPrice)}
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-0.5">/pair</span>
                            </div>
                            <div className="font-mono font-bold text-purple-600 dark:text-purple-400 text-[10px]">
                              {p.pairsPerCarton || 12} Pairs Lot
                            </div>
                            {(() => {
                              const isHalf = isHalfCartonAllowed(p, companySettings);
                              const lot = Number(p.pairsPerCarton || 12) === 16 ? 16 : 12;
                              const minQty = p.minSaleQuantity ?? (isHalf ? lot / 2 : lot);
                              return (
                                <div className="font-mono text-[9px] text-indigo-600 dark:text-indigo-400">
                                  Min: {minQty} prs ({isHalf ? '0.5 ctn' : '1 ctn'})
                                </div>
                              );
                            })()}
                            <div className="font-mono text-slate-500 dark:text-slate-400 text-[10px]">
                              {currencySymbol} {formatStockPrice(p.costPrice)} cost
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                              {currencySymbol} {formatStockPrice(p.costPrice ?? p.cost_price)}
                              <span className="text-[10px] text-slate-400 font-normal ml-1">cost</span>
                            </div>
                            {(() => {
                              const retailPrice = getProductRetailPrice(p, companySettings);
                              const minFloor = getProductMinFloorPrice(p, companySettings);

                              return isFixedPolicy ? (
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 uppercase">
                                    Fixed
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400">
                                    {currencySymbol} {formatStockPrice(retailPrice)}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end mt-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 uppercase">
                                      Max
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                      {currencySymbol} {formatStockPrice(retailPrice)}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                                    Min: {currencySymbol} {formatStockPrice(minFloor)}
                                  </span>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </td>

                      {/* Total Stock */}
                      <td className="py-3.5 px-3 text-center">
                        {editingStockId === p.id ? (
                          <div
                            className="flex flex-col items-center gap-1.5 py-1 px-1 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-300 dark:border-purple-700/70 shadow-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1">
                              <input
                                ref={inlineInputRef}
                                type="number"
                                min={0}
                                step={1}
                                value={inlineStockValue}
                                disabled={savingStockId === p.id}
                                onChange={(e) => {
                                  setInlineStockValue(e.target.value);
                                  setInlineStockError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveInlineStock(p);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelInlineEdit();
                                  }
                                }}
                                className="w-20 sm:w-24 px-2 py-1 text-center font-mono font-bold text-xs sm:text-sm rounded-lg border-2 border-purple-500 dark:border-purple-400 bg-white dark:bg-[#0A0E1A] text-slate-900 dark:text-white shadow-inner focus:outline-none focus:ring-2 focus:ring-purple-400"
                                placeholder="Pairs"
                                autoFocus
                              />
                              <button
                                type="button"
                                disabled={savingStockId === p.id}
                                onClick={() => handleSaveInlineStock(p)}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition cursor-pointer shadow-xs disabled:opacity-50"
                                title="Save stock quantity (Enter)"
                              >
                                {savingStockId === p.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={savingStockId === p.id}
                                onClick={handleCancelInlineEdit}
                                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95"
                                title="Cancel (Esc)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {inlineStockError ? (
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold px-1">
                                {inlineStockError}
                              </span>
                            ) : isWholesaleStore ? (
                              <span className="text-[10px] text-purple-700 dark:text-purple-300 font-mono font-semibold">
                                ={Math.floor((parseInt(inlineStockValue, 10) || 0) / (p.pairsPerCarton || 12))} lots ({p.pairsPerCarton || 12} prs/ctn)
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                                Press ↵ to save • Esc to cancel
                              </span>
                            )}
                          </div>
                        ) : isWholesaleStore ? (
                          <div className="flex flex-col items-center">
                            {isStoreAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleStartInlineEdit(p)}
                                title={`Click to edit stock for ${p.article || p.name} (Current: ${p.totalStock} pairs)`}
                                className={`group/stock relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-2xs ${
                                  justUpdatedStockId === p.id
                                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-2 border-emerald-500 ring-4 ring-emerald-400/30'
                                    : isOutOfStock
                                    ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700/80 hover:ring-2 hover:ring-rose-400/40'
                                    : isLowStock
                                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 hover:ring-2 hover:ring-amber-400/40'
                                    : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 hover:ring-2 hover:ring-emerald-400/40'
                                }`}
                              >
                                <span>{p.totalStock} Pairs</span>
                                <Edit2 className="w-3 h-3 text-purple-600 dark:text-purple-400 opacity-60 group-hover/stock:opacity-100 group-hover/stock:scale-110 transition shrink-0" />
                              </button>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  isOutOfStock
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                    : isLowStock
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                }`}
                              >
                                {p.totalStock} Pairs
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                              ({Math.floor(p.totalStock / (p.pairsPerCarton || 12))} Lots)
                            </span>
                            {isLowStock && !isOutOfStock && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                                Low stock (≤{Math.max(1, Math.round(p.lowStockLimit / (p.pairsPerCarton || 12)))} ctn / ≤{p.lowStockLimit} prs)
                              </div>
                            )}
                            {isOutOfStock && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                                OUT OF STOCK
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            {isStoreAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleStartInlineEdit(p)}
                                title={`Click to edit stock for ${p.article || p.name} (Current: ${p.totalStock} pairs)`}
                                className={`group/stock relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-2xs ${
                                  justUpdatedStockId === p.id
                                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-2 border-emerald-500 ring-4 ring-emerald-400/30'
                                    : isOutOfStock
                                    ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700/80 hover:ring-2 hover:ring-rose-400/40'
                                    : isLowStock
                                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 hover:ring-2 hover:ring-amber-400/40'
                                    : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 hover:ring-2 hover:ring-emerald-400/40'
                                }`}
                              >
                                <span>{p.totalStock} pairs</span>
                                <Edit2 className="w-3 h-3 text-purple-600 dark:text-purple-400 opacity-60 group-hover/stock:opacity-100 group-hover/stock:scale-110 transition shrink-0" />
                              </button>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  isOutOfStock
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                    : isLowStock
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                }`}
                              >
                                {p.totalStock} pairs
                              </span>
                            )}
                            {isLowStock && !isOutOfStock && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                                Low stock (≤{p.lowStockLimit})
                              </div>
                            )}
                            {isOutOfStock && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                                OUT OF STOCK
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* 1. Barcode Price Tag Button (Thermal Roll) */}
                          <button
                            type="button"
                            id={`print-barcode-${p.id}`}
                            title={`Print Barcode Price Tag for ${p.article || p.name} (Stock: ${p.totalStock} pairs) - Thermal Roll`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStickerProduct(p);
                            }}
                            className="p-1.5 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/80 dark:bg-[#0E1628] hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white dark:hover:text-white transition-all shadow-2xs group relative cursor-pointer"
                            aria-label={`Print Barcode Price Tag for ${p.article || p.name}`}
                          >
                            <Barcode className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                          </button>

                          {/* Side-End Labels are available only for retail stores. */}
                          {!isWholesaleStore && (
                            <button
                              type="button"
                              id={`side-end-label-${p.id}`}
                              title="Print high-visibility 3x4 inch shoe box side-end label for rack storage"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSideEndLabelProduct(p);
                              }}
                              className="px-2 py-1.5 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-[#0E1628] text-purple-700 dark:text-purple-400 hover:bg-purple-600 dark:hover:bg-purple-600 hover:text-white dark:hover:text-white transition-all shadow-2xs group relative cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              aria-label={`Print Side-End Box Label for ${p.article || p.name}`}
                            >
                              <Box className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                              <span className="hidden xl:inline">Side-End</span>
                            </button>
                          )}

                          {/* Admin Only Actions */}
                          {isAdmin && (
                            <>
                              {/* Stock Adjust */}
                              <button
                                type="button"
                                title="Adjust Stock (Audit ledger)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdjustingProduct(p);
                                }}
                                className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-[#0E1628] hover:bg-rose-600 dark:hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white dark:hover:text-white transition-all cursor-pointer"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit */}
                              <button
                                type="button"
                                title="Edit Product"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct(p);
                                  setIsFormModalOpen(true);
                                }}
                                className="p-1.5 rounded-xl border border-purple-200 dark:border-purple-400/40 bg-purple-50 dark:bg-purple-500/20 hover:bg-purple-600 dark:hover:bg-purple-500/30 text-purple-600 dark:text-purple-200 hover:text-white dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition-all cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                title="Delete / Deactivate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProduct(p);
                                }}
                                className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-[#0E1628] hover:bg-rose-600 dark:hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white dark:hover:text-white transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Show More Pagination for Table View */}
          {products.length > visibleCount && (
            <div className="p-3 text-center bg-slate-50/70 dark:bg-[#0B1120] border-t border-slate-200 dark:border-purple-900/50">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 25)}
                className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/40 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-bold text-xs border border-purple-200 dark:border-purple-700/60 transition cursor-pointer active:scale-95 shadow-xs"
              >
                Show More ({products.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {isBarcodeToolOpen && (
          <BarcodeGeneratorTool
            products={products}
            initialSelectedProduct={barcodeToolProduct}
            companySettings={companySettings}
            onClose={() => {
              setIsBarcodeToolOpen(false);
              setBarcodeToolProduct(null);
            }}
            onRefreshProducts={loadProducts}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormModalOpen && (
          <ProductFormModal
            product={editingProduct}
            companySettings={companySettings}
            onClose={() => {
              setIsFormModalOpen(false);
              setEditingProduct(null);
            }}
            onSuccess={loadProducts}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stickerProduct && (
          <BarcodeStickerModal
            product={stickerProduct}
            companySettings={companySettings}
            onClose={() => setStickerProduct(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sideEndLabelProduct && !isWholesaleStore && (
          <SideEndBoxLabelModal
            product={sideEndLabelProduct}
            companySettings={companySettings}
            onClose={() => setSideEndLabelProduct(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adjustingProduct && (
          <StockAdjustModal
            product={adjustingProduct}
            onClose={() => setAdjustingProduct(null)}
            onSuccess={loadProducts}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCsvImportOpen && (
          <CsvImportModal
            companySettings={companySettings}
            existingProducts={products}
            onClose={() => setIsCsvImportOpen(false)}
            onImportSuccess={(summaryMsg) => {
              setImportToastMessage(summaryMsg);
              loadProducts();
              loadFilterData();
              setTimeout(() => {
                setImportToastMessage((prev) => (prev === summaryMsg ? null : prev));
              }, 7000);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

