import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Barcode, CheckCircle2, AlertCircle, Package, ArrowRight, ArrowLeft, Scan, Tag, DollarSign, Check, Info, TrendingUp, Building2, Boxes, RefreshCw, Box, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api } from '../../services/api.ts';
import { SideEndBoxLabelModal } from './SideEndBoxLabelModal.tsx';
import { BarcodeStickerModal } from './BarcodeStickerModal.tsx';

import { generateCode128Barcode, analyzeBarcode } from '../../utils/barcode.ts';
import { parseBrandPrefix, parseCategoryPrefix, generateSuggestedArticle, STANDARD_FOOTWEAR_CATEGORIES, normalizeFootwearCategory } from '../../utils/footwear.ts';
import { BarcodeSvg } from '../common/BarcodeSvg.tsx';
import { cleanStockPriceInput, formatStockPrice } from '../../utils/priceFormat.ts';
import { validateAndNormalizeProductPricing, PricingMode, calculateLowStockPairs, extractCartonThreshold } from '../../schemas/productSchema.ts';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { toTitleCaseLive, toTitleCaseTrimmed } from '../../utils/textFormat.ts';
import type { ProductFormValues } from '../../types.ts';

interface ProductFormModalProps {
  product?: any | null; // If null, adding new product
  currentUser?: any;
  companySettings: any;
  onClose: () => void;
  onSuccess: (savedProduct?: any) => void;
}

type WizardStep = 1 | 2 | 3;

interface BarcodeValidationState {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  standard?: string;
  standardLabel?: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  suggestedFix?: string;
  isDuplicate?: boolean;
  existingProduct?: any;
  message?: string;
  error?: string;
}

interface ArticleValidationState {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  isDuplicate?: boolean;
  duplicateField?: 'article';
  articleError?: string;
  existingProduct?: any;
  message?: string;
  error?: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  product,
  companySettings,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [categories, setCategories] = useState<string[]>(STANDARD_FOOTWEAR_CATEGORIES);
  const [liveSettings, setLiveSettings] = useState<any>(companySettings);

  useEffect(() => {
    if (companySettings) {
      setLiveSettings(companySettings);
    }
  }, [companySettings]);

  const effectiveSettings = liveSettings || companySettings || {};

  // Step 1: Product Classification State (Stored directly as plain text string fields)
  const [brand, setBrand] = useState<string>(product?.brand || product?.brandName || '');
  const [category, setCategory] = useState<string>(() =>
    normalizeFootwearCategory(product?.category || product?.categoryName || 'Men')
  );
  const [nextProductId, setNextProductId] = useState<number>(
    product?.tenantProductNo || product?.tenant_product_no || product?.id || 1
  );
  const effectiveProductId =
    product?.tenantProductNo || product?.tenant_product_no || product?.id || nextProductId;

  // Step 2 & 3: Article (auto-suggested from classification)
  const [article, setArticle] = useState<string>(product?.article || '');
  const [isArticleManuallyEdited, setIsArticleManuallyEdited] = useState<boolean>(Boolean(product?.article));
  const [articleValidation, setArticleValidation] = useState<ArticleValidationState>({ status: 'idle' });
  const [isSideEndLabelOpen, setIsSideEndLabelOpen] = useState(false);
  const [isBarcodeStickerOpen, setIsBarcodeStickerOpen] = useState(false);

  // Business Type & Wholesale Configuration
  const isWholesaleStore =
    String(effectiveSettings?.businessType || effectiveSettings?.business_type || '').toUpperCase() === 'WHOLESALE';

  // Store-wide half-carton permission
  // Determination: Half-cartons are allowed if either the store setting is enabled
  // (company_setting.allow_half_carton == true) OR the specific product override is enabled
  // (product.allow_half_carton == true).
  const storeAllowsHalfCarton =
    effectiveSettings?.allow_half_carton === true ||
    effectiveSettings?.allowHalfCarton === true;

  // Item-level "Allow Half Carton (0.5)" setting: defaults to store setting or product's saved preference
  const [allowHalfCarton, setAllowHalfCarton] = useState<boolean>(() => {
    if (product) {
      if (product.allowHalfCarton !== undefined) return Boolean(product.allowHalfCarton);
      if (product.allow_half_carton !== undefined) return Boolean(product.allow_half_carton);
      return storeAllowsHalfCarton;
    }
    return storeAllowsHalfCarton;
  });

  // Determination: Product-level setting is the explicit rule for this product
  const isFractionalAllowed = allowHalfCarton;

  const [pairsPerCarton, setPairsPerCarton] = useState<number>(() => {
    const raw =
      product?.pairsPerCarton ??
      product?.pairs_per_carton;
    return Number(raw) === 16 ? 16 : 12;
  });

  // Inventory & Product info
  const [productName, setProductName] = useState<string>(product?.name || '');
  const [lotSize, setLotSize] = useState<12 | 16>(() =>
    Number(product?.pairsPerCarton ?? product?.pairs_per_carton) === 16 ? 16 : 12
  );
  const [totalStock, setTotalStock] = useState<number | ''>(() => {
    if (product?.totalStock !== undefined) return product.totalStock;
    if (isWholesaleStore) {
      const raw =
        product?.pairsPerCarton ??
        product?.pairs_per_carton;
      const size = Number(raw) === 16 ? 16 : 12;
      return isFractionalAllowed ? (size / 2) : size;
    }
    return 0;
  });

  // Store-type-aware low stock threshold state:
  // Wholesale: Number of cartons (converted to pairs on save: cartons × pairs_per_carton)
  // Retail: Number of individual pairs
  const [lowStockThreshold, setLowStockThreshold] = useState<number | ''>(() => {
    const rawStored =
      product?.lowStockLimit ??
      product?.low_stock_limit ??
      product?.lowStockAlert ??
      product?.low_stock_alert;

    if (isWholesaleStore) {
      const cartonSize = Number(product?.pairsPerCarton ?? product?.pairs_per_carton) === 16 ? 16 : 12;
      return extractCartonThreshold(rawStored, cartonSize);
    }
    return rawStored !== undefined && rawStored !== null && Number(rawStored) > 0 ? Number(rawStored) : 5;
  });

  const effectiveCartonSize = isWholesaleStore ? (pairsPerCarton === 16 ? 16 : 12) : lotSize;
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string>(product?.primaryImageUrl || '');

  // AI Vision Suggestor State (strictly for retail stores only)
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    title?: string;
    category?: string;
    brand?: string;
    shoeType?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleRunAiImageAnalysis = async (imageDataUrl: string) => {
    if (isWholesaleStore || !imageDataUrl) return;
    setIsAiAnalyzing(true);
    setAiError(null);
    try {
      const res = await api.products.aiSuggestFromImage(imageDataUrl);
      if (res && res.success) {
        setAiSuggestions({
          title: res.title || '',
          category: res.category ? normalizeFootwearCategory(res.category) : undefined,
          brand: res.brand ? toTitleCaseLive(res.brand) : 'Unbranded',
          shoeType: res.shoeType || '',
        });
      } else {
        setAiError(res?.error || 'Could not detect product attributes from image.');
      }
    } catch (err: any) {
      setAiError(err.message || 'AI image suggestion failed. You can enter details manually.');
    } finally {
      setIsAiAnalyzing(false);
    }
  };


