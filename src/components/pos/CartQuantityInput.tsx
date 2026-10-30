import React, { useState, useEffect, useRef } from 'react';

export interface CartQuantityInputItem {
  productId: number;
  article: string;
  name?: string;
  quantity: number;
  totalStock: number;
  pairsPerCarton?: number;
}

interface CartQuantityInputProps {
  item: CartQuantityInputItem;
  isWholesaleStore: boolean;
  allowHalfCarton?: boolean;
  minSaleQuantity?: number;
  onCommitQuantity: (productId: number, exactQty: number) => void;
  onValidationAlert: (message: string, type?: 'warning' | 'error') => void;
  disabled?: boolean;
}

export const CartQuantityInput: React.FC<CartQuantityInputProps> = ({
  item,
  isWholesaleStore,
  allowHalfCarton = true,
  minSaleQuantity,
  onCommitQuantity,
  onValidationAlert,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState<string>(String(item.quantity));
  const isEditingRef = useRef(false);

  // Sync internal input value whenever item.quantity changes from external sources (e.g., stepper buttons)
  useEffect(() => {
    if (!isEditingRef.current) {
      setInputValue(String(item.quantity));
    }
  }, [item.quantity]);

  const lotSize = Number(item.pairsPerCarton || 12) === 16 ? 16 : 12;
  const allowHalf = Boolean(allowHalfCarton);
  const wholesaleStep = minSaleQuantity !== undefined ? minSaleQuantity : (allowHalf ? (lotSize / 2) : lotSize);
  const cartonDesc = allowHalf ? '0.5 Carton' : '1 Carton';

  const handleCommit = () => {
    isEditingRef.current = false;
    const rawVal = parseInt(inputValue.trim(), 10);

    // If input is empty, NaN, or non-positive
    if (isNaN(rawVal) || rawVal <= 0) {
      if (isWholesaleStore) {
        const fallback = Math.min(wholesaleStep, Math.max(1, item.totalStock));
        setInputValue(String(fallback));
        onCommitQuantity(item.productId, fallback);
        onValidationAlert(
          `Invalid Quantity: Minimum order quantity for this item is ${wholesaleStep} pairs (${cartonDesc}).`,
          'warning'
        );
      } else {
        const fallback = 1;
        setInputValue(String(fallback));
        onCommitQuantity(item.productId, fallback);
      }
      return;
    }

    // --- RETAIL STORE VALIDATION ---
    if (!isWholesaleStore) {
      if (rawVal < 1) {
        setInputValue('1');
        onCommitQuantity(item.productId, 1);
        onValidationAlert('Minimum order quantity is 1 pair.', 'warning');
        return;
      }
      if (rawVal > item.totalStock) {
        setInputValue(String(item.totalStock));
        onCommitQuantity(item.productId, item.totalStock);
        onValidationAlert(
          `Stock limit for "${item.article || item.name}" is ${item.totalStock} pairs.`,
          'warning'
        );
        return;
      }
      // Valid retail quantity
      setInputValue(String(rawVal));
      onCommitQuantity(item.productId, rawVal);
      return;
    }

    // --- WHOLESALE STORE VALIDATION ---
    const minAllowedPairs = wholesaleStep;

    // 1. Visual Minimum Quantity Notification:
    // If entered quantity is lower than minimum allowed threshold
    if (rawVal < minAllowedPairs) {
      const snapValue = Math.min(minAllowedPairs, Math.max(1, item.totalStock));
      setInputValue(String(snapValue));
      onCommitQuantity(item.productId, snapValue);
      onValidationAlert(
        `Invalid Quantity: Minimum order quantity for this item is ${minAllowedPairs} pairs (${cartonDesc}).`,
        'warning'
      );
      return;
    }

    // Check against total available stock
    if (rawVal > item.totalStock) {
      // Find highest multiple of wholesale step that fits within available stock
      const maxPossibleMultiple = Math.floor(item.totalStock / wholesaleStep) * wholesaleStep;
      const snapValue = maxPossibleMultiple >= minAllowedPairs
        ? maxPossibleMultiple
        : Math.min(item.totalStock, minAllowedPairs);

      setInputValue(String(snapValue));
      onCommitQuantity(item.productId, snapValue);
      onValidationAlert(
        `Stock limit for "${item.article || item.name}" is ${item.totalStock} pairs.`,
        'warning'
      );
      return;
    }

    // 2. Step Multiple Validation for Manual Pair Inputs:
    // Validate if the typed number is a direct multiple of the carton step
    if (rawVal % wholesaleStep !== 0) {
      // Round up/down to nearest valid step
      const nearestStep = Math.round(rawVal / wholesaleStep) * wholesaleStep;
      let validQty = Math.max(minAllowedPairs, nearestStep);

      // Verify not exceeding stock
      if (validQty > item.totalStock) {
        const stockClampedMultiple = Math.floor(item.totalStock / wholesaleStep) * wholesaleStep;
        validQty = stockClampedMultiple >= minAllowedPairs
          ? stockClampedMultiple
          : Math.min(item.totalStock, minAllowedPairs);
      }

      setInputValue(String(validQty));
      onCommitQuantity(item.productId, validQty);
      onValidationAlert(
        `Quantity must be added in multiples of ${cartonDesc} (${wholesaleStep} pairs)`,
        'warning'
      );
      return;
    }

    // 3. Perfect multiple and within valid range
    setInputValue(String(rawVal));
    onCommitQuantity(item.productId, rawVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // Blur triggers handleCommit
    } else if (e.key === 'Escape') {
      isEditingRef.current = false;
      setInputValue(String(item.quantity));
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-center">
      <input
        type="number"
        min={isWholesaleStore ? wholesaleStep : 1}
        max={item.totalStock}
        step={isWholesaleStore ? wholesaleStep : 1}
        disabled={disabled}
        value={inputValue}
        onFocus={() => {
          isEditingRef.current = true;
        }}
        onChange={(e) => {
          isEditingRef.current = true;
          setInputValue(e.target.value);
        }}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        className="w-14 text-center font-bold text-slate-900 dark:text-white text-xs font-mono bg-white dark:bg-[#0A0E1A] border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors shadow-2xs"
        title={
          isWholesaleStore
            ? `Available: ${item.totalStock} pairs. Minimum: ${wholesaleStep} pairs (${cartonDesc}). Steps: Multiples of ${wholesaleStep} pairs.`
            : `Available: ${item.totalStock} pairs. Type pairs quantity directly.`
        }
      />
      <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 ml-1 font-mono">
        pr
      </span>
    </div>
  );
};