  const handleProductImageUpload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 800;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          setErrorMessage('Unable to process this image. Please try another file.');
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setPrimaryImageUrl(resizedDataUrl);
        setErrorMessage('');
        if (!isWholesaleStore) {
          handleRunAiImageAnalysis(resizedDataUrl);
        }
      };
      image.onerror = () => setErrorMessage('Unable to read this image. Please try another file.');
      image.src = String(reader.result || '');
    };
    reader.onerror = () => setErrorMessage('Unable to read this image. Please try another file.');
    reader.readAsDataURL(file);
  };
  const description = product?.description || '';

  const handleLotSizeChange = (newSize: 12 | 16) => {
    const previousLotSize = lotSize;
    setLotSize(newSize);
    if (totalStock === '' || totalStock === 0 || totalStock === previousLotSize) {
      setTotalStock(newSize);
    }
  };

  const handlePairsPerCartonChange = (newPairs: number) => {
    const safePairs = newPairs === 16 ? 16 : 12;
    setPairsPerCarton(safePairs);
    if (!product || totalStock === 6 || totalStock === 8 || totalStock === 12 || totalStock === 16) {
      setTotalStock(isFractionalAllowed ? (safePairs / 2) : safePairs);
    }
  };

  // Step 2: Pricing Specifications State (Integer values only, no decimals)
  // Uses global locked pricing policy configured in Installation Wizard / Settings
  const pricingMode: PricingMode = (
    String(effectiveSettings?.pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE'
      ? 'NEGOTIABLE'
      : 'FIXED'
  );

  const parseInitialPrice = (val: any): number | '' => {
    if (val !== undefined && val !== null && val !== '') {
      const num = parseInt(cleanStockPriceInput(val), 10);
      return !isNaN(num) && num >= 0 ? num : '';
    }
    return '';
  };

  // Cost Price (mandatory for both Retail and Wholesale)
  const [costPrice, setCostPrice] = useState<number | ''>(() =>
    parseInitialPrice(product?.costPrice ?? product?.cost_price)
  );

  // Min Selling Price (used for NEGOTIABLE policy)
  const [minPrice, setMinPrice] = useState<number | ''>(() =>
    parseInitialPrice(
      product?.minPrice ??
      product?.min_price ??
      product?.minSalePrice ??
      product?.min_sale_price ??
      product?.sellingPrice ??
      product?.selling_price
    )
  );

  // Max Selling Price (used for NEGOTIABLE policy or fixed retail price)
  const [maxPrice, setMaxPrice] = useState<number | ''>(() =>
    parseInitialPrice(
      product?.maxPrice ??
      product?.max_price ??
      product?.maxSalePrice ??
      product?.max_sale_price ??
      product?.sellingPrice ??
      product?.selling_price
    )
  );

  // Wholesale is fixed: the single tag price is stored in min_price and max_price.
  const handleWholesaleRateChange = (valStr: string) => {
    setErrorMessage(null);
    const cleaned = cleanStockPriceInput(valStr);
    if (cleaned === '') {
      setMaxPrice('');
      setMinPrice('');
      return;
    }
    const num = parseInt(cleaned, 10);
    if (!isNaN(num)) {
      setMaxPrice(num);
      setMinPrice(num);
    }
  };

  const [pricingFieldErrors, setPricingFieldErrors] = useState<Record<string, string>>({});

  // Step 3: Barcode (Fully editable for imported / external manufacturer box barcodes or store Code-128)
  const [barcode, setBarcode] = useState<string>(product?.barcode || '');
  const [isBarcodeManuallyEdited, setIsBarcodeManuallyEdited] = useState<boolean>(Boolean(product?.barcode));
  const [barcodeValidation, setBarcodeValidation] = useState<BarcodeValidationState>({ status: 'idle' });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencySymbol = effectiveSettings?.currency_symbol || effectiveSettings?.currencySymbol || 'Rs.';
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const articleInputRef = useRef<HTMLInputElement | null>(null);

  // Cost and price integer values
  const costVal = typeof costPrice === 'number' && !isNaN(costPrice) ? Math.max(0, Math.round(costPrice)) : 0;
  const fixedPriceVal = typeof maxPrice === 'number' && !isNaN(maxPrice) ? Math.max(0, Math.round(maxPrice)) : 0;
  const negotiableMinVal = typeof minPrice === 'number' && !isNaN(minPrice) ? Math.max(0, Math.round(minPrice)) : 0;
  const negotiableMaxVal = typeof maxPrice === 'number' && !isNaN(maxPrice) ? Math.max(0, Math.round(maxPrice)) : 0;

  const handleIntegerPriceInput = (
    rawVal: string,
    setter: React.Dispatch<React.SetStateAction<number | ''>>,
    fieldKey: string
  ) => {
    setErrorMessage(null);
    setPricingFieldErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    const cleaned = cleanStockPriceInput(rawVal);
    if (cleaned === '') {
      setter('');
      return;
    }
    const num = parseInt(cleaned, 10);
    setter(!isNaN(num) ? num : '');
  };

  // Derived current brand and category details
  const currentBrandName = brand.trim() || 'Unbranded';
  const currentBrandPrefix = parseBrandPrefix(currentBrandName);

  const currentCategoryName = category.trim() || 'Men';
  const currentCategoryPrefix = parseCategoryPrefix(currentCategoryName);

  // Helper to recompute article and default Code-128 barcode based on classification
  const updateClassificationCodes = (
    targetBrand = brand,
    targetCat = category,
    pId = effectiveProductId,
    forceResetArticle = false
  ) => {
    const catPfx = parseCategoryPrefix(targetCat || 'Men');

    const storeStandardArticle = generateSuggestedArticle(catPfx, pId);
    const designedArticle =
      !forceResetArticle && isArticleManuallyEdited && article.trim()
        ? article.trim().toUpperCase()
        : storeStandardArticle;

    setArticle(designedArticle);
    if (!isBarcodeManuallyEdited && !product) {
      const designedBarcode = generateCode128Barcode(pId, catPfx).barcode;
      setBarcode(designedBarcode);
    }
    if (!productName || productName.toUpperCase() === article.toUpperCase()) {
      setProductName(designedArticle);
    }
  };

  const handleBrandChange = (newBrand: string) => {
    const formatted = toTitleCaseLive(newBrand);
    setBrand(formatted);
    updateClassificationCodes(formatted, category, effectiveProductId);
  };

  const handleCategoryChange = (newCat: string) => {
    const formatted = normalizeFootwearCategory(newCat);
    setCategory(formatted);
    updateClassificationCodes(brand, formatted, effectiveProductId);
  };

  const handleApplyAllAiSuggestions = () => {
    if (!aiSuggestions || isWholesaleStore) return;
    if (aiSuggestions.title) {
      setProductName(aiSuggestions.title);
    }
    if (aiSuggestions.brand) {
      handleBrandChange(aiSuggestions.brand);
    }
    if (aiSuggestions.category) {
      handleCategoryChange(aiSuggestions.category);
    }
  };

  const handleApplySingleAiSuggestion = (field: 'title' | 'brand' | 'category') => {
    if (!aiSuggestions || isWholesaleStore) return;
    if (field === 'title' && aiSuggestions.title) {
      setProductName(aiSuggestions.title);
    } else if (field === 'brand' && aiSuggestions.brand) {
      handleBrandChange(aiSuggestions.brand);
    } else if (field === 'category' && aiSuggestions.category) {
      handleCategoryChange(aiSuggestions.category);
    }
  };

  const handleArticleChange = (rawVal: string) => {
    // Strictly update ONLY Article; never alter Barcode or Product ID
    const nextArticle = rawVal.toUpperCase();
    setIsArticleManuallyEdited(true);
    setArticle(nextArticle);
  };

  const handleResetStoreArticle = async () => {
    setErrorMessage(null);
    setIsArticleManuallyEdited(false);
    const catPfx = currentCategoryPrefix || 'MN';
    const fallbackArticle = generateSuggestedArticle(catPfx, effectiveProductId);
    setArticle(fallbackArticle);
    try {
      const suggested = await api.products.suggestArticle({
        brand: currentBrandName,
        category: currentCategoryName,
        productId: effectiveProductId,
        excludeId: product?.id,
      });
      if (suggested?.suggestedArticle) {
        setArticle(String(suggested.suggestedArticle).toUpperCase());
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;

    async function initializeModal() {
      try {
        // Fetch latest company settings from server so Default Fixed Profit Amount & Margins are always up-to-date
        try {
          const freshSettingsRes = await api.settings.get();
          if (freshSettingsRes?.settings && isMounted) {
            setLiveSettings(freshSettingsRes.settings);
            try {
              localStorage.setItem('cached_company_settings', JSON.stringify(freshSettingsRes.settings));
            } catch {}
          }
        } catch (_) {}

        let currentId =
          product?.tenantProductNo || product?.tenant_product_no || product?.id || 1;

        // Fetch next product sequence ID if adding new product
        if (!product) {
          try {
            const nextIdRes = await api.products.getNextId();
            if (nextIdRes?.nextProductId) {
              currentId = nextIdRes.nextProductId;
              if (isMounted) setNextProductId(currentId);
            }
          } catch (e) {
            console.error('Failed to fetch next product ID:', e);
          }
        }

        // Fetch fixed pre-saved categories from store
        try {
          const cRes = await api.categories.getCategories();
          const rawCatList = (cRes?.categories || [])
            .map((c: any) => normalizeFootwearCategory(typeof c === 'string' ? c : c.name))
            .filter(Boolean);
          const mergedCategories = Array.from(new Set([...STANDARD_FOOTWEAR_CATEGORIES, ...rawCatList]));

          if (isMounted) {
            setCategories(mergedCategories);
          }
        } catch (e) {
          console.warn('Could not load category suggestions:', e);
          if (isMounted) {
            setCategories(STANDARD_FOOTWEAR_CATEGORIES);
          }
        }

        if (!product && isMounted) {
          updateClassificationCodes(brand || 'Unbranded', category || 'Men', currentId);

          // Pre-fill store-unique Article and Code-128 Barcode for this tenant store
          try {
            const [articleRes, barcodeRes] = await Promise.all([
              api.products
                .suggestArticle({
                  brand: brand || 'Unbranded',
                  category: category || 'Men',
                  productId: currentId,
                })
                .catch(() => null),
              api.products
                .generateBarcode({
                  productId: currentId,
                  category: category || 'Men',
                })
                .catch(() => null),
            ]);
            if (isMounted) {
              if (articleRes?.suggestedArticle) {
                setArticle(String(articleRes.suggestedArticle).toUpperCase());
                setProductName((prev) => prev || String(articleRes.suggestedArticle).toUpperCase());
              }
              if (barcodeRes?.barcode) {
                setBarcode(barcodeRes.barcode);
              }
            }
          } catch (err) {
            if (isMounted) {
              try {
                const gen = generateCode128Barcode(currentId, category || 'Men');
                setBarcode(gen.barcode);
              } catch (_) {}
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize product modal:', err);
      }
    }

    initializeModal();

    return () => {
      isMounted = false;
    };
  }, []);

  // Autofocus barcode input when navigating to step 3
  useEffect(() => {
    if (currentStep === 3) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 120);
    }
  }, [currentStep]);

  // Real-time Article Uniqueness Validation effect (strictly scoped to this store)
  useEffect(() => {
    const cleanArt = article.trim().toUpperCase();

    if (!cleanArt) {
      setArticleValidation({
        status: 'invalid',
        duplicateField: 'article',
        articleError: 'Article code is required for product identification and box labels.',
        error: 'Article code is required for product identification and box labels.',
      });
      return;
    }

    setArticleValidation({
      status: 'checking',
      message: 'Checking Article uniqueness in this store...',
    });

    const timer = setTimeout(async () => {
      try {
        const res = await api.products.validateArticle(cleanArt, product?.id);
        if (!res.valid) {
          setArticleValidation({
            status: 'invalid',
            isDuplicate: res.isDuplicate,
            duplicateField: res.duplicateField,
            articleError: res.articleError || (res.duplicateField === 'article' ? res.error : undefined),
            existingProduct: res.existingProduct,
            error: res.error || (res.duplicateField === 'article' ? 'Article code already exists in this store.' : 'Product code collision in this store.'),
          });
        } else {
          setArticleValidation({
            status: 'valid',
            message: res.message || 'Article verified unique in this store.',
          });
        }
      } catch {
        setArticleValidation({
          status: 'valid',
          message: 'Article format ready.',
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [article, product?.id]);

  // Real-time Barcode Validation effect (Format, Checksum, and DB Duplicate Check)
  useEffect(() => {
    const clean = barcode.trim();
    if (!clean) {
      setBarcodeValidation({ status: 'idle' });
      return;
    }

    // Step 1: Instant local format & checksum validation
    const local = analyzeBarcode(clean);
    if (!local.isValid) {
      setBarcodeValidation({
        status: 'invalid',
        standard: local.standard,
        standardLabel: local.standardLabel,
        expectedCheckDigit: local.expectedCheckDigit,
        actualCheckDigit: local.actualCheckDigit,
        suggestedFix: local.suggestedFix,
        error: local.error,
      });
      return;
    }

    // Step 2: Debounced server verification (checks duplicate in catalog)
    setBarcodeValidation({
      status: 'checking',
      standard: local.standard,
      standardLabel: local.standardLabel,
      suggestedFix: local.suggestedFix,
      message: 'Validating format & checking catalog uniqueness...',
    });

    const timer = setTimeout(async () => {
      try {
        const res = await api.products.validateBarcode(clean, product?.id);
        if (!res.valid) {
          setBarcodeValidation({
            status: 'invalid',
            isDuplicate: res.isDuplicate,
            standard: res.standard,
            standardLabel: res.standardLabel,
            expectedCheckDigit: res.expectedCheckDigit,
            actualCheckDigit: res.actualCheckDigit,
            existingProduct: res.existingProduct,
            suggestedFix: res.suggestedFix,
            error: res.error || 'Barcode validation failed.',
          });
        } else {
          setBarcodeValidation({
            status: 'valid',
            standard: res.standard,
            standardLabel: res.standardLabel,
            suggestedFix: res.suggestedFix,
            message: res.message || `${res.standardLabel || 'Barcode'} is valid and ready.`,
          });
        }
      } catch (err: any) {
        // If network issue, accept local validation if format is valid
        setBarcodeValidation({
          status: 'valid',
          standard: local.standard,
          standardLabel: local.standardLabel,
          message: `${local.standardLabel} format verified.`,
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [barcode, product?.id]);

  const handleGenerateStoreBarcode = async () => {
    try {
      setErrorMessage(null);
      setIsBarcodeManuallyEdited(false);
      const res = await api.products.generateBarcode({
        productId: effectiveProductId,
        category: currentCategoryName,
      });
      if (res?.barcode) {
        setBarcode(res.barcode);
      } else {
        const gen = generateCode128Barcode(effectiveProductId, currentCategoryPrefix);
        setBarcode(gen.barcode);
      }
    } catch (err: any) {
      try {
        const gen = generateCode128Barcode(effectiveProductId, currentCategoryPrefix);
        setBarcode(gen.barcode);
      } catch (e: any) {
        setErrorMessage('Could not generate store Code-128 barcode: ' + (err.message || 'Please check product details.'));
      }
    }
  };

  // STEP VALIDATION
  const validateStep1 = (): boolean => {
    setErrorMessage(null);
    if (!category || !category.trim()) {
      setErrorMessage('Please enter or select a Shoe Category.');
      return false;
    }
    if (totalStock === '' || Number(totalStock) < 0) {
      setErrorMessage('Total initial stock quantity must be 0 or greater.');
      return false;
    }
    if (isWholesaleStore) {
      if (pairsPerCarton !== 12 && pairsPerCarton !== 16) {
        setErrorMessage('Minimum pairs for wholesale lot size must be 12 or 16 pairs.');
        return false;
      }
      if (!isFractionalAllowed && typeof totalStock === 'number' && totalStock > 0 && totalStock % pairsPerCarton !== 0) {
        setErrorMessage(`Fractional / half cartons (0.5) are restricted for this product. Stock must be in full carton multiples (${pairsPerCarton} pairs per carton).`);
        return false;
      }
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    setErrorMessage(null);
    setPricingFieldErrors({});

    if (isWholesaleStore) {
      if (costPrice === '') {
        const msg = 'Cost Price per pair is required.';
        setPricingFieldErrors({ costPrice: msg });
        setErrorMessage(msg);
        return false;
      }
      if (maxPrice === '') {
        const msg = 'Wholesale Selling Rate per pair is required.';
        setPricingFieldErrors({ maxPrice: msg });
        setErrorMessage(msg);
        return false;
      }
      const costNum = Number(costPrice);
      const wholesaleNum = Number(maxPrice);
      if (wholesaleNum < costNum) {
        const msg = `Wholesale Selling Rate (${currencySymbol} ${wholesaleNum}) cannot be lower than Cost Price (${currencySymbol} ${costNum}).`;
        setPricingFieldErrors({ maxPrice: msg });
        setErrorMessage(msg);
        return false;
      }
      return true;
    }

    if (costPrice === '') {
      const msg = 'Cost Price is required.';
      setPricingFieldErrors({ costPrice: msg });
      setErrorMessage(msg);
      return false;
    }

    if (pricingMode === 'FIXED' && maxPrice === '') {
      const msg = 'Price is required for Fixed Price policy.';
      setPricingFieldErrors({ maxPrice: msg });
      setErrorMessage(msg);
      return false;
    }

    if (pricingMode === 'NEGOTIABLE') {
      const missingErrors: Record<string, string> = {};
      if (minPrice === '') {
        missingErrors.minPrice = 'Minimum Selling Price is required for Negotiable Price policy.';
      }
      if (maxPrice === '') {
        missingErrors.maxPrice = 'Maximum Selling Price is required for Negotiable Price policy.';
      }
      if (Object.keys(missingErrors).length > 0) {
        setPricingFieldErrors(missingErrors);
        setErrorMessage(Object.values(missingErrors)[0]);
        return false;
      }
    }

    const validation = validateAndNormalizeProductPricing({
      pricingMode,
      costPrice: Number(costPrice),
      minPrice: pricingMode === 'NEGOTIABLE' ? Number(minPrice) : undefined,
      maxPrice: Number(maxPrice),
    });

    if (!validation.success) {
      setPricingFieldErrors(validation.fieldErrors || {});
      setErrorMessage(validation.error || 'Please fix the pricing validation errors.');
      return false;
    }

    return true;
  };

  const validateStep3 = (): boolean => {
    setErrorMessage(null);
    if (!article.trim()) {
      setErrorMessage('Please enter an Article code/name, or click "Reset to Store Article".');
      articleInputRef.current?.focus();
      return false;
    }
    if (articleValidation.status === 'invalid') {
      if (articleValidation.duplicateField === 'article') {
        setErrorMessage(articleValidation.error || 'Article already exists in this store.');
        articleInputRef.current?.focus();
        return false;
      }
    }
    const clean = barcode.trim();
    if (!clean) {
      setErrorMessage('Please enter or scan a barcode, or click "Reset to Store Code-128".');
      barcodeInputRef.current?.focus();
      return false;
    }
    const local = analyzeBarcode(clean);
    if (!local.isValid) {
      setErrorMessage(local.error || 'Barcode validation failed.');
      barcodeInputRef.current?.focus();
      return false;
    }
    if (barcodeValidation.status === 'invalid') {
      setErrorMessage(barcodeValidation.error || 'Barcode is invalid or already in use in this store.');
      barcodeInputRef.current?.focus();
      return false;
    }
    return true;
  };

  const goToNextStep = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (validateStep1()) setCurrentStep(2);
    } else if (currentStep === 2) {
      if (validateStep2()) setCurrentStep(3);
    }
  };

  const goToPrevStep = () => {
    setErrorMessage(null);
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  };

  // Explicit confirmation submit handler — forced stop, no auto-submission!
  const handleConfirmAndSave = async () => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }
    if (!validateStep3()) {
      return;
    }

    let finalCostToSave = 0;
    let finalMinToSave = 0;
    let finalMaxToSave = 0;
    if (isWholesaleStore) {
      finalCostToSave = Number(costPrice);
      finalMaxToSave = Number(maxPrice);
      finalMinToSave = finalMaxToSave;
    } else {
      const validation = validateAndNormalizeProductPricing({
        pricingMode,
        costPrice: Number(costPrice),
        minPrice: pricingMode === 'NEGOTIABLE' ? Number(minPrice) : undefined,
        maxPrice: Number(maxPrice),
      });

      if (!validation.success || !validation.data) {
        setCurrentStep(2);
        setPricingFieldErrors(validation.fieldErrors || {});
        setErrorMessage(validation.error || 'Pricing validation failed.');
        return;
      }
      finalCostToSave = validation.data.costPrice;
      finalMinToSave = validation.data.minPrice;
      finalMaxToSave = validation.data.maxPrice;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let cleanArticle = article.trim().toUpperCase();

      const finalBrand = toTitleCaseTrimmed(brand) || 'Unbranded';
      const finalCategory = normalizeFootwearCategory(category);

      // Ensure article is generated if not yet set
      if (!cleanArticle) {
        const catPfx = parseCategoryPrefix(finalCategory);
        cleanArticle = generateSuggestedArticle(catPfx, effectiveProductId).toUpperCase();
      }

      const finalBarcodeToSave = barcode.trim();

      // Final store-wide uniqueness verification before saving (prevents race condition if user clicks Save during debounce)
      const [articleCheck, barcodeCheck] = await Promise.all([
        api.products.validateArticle(cleanArticle, product?.id).catch(() => ({ valid: true })),
        api.products.validateBarcode(finalBarcodeToSave, product?.id).catch(() => ({ valid: true })),
      ]);

      if (!articleCheck.valid) {
        setCurrentStep(3);
        setArticleValidation({
          status: 'invalid',
          isDuplicate: articleCheck.isDuplicate,
          duplicateField: articleCheck.duplicateField,
          articleError: articleCheck.articleError || articleCheck.error,
          existingProduct: articleCheck.existingProduct,
          error: articleCheck.error || 'Article already exists in this store.',
        });
        setErrorMessage(articleCheck.error || 'Article already exists in this store.');
        setIsSubmitting(false);
        return;
      }

      if (!barcodeCheck.valid) {
        setCurrentStep(3);
        setBarcodeValidation({
          status: 'invalid',
          isDuplicate: barcodeCheck.isDuplicate,
          standard: barcodeCheck.standard,
          standardLabel: barcodeCheck.standardLabel,
          expectedCheckDigit: barcodeCheck.expectedCheckDigit,
          actualCheckDigit: barcodeCheck.actualCheckDigit,
          existingProduct: barcodeCheck.existingProduct,
          suggestedFix: barcodeCheck.suggestedFix,
          error: barcodeCheck.error || 'Barcode already exists in this store.',
        });
        setErrorMessage(barcodeCheck.error || 'Barcode already exists in this store.');
        setIsSubmitting(false);
        return;
      }

      const finalPairsPerCarton = isWholesaleStore ? (pairsPerCarton === 16 ? 16 : 12) : lotSize;

      // Store-type-aware low stock threshold handling:
      // Wholesale stores: product-level threshold is hidden.
      // - For existing wholesale products: preserve existing stored threshold value exactly so updates never overwrite it.
      // - For new wholesale products: use store-level threshold setting or default.
      // Retail stores: calculate from the visible input.
      let finalLowStockLimit: number;
      if (isWholesaleStore) {
        const existingLimit =
          product?.lowStockLimit ??
          product?.low_stock_limit ??
          product?.lowStockAlert ??
          product?.low_stock_alert;

        if (existingLimit !== undefined && existingLimit !== null && !isNaN(Number(existingLimit)) && Number(existingLimit) > 0) {
          finalLowStockLimit = Number(existingLimit);
        } else {
          const storeThreshold = effectiveSettings?.low_stock_limit ?? effectiveSettings?.lowStockLimit;
          finalLowStockLimit =
            storeThreshold && !isNaN(Number(storeThreshold)) && Number(storeThreshold) > 0
              ? Number(storeThreshold)
              : finalPairsPerCarton;
        }
      } else {
        finalLowStockLimit = calculateLowStockPairs({
          isWholesale: false,
          threshold: lowStockThreshold,
          pairsPerCarton: finalPairsPerCarton,
        });
      }

      // Consolidated Product Pricing Payload:
      const payload: ProductFormValues = {
        name: toTitleCaseTrimmed(productName) || cleanArticle,
        brand: finalBrand,
        category: finalCategory,
        article: cleanArticle,
        barcode: finalBarcodeToSave,
        primaryImageUrl: primaryImageUrl.trim(),
        description: description.trim(),
        costPrice: finalCostToSave,
        minPrice: finalMinToSave,
        maxPrice: finalMaxToSave,
        sellingPrice: finalMaxToSave,
        pairsPerCarton: finalPairsPerCarton,
        allowHalfCarton: isWholesaleStore ? allowHalfCarton : true,
        allow_half_carton: isWholesaleStore ? allowHalfCarton : true,
        totalStock: totalStock === '' ? 0 : Math.round(Number(totalStock)),
        lowStockLimit: finalLowStockLimit,
        lowStockAlert: finalLowStockLimit,
        low_stock_limit: finalLowStockLimit,
      };

      let savedProduct: any = null;
      if (product) {
        const res = await api.products.update(product.id, payload);
        savedProduct = (res as any)?.product || { ...product, ...payload, id: product.id };
      } else {
        const res = await api.products.create(payload);
        savedProduct = (res as any)?.product || {
          ...payload,
          id: (res as any)?.productId || effectiveProductId,
          barcode: (res as any)?.barcode || finalBarcodeToSave,
        };
      }

      onSuccess(savedProduct);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Effective prices for review & label preview
  const effectiveMaxSale = pricingMode === 'FIXED' ? fixedPriceVal : negotiableMaxVal;
  const effectiveMinSale = pricingMode === 'FIXED' ? fixedPriceVal : negotiableMinVal;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER & 3-STEP WIZARD STEPPER */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                  {product ? `Edit Product: ${product.article || product.name || 'Footwear Item'}` : 'Add Product Wizard'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-purple-200/80">
                  Step {currentStep} of 3 • 1 Product = 1 Barcode = Inventory Count
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {product && !isWholesaleStore && (
                <button
                  type="button"
                  title="Print high-visibility 3x4 inch shoe box side-end label for rack storage"
                  onClick={() => setIsSideEndLabelOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-400/40 bg-purple-50 dark:bg-purple-500/30 text-purple-700 dark:text-purple-200 hover:bg-purple-600 hover:text-white transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Side-End Label</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 3-Step Stepper Navigation */}
          <div className="grid grid-cols-3 gap-2">
            {/* Step 1 Tab */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 1
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : currentStep > 1
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 1
                    ? 'bg-white text-blue-600'
                    : currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                {currentStep > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 1</span>
                <span className="block text-xs font-semibold truncate">Classification</span>
              </div>
            </button>

            {/* Step 2 Tab: Pricing Specs */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setCurrentStep(2);
              }}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 2
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : currentStep > 2
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 2
                    ? 'bg-white text-blue-600'
                    : currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                {currentStep > 2 ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 2</span>
                <span className="block text-xs font-semibold truncate">Pricing</span>
              </div>
            </button>

            {/* Step 3 Tab: Barcode & Review */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1() && validateStep2()) setCurrentStep(3);
              }}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 3
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 3
                    ? 'bg-white text-blue-600'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                3
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 3</span>
                <span className="block text-xs font-semibold truncate">Barcode &amp; Review</span>
              </div>
            </button>
          </div>
        </div>

        {/* WIZARD FORM CONTENT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Force stop at last step: do not auto-submit from form submit events
            if (currentStep < 3) {
              goToNextStep();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const target = e.target as HTMLElement;
              if (target && target.tagName === 'INPUT') {
                if (currentStep < 3) {
                  goToNextStep();
                } else if (target === articleInputRef.current) {
                  barcodeInputRef.current?.focus();
                } else if (target === barcodeInputRef.current) {
                  barcodeInputRef.current?.blur();
                }
              }
            }
          }}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs bg-slate-50/50 dark:bg-[#070B14]"
        >
          {errorMessage && (
            <div className="alert-danger flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-xs">{errorMessage}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 1: PRODUCT CLASSIFICATION & VISUAL AI                */}
          {/* ========================================================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Product Image Section for Wholesale Stores (Standard upload, no AI suggestions) */}
              {isWholesaleStore && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-[#1A263D] dark:bg-[#0D1424]">
                  <div className="mb-3 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                    <h5 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-white">
                      Product Image <span className="font-normal normal-case text-gray-500">(optional)</span>
                    </h5>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {primaryImageUrl ? (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
                        <img src={primaryImageUrl} alt="Product preview" className="h-full w-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setPrimaryImageUrl('')}
                          aria-label="Remove product image"
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-xs font-semibold text-gray-700 transition hover:border-purple-400 hover:bg-purple-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-purple-500/10">
                        <Upload className="h-4 w-4" /> Upload product image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            handleProductImageUpload(event.target.files?.[0]);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <input
                        type="url"
                        value={primaryImageUrl.startsWith('data:') ? '' : primaryImageUrl}
                        onChange={(event) => setPrimaryImageUrl(event.target.value)}
                        placeholder="Or paste an image URL"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      />
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Images are resized to optimal dimensions before saving.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Product Image & AI Vision Suggestor (Strictly for Retail Stores) */}
              {!isWholesaleStore && (
                <section className="rounded-2xl border border-purple-200/90 bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/30 p-4 shadow-xs dark:border-purple-900/40 dark:from-[#0f172a] dark:via-[#0D1424] dark:to-purple-950/20">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white shadow-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                        Product Photo & AI Suggestor
                      </h5>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                      Retail Store Only
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {primaryImageUrl ? (
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-purple-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xs">
                        <img src={primaryImageUrl} alt="Product preview" className="h-full w-full object-contain p-1" />
                        <button
                          type="button"
                          onClick={() => {
                            setPrimaryImageUrl('');
                            setAiSuggestions(null);
                            setAiError(null);
                          }}
                          aria-label="Remove product image"
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-purple-300 bg-white/80 px-3 py-2.5 text-xs font-semibold text-purple-900 transition hover:border-purple-500 hover:bg-purple-50 dark:border-purple-700/60 dark:bg-slate-900/80 dark:text-purple-200 dark:hover:bg-purple-950/40">
                          <Upload className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span>Upload Shoe Photo (Auto AI Suggest)</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              handleProductImageUpload(event.target.files?.[0]);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>

                        {primaryImageUrl && !isAiAnalyzing && (
                          <button
                            type="button"
                            onClick={() => handleRunAiImageAnalysis(primaryImageUrl)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-purple-600 px-3 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 active:scale-95 transition dark:border-purple-600"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Re-analyze</span>
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={primaryImageUrl.startsWith('data:') ? '' : primaryImageUrl}
                          onChange={(event) => setPrimaryImageUrl(event.target.value)}
                          placeholder="Or paste an image URL"
                          className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        {primaryImageUrl && !primaryImageUrl.startsWith('data:') && !isAiAnalyzing && (
                          <button
                            type="button"
                            onClick={() => handleRunAiImageAnalysis(primaryImageUrl)}
                            className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                          >
                            Analyze
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Upload a photo of the shoe to automatically detect and suggest Title, Category, and Brand.
                      </p>
                    </div>
                  </div>

                  {/* AI Scanning State */}
                  {isAiAnalyzing && (
                    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-purple-200 bg-purple-100/70 p-3 text-xs text-purple-900 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-200 animate-pulse">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400 shrink-0" />
                      <span className="font-medium">
                        Analyzing footwear photo with Gemini AI... detecting Title, Category & Brand...
                      </span>
                    </div>
                  )}

                  {/* AI Error Note */}
                  {aiError && !isAiAnalyzing && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{aiError}</span>
                    </div>
                  )}

                  {/* AI Suggestions Results Panel */}
                  {aiSuggestions && !isAiAnalyzing && (
                    <div className="mt-3 rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>AI Suggestions Detected</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyAllAiSuggestions}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition"
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                          <span>Apply All</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {aiSuggestions.title ? (
                          <button
                            type="button"
                            onClick={() => handleApplySingleAiSuggestion('title')}
                            title="Click to apply this title"
                            className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-gray-800 shadow-2xs hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-emerald-800/80 dark:bg-slate-900 dark:text-slate-100 transition"
                          >
                            <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400">Title:</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300 group-hover:underline">
                              {aiSuggestions.title}
                            </span>
                          </button>
                        ) : null}

                        {aiSuggestions.category ? (
                          <button
                            type="button"
                            onClick={() => handleApplySingleAiSuggestion('category')}
                            title="Click to apply this category"
                            className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-gray-800 shadow-2xs hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-emerald-800/80 dark:bg-slate-900 dark:text-slate-100 transition"
                          >
                            <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400">Category:</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300 group-hover:underline">
                              {aiSuggestions.category}
                            </span>
                          </button>
                        ) : null}

                        {aiSuggestions.brand ? (
                          <button
                            type="button"
                            onClick={() => handleApplySingleAiSuggestion('brand')}
                            title="Click to apply this brand"
                            className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-gray-800 shadow-2xs hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-emerald-800/80 dark:bg-slate-900 dark:text-slate-100 transition"
                          >
                            <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-400">Brand:</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300 group-hover:underline">
                              {aiSuggestions.brand}
                            </span>
                          </button>
                        ) : null}

                        {aiSuggestions.shoeType ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white/70 px-2 py-1 text-[11px] text-gray-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Style:</span>
                            <span>{aiSuggestions.shoeType}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>
              )}



              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>1. Product Classification</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 1 of 3</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Brand Input (Standard Text Input) */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Brand / Manufacturer <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">(optional)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={brand}
                          onChange={(e) => handleBrandChange(e.target.value)}
                          placeholder="Add brand (e.g., Nike, Services) or leave blank for Unbranded"
                          className="capitalize w-full px-3 py-2 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition"
                        />
                      </div>
                      <div title={`Brand: ${currentBrandName}`} className="shrink-0">
                        <BrandLogo logo="" name={currentBrandName} size="md" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Brand Prefix (3-char):</span>
                      <span className="font-mono font-bold text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                        {currentBrandPrefix || 'UNB'}
                      </span>
                    </div>
                  </div>

                  {/* Category Select (Pre-saved Store Categories) */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Shoe Category <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] outline-none focus:border-indigo-600 dark:focus:border-purple-400 cursor-pointer transition"
                      >
                        {categories.map((cName, cIdx) => (
                          <option
                            key={`cat-opt-${cName}-${cIdx}`}
                            value={cName}
                            className="bg-white text-gray-900 dark:bg-[#120726] dark:text-purple-100"
                          >
                            {cName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Article Prefix (2-char):</span>
                      <span className="font-mono font-bold text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                        {currentCategoryPrefix || '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PHYSICAL INVENTORY & DETAILS */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>{isWholesaleStore ? 'Wholesale Inventory & Lot Configuration' : 'Physical Inventory & Basic Specs'}</span>
                  </h5>
                  {isWholesaleStore && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 uppercase">
                      B2B Wholesale Lot
                    </span>
                  )}
                </div>

                {isWholesaleStore ? (
                  /* ========================================================= */
                  /* WHOLESALE STORE: WHOLESALE STOCK & LOT SIZE COUNTER       */
                  /* ========================================================= */
                  <div className="p-3.5 bg-indigo-50/70 dark:bg-gradient-to-br dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950 border border-indigo-200/80 dark:border-indigo-600/40 rounded-xl space-y-3 shadow-sm">
                    <label className="block font-bold text-indigo-950 dark:text-white text-xs">
                      Total Available Stock Quantity (Pairs) <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const step = isFractionalAllowed ? (pairsPerCarton / 2) : pairsPerCarton;
                          setTotalStock((prev) => Math.max(0, (typeof prev === 'number' ? prev : 0) - step));
                        }}
                        className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                        title={isFractionalAllowed ? `Decrease 0.5 Carton (${pairsPerCarton / 2} pairs)` : `Decrease 1 Carton (${pairsPerCarton} pairs)`}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        step={isFractionalAllowed ? pairsPerCarton / 2 : pairsPerCarton}
                        required
                        value={totalStock}
                        onChange={(e) => setTotalStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        placeholder="0"
                        className="flex-1 py-1.5 px-3 bg-white dark:bg-slate-950/80 border border-indigo-200 dark:border-indigo-400/40 rounded-lg font-mono font-bold text-center text-sm text-indigo-950 dark:text-white placeholder-indigo-300 dark:placeholder-white/40 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-400/30 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const step = isFractionalAllowed ? (pairsPerCarton / 2) : pairsPerCarton;
                          setTotalStock((prev) => (typeof prev === 'number' ? prev : 0) + step);
                        }}
                        className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                        title={isFractionalAllowed ? `Increase 0.5 Carton (+${pairsPerCarton / 2} pairs)` : `Increase 1 Carton (+${pairsPerCarton} pairs)`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setTotalStock((prev) => (typeof prev === 'number' ? prev : 0) + pairsPerCarton)}
                        className="h-8 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-300 text-xs transition active:scale-95 shadow-2xs cursor-pointer"
                        title={`Increase 1 Full Carton (+${pairsPerCarton} pairs)`}
                      >
                        +1 Ctn
                      </button>
                    </div>

                    {/* Carton Pack / Minimum Pairs to Sell for Wholesale (12 or 16 pairs per carton) */}
                    <div className="pt-2 border-t border-indigo-200/60 dark:border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block font-bold text-indigo-950 dark:text-white text-xs">
                          Carton Pack Size <span className="text-red-500">*</span>
                        </label>
                        <div
                          className="inline-flex p-0.5 bg-white/90 dark:bg-slate-950/70 border border-indigo-200 dark:border-indigo-400/30 rounded-lg"
                          role="radiogroup"
                          aria-label="Carton Pack Size Selector"
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={pairsPerCarton === 12}
                            onClick={() => handlePairsPerCartonChange(12)}
                            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              pairsPerCarton === 12
                                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-indigo-500/30 font-extrabold border border-white/20'
                                : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                            }`}
                          >
                            12 Pairs (1 Ctn)
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={pairsPerCarton === 16}
                            onClick={() => handlePairsPerCartonChange(16)}
                            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              pairsPerCarton === 16
                                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-indigo-500/30 font-extrabold border border-white/20'
                                : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                            }`}
                          >
                            16 Pairs (1 Ctn)
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Minimum Sale Quantity:</span>
                        <span className="font-semibold font-mono text-indigo-700 dark:text-indigo-300">
                          {isFractionalAllowed ? pairsPerCarton / 2 : pairsPerCarton} pairs ({isFractionalAllowed ? '0.5 Carton' : '1 Carton'})
                        </span>
                      </div>

                      {/* Wholesale stock presets: display pairs and carton equivalents separately. */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-indigo-900/80 dark:text-slate-400 font-bold uppercase tracking-wider block">
                          Quick Stock Presets
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                          {[0.5, 1, 2, 5, 10].map((cartons) => {
                            const pairs = pairsPerCarton * cartons;
                            const isSelected = totalStock === pairs;
                            const cartonLabel = cartons === 1 ? 'Carton' : 'Cartons';
                            const isHalfChip = cartons === 0.5;
                            const isHalfDisabled = isHalfChip && !isFractionalAllowed;

                            return (
                              <div
                                key={`ws-chip-${cartons}`}
                                role="button"
                                tabIndex={isHalfDisabled ? -1 : 0}
                                aria-pressed={isSelected}
                                title={
                                  isHalfDisabled
                                    ? `Allow Half Carton (0.5) is unchecked for this item. Check it to enable fractional quantities.`
                                    : `${pairs} pairs · ${cartons} ${cartonLabel}`
                                }
                                onClick={() => {
                                  if (isHalfDisabled) {
                                    setErrorMessage("To select 0.5 carton, please enable 'Allow Half Carton (0.5)' inside the chip.");
                                    return;
                                  }
                                  setTotalStock(pairs);
                                }}
                                className={`group relative min-h-[78px] rounded-xl border p-2.5 text-left transition-all duration-150 select-none ${
                                  isHalfDisabled
                                    ? 'border-indigo-200/60 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40 opacity-75 cursor-default'
                                    : isSelected
                                    ? 'border-emerald-500 bg-emerald-100/80 shadow-sm ring-1 ring-emerald-400/40 dark:border-emerald-400 dark:bg-emerald-900/50 dark:ring-emerald-400/30 cursor-pointer hover:-translate-y-0.5'
                                    : 'border-indigo-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/70 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/40 cursor-pointer hover:-translate-y-0.5 active:scale-[0.98]'
                                }`}
                              >
                                <span className="flex items-baseline gap-1.5">
                                  <span className={`font-mono text-lg font-bold leading-none ${isSelected ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-900 dark:text-white'}`}>
                                    {pairs}
                                  </span>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    Pairs
                                  </span>
                                </span>

                                {/* Positioned in absolute position to the right, placed directly under the 6 pairs header, inside the 0.5 carton chip */}
                                {isHalfChip && (
                                  <div
                                    className="absolute right-2 top-7 z-10 flex items-center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <label
                                      htmlFor="allow-half-carton-checkbox"
                                      className="flex items-center gap-1 cursor-pointer select-none"
                                      title="Allow Half Carton (0.5)"
                                    >
                                      <input
                                        type="checkbox"
                                        id="allow-half-carton-checkbox"
                                        checked={allowHalfCarton}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const nextVal = e.target.checked;
                                          setAllowHalfCarton(nextVal);
                                          if (!nextVal && totalStock === pairsPerCarton * 0.5) {
                                            setTotalStock(pairsPerCarton);
                                          }
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                      />
                                      <span className="text-[9px] font-bold text-indigo-900 dark:text-indigo-200 tracking-tight leading-tight">
                                        Allow Half (0.5)
                                      </span>
                                    </label>
                                  </div>
                                )}

                                <span className={`mt-2 flex items-center gap-1 border-t pt-1.5 text-[10px] dark:border-slate-700 ${isSelected ? 'border-emerald-200/70' : 'border-indigo-200/70'}`}>
                                  <span className={`font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>{cartons}</span>
                                  <span className="text-slate-500 dark:text-slate-400">{cartonLabel}</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ========================================================= */
                  /* RETAIL STORE: STANDARD PAIR & LOT SIZE COUNTER            */
                  /* ========================================================= */
                  <div className="p-3.5 bg-slate-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950 border border-slate-200 dark:border-indigo-600/40 rounded-xl space-y-2.5 shadow-xs">
                    <label className="block font-bold text-slate-800 dark:text-white text-xs">
                      Total Available Stock Quantity (Pairs) <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setTotalStock((prev) => Math.max(0, (typeof prev === 'number' ? prev : 0) - 1))}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-slate-800 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                        title="Decrease by 1 pair"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        required
                        value={totalStock}
                        onChange={(e) => setTotalStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        placeholder="0"
                        className="flex-1 py-1.5 px-3 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-indigo-400/40 rounded-lg font-mono font-bold text-center text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 outline-none focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-2 focus:ring-slate-200 dark:focus:ring-indigo-400/30 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setTotalStock((prev) => (typeof prev === 'number' ? prev : 0) + 1)}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-slate-800 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                        title="Increase by 1 pair"
                      >
                        +
                      </button>
                    </div>

                    {/* Carton-based stock presets; the quantity field remains freely editable. */}
                    <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-white uppercase tracking-wider">
                          Lot Size Shortcut
                        </span>
                        <div
                          className="inline-flex p-0.5 bg-white/90 dark:bg-slate-950/70 border border-slate-200 dark:border-indigo-400/30 rounded-lg"
                          role="radiogroup"
                          aria-label="Lot Size Selector"
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={lotSize === 12}
                            onClick={() => handleLotSizeChange(12)}
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              lotSize === 12
                                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/25 font-extrabold border border-emerald-500'
                                : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                            }`}
                          >
                            12 Pairs (1 Ctn)
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={lotSize === 16}
                            onClick={() => handleLotSizeChange(16)}
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              lotSize === 16
                                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/25 font-extrabold border border-emerald-500'
                                : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                            }`}
                          >
                            16 Pairs (1 Ctn)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {[0.5, 1, 2, 5, 10].map((cartons) => {
                            const pairs = lotSize * cartons;
                            const isSelected = Number(totalStock) === pairs;
                            const quantityLabel = `${cartons} ${cartons === 1 ? 'Carton' : 'Cartons'}`;

                            return (
                              <button
                                key={`retail-stock-${cartons}`}
                                type="button"
                                aria-pressed={isSelected}
                                title={`${pairs} pairs · ${quantityLabel}`}
                                onClick={() => setTotalStock(pairs)}
                                className={`group min-h-[76px] rounded-xl border p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                                  isSelected
                                    ? 'border-emerald-500 bg-emerald-100/80 shadow-sm ring-1 ring-emerald-400/40 dark:border-emerald-400 dark:bg-emerald-900/50 dark:ring-emerald-400/30'
                                    : 'border-indigo-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/70 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/40'
                                }`}
                              >
                                <span className="flex items-baseline gap-1.5">
                                  <span className={`font-mono text-lg font-bold leading-none ${isSelected ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-900 dark:text-white'}`}>
                                    {pairs}
                                  </span>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    Pairs
                                  </span>
                                </span>
                                <span className={`mt-2 flex items-center gap-1 border-t pt-1.5 text-[10px] ${isSelected ? 'border-emerald-200/70 dark:border-emerald-800' : 'border-indigo-200/70 dark:border-slate-700'}`}>
                                  <span className={`font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                                    {quantityLabel}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Store-Type-Aware Low Stock Threshold for Retail (in Pairs) */}
                    <div className="pt-2.5 border-t border-indigo-200/60 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block font-bold text-indigo-950 dark:text-white text-xs">
                          Low Stock Threshold (Pairs) <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/90 dark:bg-slate-950/70 border border-indigo-200 dark:border-indigo-400/30 text-indigo-700 dark:text-indigo-300">
                          {lowStockThreshold || 5} Pairs
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() =>
                            setLowStockThreshold((prev) => Math.max(1, (Number(prev) || 1) - 1))
                          }
                          className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                          title="Decrease by 1 pair"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          required
                          value={lowStockThreshold}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1);
                            setLowStockThreshold(val);
                          }}
                          placeholder="5"
                          className="flex-1 py-1.5 px-3 bg-white dark:bg-slate-950/80 border border-indigo-200 dark:border-indigo-400/40 rounded-lg font-mono font-bold text-center text-sm text-indigo-950 dark:text-white placeholder-indigo-300 dark:placeholder-white/40 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-400/30 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setLowStockThreshold((prev) => (Number(prev) || 0) + 1)
                          }
                          className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                          title="Increase by 1 pair"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Quick Pairs:</span>
                        {[3, 5, 10, 15].map((pairs) => {
                          const isSelected = Number(lowStockThreshold) === pairs;
                          return (
                            <button
                              key={`low-stock-pair-${pairs}`}
                              type="button"
                              onClick={() => setLowStockThreshold(pairs)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-white dark:bg-slate-900 border border-indigo-200/70 dark:border-indigo-900/40 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                              }`}
                            >
                              {pairs} Pairs
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-indigo-900/70 dark:text-white/70">
                        Alerts POS when inventory falls at or below {lowStockThreshold || 5} pairs.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-indigo-200/60 dark:border-white/10">
                      <p className="text-[10px] text-indigo-900/70 dark:text-white/80 font-medium">
                        Retail stock is counted per pair. Enter any whole quantity, including loose stock such as 8 or 10 pairs.
                      </p>
                    </div>
                  </div>
                )}

                {/* Product Title / Display Name */}
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Product Title / Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${currentBrandName ? currentBrandName + ' ' : ''}${article || 'Air Runner Shoes'}`}
                    value={productName}
                    onChange={(e) => setProductName(toTitleCaseLive(e.target.value))}
                    className="capitalize w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950 bg-white dark:bg-[#070B14] text-gray-900 dark:text-white"
                  />
                </div>

                {/* Auto-Assigned Standard Codes Summary */}
                {article && (
                  <div className="p-3 bg-slate-100/80 dark:bg-[#070B14] border border-slate-200 dark:border-[#1A263D] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                      <span className="text-gray-600 dark:text-slate-400 font-medium">Standard Code:</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-white bg-white dark:bg-[#131B2E] px-2 py-0.5 rounded border border-gray-200 dark:border-[#1A263D]">
                        Article: {article || '---'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 2: PRICING SPECIFICATIONS (FIXED / NEGOTIABLE)       */}
          {/* ========================================================= */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800 gap-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-indigo-600 dark:text-blue-400" />
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">2. Product Pricing</h4>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                        pricingMode === 'FIXED'
                          ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60'
                          : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                      }`}
                    >
                      {pricingMode === 'FIXED' ? 'Fixed Price Policy (Locked)' : 'Negotiable Price Policy (Locked)'}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 2 of 3</span>
                </div>

                {/* ===================================================== */}
                {/* DYNAMIC PRICING FORM                                  */}
                {/* WHOLESALE B2B: Cost per Pair + Wholesale Rate + Carton Price */}
                {/* RETAIL B2C: Fixed or Negotiable Retail Pricing        */}
                {/* ===================================================== */}
                {isWholesaleStore ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* 1. Cost Price per Pair */}
                      <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="wholesale-cost-price-input" className="block font-bold text-gray-900 dark:text-slate-200 text-xs">
                            Cost Price (Per Pair) <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">costPrice</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">
                          Unit acquisition / factory cost per single pair.
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 font-mono font-bold text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="wholesale-cost-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            autoFocus
                            placeholder="0"
                            value={costPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setCostPrice, 'costPrice')}
                            className={`w-full pl-12 pr-3 py-3 bg-white dark:bg-[#0B101D] border-2 rounded-xl font-mono font-black text-lg text-gray-950 dark:text-white outline-none transition shadow-xs ${
                              pricingFieldErrors.costPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-indigo-200 dark:border-indigo-800/80 focus:border-indigo-600'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.costPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.costPrice}
                          </p>
                        )}
                      </div>

                      {/* 2. Wholesale Selling Rate (Per Pair) */}
                      <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="wholesale-pair-rate-input" className="block font-bold text-indigo-950 dark:text-indigo-200 text-xs">
                            Wholesale Rate (Per Pair) <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                            maxPrice
                          </span>
                        </div>
                        <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                          B2B wholesale selling rate per single pair.
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-700 dark:text-indigo-300 font-mono font-black text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="wholesale-pair-rate-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            placeholder="0"
                            value={maxPrice}
                            onChange={(e) => handleWholesaleRateChange(e.target.value)}
                            className={`w-full pl-12 pr-3 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-black text-lg text-indigo-950 dark:text-indigo-100 outline-none transition shadow-xs ${
                              pricingFieldErrors.maxPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-indigo-400 dark:border-indigo-500 focus:border-indigo-600'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.maxPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.maxPrice}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Live Wholesale Profit & Batch Analytics Card */}
                    {typeof costPrice === 'number' && typeof maxPrice === 'number' && maxPrice > 0 && (
                      <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-indigo-950/30 border border-emerald-200/80 dark:border-emerald-700/60 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-950 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Wholesale Margin &amp; Lot Economics ({pairsPerCarton} Pairs Lot)</span>
                          </span>
                          <span className="text-[11px] font-bold font-mono text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            {costPrice > 0 ? `+${Math.round(((maxPrice - costPrice) / costPrice) * 100)}% Margin` : 'N/A'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2 bg-white/80 dark:bg-slate-950/70 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
                            <span className="text-[10px] text-slate-500 block">Profit / Pair</span>
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                              {currencySymbol} {formatStockPrice(maxPrice - costPrice)}
                            </span>
                          </div>
                          <div className="p-2 bg-white/80 dark:bg-slate-950/70 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
                            <span className="text-[10px] text-slate-500 block">Profit / Lot ({pairsPerCarton} pr)</span>
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                              {currencySymbol} {formatStockPrice((maxPrice - costPrice) * pairsPerCarton)}
                            </span>
                          </div>
                          <div className="p-2 bg-white/80 dark:bg-slate-950/70 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
                            <span className="text-[10px] text-slate-500 block">Lot Value ({pairsPerCarton} pr)</span>
                            <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                              {currencySymbol} {formatStockPrice(maxPrice * pairsPerCarton)}
                            </span>
                          </div>
                          <div className="p-2 bg-white/80 dark:bg-slate-950/70 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
                            <span className="text-[10px] text-slate-500 block">Total Batch Stock</span>
                            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                              {currencySymbol} {formatStockPrice(maxPrice * (typeof totalStock === 'number' ? totalStock : 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : pricingMode === 'FIXED' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Cost Price */}
                      <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-cost-price-input" className="block font-bold text-gray-900 dark:text-slate-200 text-xs">
                            Cost Price <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">costPrice</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">
                          Unit acquisition cost paid to supplier or factory.
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 font-mono font-bold text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="product-cost-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            autoFocus
                            placeholder="0"
                            value={costPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setCostPrice, 'costPrice')}
                            className={`w-full pl-12 pr-4 py-3 bg-white dark:bg-[#0B101D] border-2 rounded-xl font-mono font-black text-lg text-gray-950 dark:text-white outline-none transition shadow-xs ${
                              pricingFieldErrors.costPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-indigo-200 dark:border-indigo-800/80 focus:border-indigo-600 dark:focus:border-indigo-400'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.costPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.costPrice}
                          </p>
                        )}
                      </div>

                      {/* Single Fixed Price Field, stored as maxPrice */}
                      <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-final-sale-price-input" className="block font-bold text-purple-950 dark:text-purple-200 text-xs">
                            Tag Price <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 font-bold">
                            maxPrice = minPrice
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80">
                          Tag price (must be &ge; Cost Price).
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-700 dark:text-purple-300 font-mono font-black text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="product-final-sale-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            placeholder={String(costVal || 0)}
                            value={maxPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setMaxPrice, 'maxPrice')}
                            className={`w-full pl-12 pr-4 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-black text-lg text-purple-950 dark:text-purple-100 outline-none transition shadow-xs ${
                              pricingFieldErrors.maxPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-purple-400 dark:border-purple-500 focus:border-purple-600 dark:focus:border-purple-400'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.maxPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.maxPrice}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs flex items-center gap-2.5">
                      <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>
                        <strong>Fixed Price Rule:</strong> The tag price and minimum selling price are set to{' '}
                        <strong>
                          {currencySymbol} {fixedPriceVal}
                        </strong>{' '}
                        for this product.
                      </span>
                    </div>
                  </div>
                ) : (
                  /* ===================================================== */
                  /* DYNAMIC FORM: NEGOTIABLE PRICE POLICY                 */
                  /* Renders 3 Mandatory Fields: Cost, Min, Max Price      */
                  /* ===================================================== */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* 1. Cost Price */}
                      <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-cost-price-input" className="block font-bold text-gray-900 dark:text-slate-200 text-xs">
                            Cost Price <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-gray-500 dark:text-slate-400">costPrice</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">
                          Unit acquisition cost per pair.
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 font-mono font-bold text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="product-cost-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            autoFocus
                            placeholder="0"
                            value={costPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setCostPrice, 'costPrice')}
                            className={`w-full pl-11 pr-3 py-3 bg-white dark:bg-[#0B101D] border-2 rounded-xl font-mono font-black text-base text-gray-950 dark:text-white outline-none transition shadow-xs ${
                              pricingFieldErrors.costPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-slate-300 dark:border-slate-700 focus:border-indigo-600 dark:focus:border-indigo-400'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.costPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.costPrice}
                          </p>
                        )}
                      </div>

                      {/* 2. Min Selling Price */}
                      <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-min-sale-price-input" className="block font-bold text-amber-950 dark:text-amber-200 text-xs">
                            Min Selling Price <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 font-bold">minPrice</span>
                        </div>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                          POS floor limit (must be &ge; Cost Price).
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-700 dark:text-amber-300 font-mono font-black text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="product-min-sale-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            placeholder={String(costVal || 0)}
                            value={minPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setMinPrice, 'minPrice')}
                            className={`w-full pl-11 pr-3 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-black text-base text-amber-950 dark:text-amber-100 outline-none transition shadow-xs ${
                              pricingFieldErrors.minPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-amber-400 dark:border-amber-500 focus:border-amber-600 dark:focus:border-amber-400'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.minPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.minPrice}
                          </p>
                        )}
                      </div>

                      {/* 3. Max Selling Price */}
                      <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="product-max-sale-price-input" className="block font-bold text-indigo-950 dark:text-indigo-200 text-xs">
                            Max Selling Price <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 font-bold">maxPrice</span>
                        </div>
                        <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                          Tag price (must be greater than Min Price).
                        </p>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-700 dark:text-indigo-300 font-mono font-black text-base">
                            {currencySymbol}
                          </span>
                          <input
                            id="product-max-sale-price-input"
                            type="number"
                            min="0"
                            step="1"
                            required
                            placeholder={String(negotiableMinVal || costVal || 0)}
                            value={maxPrice}
                            onChange={(e) => handleIntegerPriceInput(e.target.value, setMaxPrice, 'maxPrice')}
                            className={`w-full pl-11 pr-3 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-black text-base text-indigo-950 dark:text-indigo-100 outline-none transition shadow-xs ${
                              pricingFieldErrors.maxPrice
                                ? 'border-red-400 dark:border-red-500 focus:border-red-600'
                                : 'border-indigo-400 dark:border-indigo-500 focus:border-indigo-600 dark:focus:border-indigo-400'
                            }`}
                          />
                        </div>
                        {pricingFieldErrors.maxPrice && (
                          <p className="text-red-600 dark:text-red-400 text-[11px] font-medium mt-1">
                            {pricingFieldErrors.maxPrice}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs flex items-center gap-2.5">
                      <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>
                        <strong>Negotiable Price Rule:</strong> All three fields (<code className="font-mono font-bold">costPrice</code>,{' '}
                        <code className="font-mono font-bold">minPrice</code>, and{' '}
                        <code className="font-mono font-bold">maxPrice</code>) are mandatory, with{' '}
                        <code className="font-mono font-bold">minPrice &ge; costPrice</code> and{' '}
                        <code className="font-mono font-bold">maxPrice &gt; minPrice</code>.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 3: BARCODE & IDENTIFICATION (VALIDATED & EDITABLE)   */}
          {/* ========================================================= */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-indigo-600 dark:text-blue-400" />
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">3. Article &amp; Barcode Identification (Store-Wide Unique)</h4>
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">Step 3 of 3</span>
                </div>

                {/* EDITABLE ARTICLE SECTION */}
                <div className="space-y-4 pb-4 border-b border-gray-100 dark:border-slate-800">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <label className="font-bold text-gray-900 dark:text-slate-200 text-xs flex items-center gap-1">
                        <span>Article Code (Store Unique)</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleResetStoreArticle}
                          className="px-2 py-1 bg-indigo-50 dark:bg-blue-950/50 hover:bg-indigo-100 dark:hover:bg-blue-900/60 text-indigo-600 dark:text-blue-400 rounded-lg font-semibold text-[10px] transition flex items-center gap-1 cursor-pointer border border-indigo-200 dark:border-blue-800/60"
                          title="Reset to auto-generated store standard article code"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-600 dark:text-blue-400" />
                          <span>Reset Article</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleArticleChange('');
                            setTimeout(() => articleInputRef.current?.focus(), 50);
                          }}
                          className="px-2 py-1 bg-slate-100 dark:bg-[#070B14] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-[10px] transition flex items-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-700"
                          title="Clear and focus to enter custom or box article code"
                        >
                          <Tag className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                          <span>Box Article</span>
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        ref={articleInputRef}
                        id="product-article-step3-input"
                        type="text"
                        required
                        placeholder={`e.g. ${generateSuggestedArticle(currentCategoryPrefix || 'CA', effectiveProductId)}`}
                        value={article}
                        onChange={(e) => handleArticleChange(e.target.value)}
                        className={`w-full pl-9 pr-16 py-2.5 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-bold text-sm text-gray-900 dark:text-white outline-none transition shadow-xs uppercase ${
                          article.trim().length > 0 &&
                          !(articleValidation.status === 'invalid' && articleValidation.duplicateField === 'article')
                            ? 'border-emerald-400 dark:border-emerald-500 focus:border-emerald-600 dark:focus:border-emerald-400'
                            : 'border-red-400 dark:border-red-500 focus:border-red-600 dark:focus:border-red-400'
                        }`}
                      />
                      <Tag className="w-4 h-4 text-indigo-600 dark:text-blue-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {article && (
                          <button
                            type="button"
                            onClick={() => {
                              handleArticleChange('');
                              articleInputRef.current?.focus();
                            }}
                            className="px-1.5 py-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                      Must be unique within your store catalog.
                    </p>
                  </div>

                  {/* REAL-TIME ARTICLE UNIQUENESS FEEDBACK */}
                  {articleValidation.status === 'checking' && (
                    <div className="alert-warning flex items-center gap-2.5 text-xs animate-in fade-in">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{articleValidation.message || 'Checking Article uniqueness in this store...'}</span>
                    </div>
                  )}

                  {article.trim().length > 0 && articleValidation.status === 'valid' && (
                    <div className="alert-success flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-center gap-2 text-emerald-950 dark:text-emerald-300 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-bold text-emerald-900 dark:text-emerald-300 font-mono">
                            {article.trim().toUpperCase()}
                          </span>
                          <span className="mx-1.5 opacity-40">|</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Article verified unique in this store
                          </span>
                        </div>
                      </div>
                      <span className="badge-success uppercase text-[10px]">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Store Unique</span>
                      </span>
                    </div>
                  )}

                  {(article.trim().length === 0 || articleValidation.status === 'invalid') && (
                    <div className="alert-danger flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        <span>
                          {article.trim().length === 0
                            ? 'Article code is required for product identification and box labels.'
                            : articleValidation.error || 'Article code already exists in this store.'}
                        </span>
                      </div>
                      {article.trim().length === 0 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleResetStoreArticle}
                            className="btn-danger px-2.5 py-1 text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Restore Store Article</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* EDITABLE BARCODE SECTION WITH REAL-TIME VALIDATION */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="font-bold text-gray-900 dark:text-slate-200 text-xs flex items-center gap-1.5">
                        <span>Barcode Input (Code-128 Default or Product Box Barcode)</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Pre-filled with compact store Code-128 ({generateCode128Barcode(effectiveProductId, currentCategoryPrefix || 'CA').barcode}). Keep it or override with any manufacturer box barcode (Code-128, EAN-13, UPC-A, EAN-8).
                      </p>
                    </div>

                    {/* Fast Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleGenerateStoreBarcode}
                        className="px-2.5 py-1.5 bg-indigo-50 dark:bg-blue-950/50 hover:bg-indigo-100 dark:hover:bg-blue-900/60 text-indigo-600 dark:text-blue-400 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer border border-indigo-200 dark:border-blue-800/60"
                        title="Reset to compact store Code-128 barcode (no prefix, exact product ID)"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-blue-400" />
                        <span>Reset to Store Code-128</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsBarcodeManuallyEdited(true);
                          setBarcode('');
                          setTimeout(() => barcodeInputRef.current?.focus(), 50);
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#070B14] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-700"
                        title="Clear and focus to scan box barcode with gun or type manual barcode"
                      >
                        <Scan className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                        <span>Scan / Enter Box Barcode</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Barcode Input with Dynamic Border & Validation State */}
                  <div className="relative">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      required
                      placeholder={`Scan box barcode or use store Code-128 (e.g. ${generateCode128Barcode(effectiveProductId, currentCategoryPrefix || 'CA').barcode} or EAN/UPC)...`}
                      value={barcode}
                      onChange={(e) => {
                        // Strictly update ONLY barcode; never alter article, title, or product ID
                        setIsBarcodeManuallyEdited(true);
                        setBarcode(e.target.value.trim());
                      }}
                      className={`w-full pl-10 pr-28 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-bold text-base text-gray-900 dark:text-white outline-none transition shadow-xs ${
                        barcodeValidation.status === 'valid'
                          ? 'border-emerald-400 dark:border-emerald-500 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950'
                          : barcodeValidation.status === 'invalid'
                          ? 'border-red-400 dark:border-red-500 focus:border-red-600 dark:focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950'
                          : barcodeValidation.status === 'checking'
                          ? 'border-amber-400 dark:border-amber-500 focus:border-amber-600 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-950'
                          : 'border-indigo-300 dark:border-blue-700/60 focus:border-indigo-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-blue-950'
                      }`}
                    />
                    <Barcode className="w-5 h-5 text-indigo-600 dark:text-blue-400 absolute left-3 top-1/2 -translate-y-1/2" />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {barcode && (
                        <button
                          type="button"
                          onClick={() => setBarcode('')}
                          className="px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <span className="font-mono text-[10px] font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                        {barcode.length} chars
                      </span>
                    </div>
                  </div>

                  {/* REAL-TIME VALIDATION STATUS FEEDBACK */}
                  {barcodeValidation.status === 'checking' && (
                    <div className="alert-warning flex items-center gap-2.5 text-xs animate-in fade-in">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{barcodeValidation.message || 'Validating barcode format & checking catalog uniqueness...'}</span>
                    </div>
                  )}

                  {barcodeValidation.status === 'valid' && (
                    <div className="alert-success flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-center gap-2 text-emerald-950 dark:text-emerald-300 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-bold text-emerald-900 dark:text-emerald-300">{barcodeValidation.standardLabel || 'Barcode'}</span>
                          <span className="mx-1.5 opacity-40">|</span>
                          <span className="text-emerald-700 dark:text-emerald-400">Checksum verified &amp; available in catalog</span>
                        </div>
                      </div>
                      <span className="badge-success uppercase text-[10px]">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Validated</span>
                      </span>
                    </div>
                  )}

                  {barcodeValidation.status === 'invalid' && (
                    <div className="alert-danger space-y-2.5 text-xs animate-in fade-in">
                      <div className="flex items-start gap-2.5 text-red-800 dark:text-red-300">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold block text-red-950 dark:text-red-200 text-xs">
                            {barcodeValidation.isDuplicate
                              ? 'Duplicate Barcode Conflict'
                              : 'Barcode Validation Failed'}
                          </span>
                          <p className="text-red-700 dark:text-red-300 text-[11px] mt-0.5 leading-relaxed">
                            {barcodeValidation.error}
                          </p>
                        </div>
                      </div>

                      {/* Auto-fix suggested check digit button */}
                      {barcodeValidation.suggestedFix && (
                        <div className="pt-2 border-t border-red-200 dark:border-red-800/60 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] text-red-900 dark:text-red-300 font-mono">
                            Correct checksum code:{' '}
                            <span className="font-bold underline">{barcodeValidation.suggestedFix}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBarcode(barcodeValidation.suggestedFix!)}
                            className="btn-danger px-3 py-1 text-[11px] flex items-center gap-1.5 shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Auto-Fix Check Digit</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Standard Guidelines Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-gray-500 dark:text-slate-400">
                    <span>
                      Supported: Store Code-128, Box Code-128, EAN-13, UPC-A (12D), and EAN-8.
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">
                      Auto-validated on type/scan
                    </span>
                  </div>
                </div>

                {/* LIVE VISUAL BARCODE PREVIEW */}
                {barcode && (
                  <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Live Scannable Barcode Preview
                    </span>
                    <div className="bg-white p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-2xs">
                      <BarcodeSvg
                        value={barcode}
                        width={1.7}
                        height={46}
                        fontSize={12}
                        className="max-w-full h-auto"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                      Cashier barcode guns will read this code at checkout to look up: <span className="font-semibold text-gray-800 dark:text-slate-200">{productName || article || 'Product'}</span>
                    </p>

                    {/* Quick Label & Sticker Actions */}
                    <div className="pt-2 border-t border-gray-200 dark:border-slate-800 w-full flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        title="Print retail barcode sticker (50x30mm)"
                        onClick={() => setIsBarcodeStickerOpen(true)}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white dark:hover:from-purple-600 dark:hover:to-indigo-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold active:scale-95"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                        <span>Print Barcode Sticker (50x30mm)</span>
                      </button>

                      {!isWholesaleStore && (
                        <button
                          type="button"
                          title="Print high-visibility 3x4 inch shoe box side-end label for rack storage"
                          onClick={() => setIsSideEndLabelOpen(true)}
                          className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                        >
                          <Box className="w-3.5 h-3.5" />
                          <span>Print Side-End Box Label (3&quot; x 4&quot;)</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* FINAL REVIEW SUMMARY CARD */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-3">
                <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{isWholesaleStore ? 'Wholesale Product Specifications Summary' : 'Product Review Summary Before Saving'}</span>
                </h5>

                {isWholesaleStore ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Brand &amp; Category</span>
                      <span className="font-bold text-gray-900 dark:text-white truncate block">
                        {currentBrandName || '---'} / {currentCategoryName || '---'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Article</span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-blue-400 truncate block">
                        {article || '---'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Wholesale Rate</span>
                      <span className="font-mono font-bold text-purple-700 dark:text-purple-300 truncate block">
                        {currencySymbol} {formatStockPrice(maxPrice)}/pr
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Carton Size</span>
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 truncate block">
                        {pairsPerCarton} Pairs/Ctn
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Total Stock</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 truncate block">
                        {totalStock === '' ? 0 : totalStock} Pairs ({Math.floor((typeof totalStock === 'number' ? totalStock : 0) / pairsPerCarton)} Lots)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Brand &amp; Category</span>
                      <span className="font-bold text-gray-900 dark:text-white truncate block">
                        {currentBrandName || '---'} / {currentCategoryName || '---'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Article</span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-blue-400 truncate block">
                        {article || '---'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Cost / Max Sale Price</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 truncate block">
                        {currencySymbol} {formatStockPrice(costPrice)} / {currencySymbol} {formatStockPrice(effectiveMaxSale)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Total Stock</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-white truncate block">
                        {totalStock === '' ? 0 : totalStock} Pairs
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Low Stock Alert</span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 truncate block">
                        {lowStockThreshold || 5} Pairs
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* FOOTER NAVIGATION & ACTION BUTTONS                        */}
          {/* ========================================================= */}
          <div className="pt-4 -mx-6 -mb-6 p-6 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-gray-200 dark:border-purple-800/80 flex items-center justify-between">
            <div>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={goToPrevStep}
                  className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                >
                  <span>
                    {currentStep === 1
                      ? 'Next: Pricing Specifications'
                      : 'Next: Barcode & Identification'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmAndSave}
                  disabled={
                    isSubmitting ||
                    barcodeValidation.status === 'invalid' ||
                    barcodeValidation.status === 'checking' ||
                    (articleValidation.status === 'invalid' && articleValidation.duplicateField === 'article') ||
                    articleValidation.status === 'checking' ||
                    !article.trim() ||
                    !barcode.trim()
                  }
                  className="btn-primary px-6 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-md font-bold disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving Product...' : product ? 'Confirm & Update Product' : 'Confirm & Create Product'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </motion.div>

      <AnimatePresence>
        {isSideEndLabelOpen && !isWholesaleStore && (
          <SideEndBoxLabelModal
            product={
              product || {
                id: effectiveProductId,
                article: article || productName || 'Shoe Article',
                name: productName || article,
                barcode: barcode,
                costPrice: costVal || 0,
                sellingPrice: effectiveMaxSale || 0,
                minPrice: effectiveMinSale || 0,
                maxPrice: effectiveMaxSale || 0,
                salePrice: effectiveMaxSale || 0,
                minSalePrice: effectiveMinSale || 0,
                maxSalePrice: effectiveMaxSale || 0,
                brandName: currentBrandName,
                categoryName: currentCategoryName,
              }
            }
            companySettings={companySettings}
            onClose={() => setIsSideEndLabelOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBarcodeStickerOpen && (
          <BarcodeStickerModal
            product={
              product || {
                id: effectiveProductId,
                article: article || productName || 'Shoe Article',
                name: productName || article,
                barcode: barcode,
                costPrice: costVal || 0,
                sellingPrice: effectiveMaxSale || 0,
                minPrice: effectiveMinSale || 0,
                maxPrice: effectiveMaxSale || 0,
                salePrice: effectiveMaxSale || 0,
                minSalePrice: effectiveMinSale || 0,
                maxSalePrice: effectiveMaxSale || 0,
                brandName: currentBrandName,
                categoryName: currentCategoryName,
              }
            }
            companySettings={companySettings}
            onClose={() => setIsBarcodeStickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
