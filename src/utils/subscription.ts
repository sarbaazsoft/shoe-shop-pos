/**
 * Subscription Plan & Trial Countdown Utilities
 */

import type { SubscriptionPlan, SubscriptionType } from '../types.ts';

/**
 * Calculates remaining days from subscriptionEndDate.
 * - On the first day of registration (elapsed: 0 to <24h), returns 29 days remaining.
 * - On the 10th day (elapsed: 9 to 10 days), returns 20 days remaining.
 * - Scales smoothly down to 0 as expiration approaches.
 * - Returns 0 when expired.
 */
export function calculateDaysLeft(
  subscriptionEndDate:
    | string
    | Date
    | number
    | null
    | undefined
    | { subscriptionEndDate?: string | Date | number | null; subscription_end_date?: string | Date | number | null },
  currentDate: string | Date | number = new Date(),
  plan?: string
): number {
  let rawDateValue: string | Date | number | null | undefined;
  if (subscriptionEndDate instanceof Date) {
    rawDateValue = subscriptionEndDate;
  } else if (typeof subscriptionEndDate === 'string' || typeof subscriptionEndDate === 'number') {
    rawDateValue = subscriptionEndDate;
  } else if (subscriptionEndDate && typeof subscriptionEndDate === 'object') {
    rawDateValue = subscriptionEndDate.subscriptionEndDate ?? subscriptionEndDate.subscription_end_date;
  } else {
    rawDateValue = null;
  }
  if (!rawDateValue) return 0;

  const end = new Date(rawDateValue).getTime();
  const now = new Date(currentDate).getTime();
  if (isNaN(end) || isNaN(now)) return 0;

  const diffMs = end - now;
  if (diffMs <= 0) return 0;

  const msPerDay = 86400000; // 24 * 60 * 60 * 1000
  const diffDays = diffMs / msPerDay;

  const cleanPlan = String(plan || '').toLowerCase();
  const isPaidPlan =
    cleanPlan === '6_months' ||
    cleanPlan === '6_month' ||
    cleanPlan === 'six_months' ||
    cleanPlan.startsWith('6_month') ||
    cleanPlan === '1_year' ||
    cleanPlan === 'yearly' ||
    cleanPlan === 'year' ||
    cleanPlan === '1year' ||
    cleanPlan === 'one_year';

  const isFreeTier =
    !isPaidPlan &&
    (!plan ||
      cleanPlan === 'free_tier' ||
      cleanPlan === 'freetier' ||
      cleanPlan === 'free' ||
      cleanPlan === 'trial' ||
      cleanPlan.includes('free') ||
      cleanPlan.includes('trial') ||
      diffDays <= 31); // Default 30-day trial window

  if (isFreeTier) {
    // For a 30-day free tier:
    // Day 1 is the active start day with 29 full days remaining.
    // If diffDays is between 29.0 and 30.0 (or boundary 30 at registration instant), evaluate to 29.
    // On the 10th day (diffDays in [20.0, 21.0]), evaluates to 20 days remaining.
    // As expiration approaches (< 1 day remaining), evaluates to 0.
    if (diffDays >= 29) {
      return 29;
    }
    return Math.max(0, Math.floor(diffDays));
  }

  // For extended paid plans (6 months / 1 year)
  return Math.max(0, Math.floor(diffDays));
}

/**
 * Convenient alias matching requirements for daysLeft utility.
 */
export const daysLeft = calculateDaysLeft;

/**
 * Normalizes subscription plan / type strings into canonical values.
 */
export function normalizeSubscriptionType(
  raw?: string | null
): 'free_tier' | '6_months' | '1_year' {
  const clean = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    clean === 'free_tier' ||
    clean === 'freetier' ||
    clean === 'free' ||
    clean === 'trial' ||
    clean === 'free_trial' ||
    clean === '30_day_trial' ||
    clean === '30_days' ||
    clean === 'pro_trial' ||
    !clean
  ) {
    return 'free_tier';
  }
  if (
    clean === '6_months' ||
    clean === '6_month' ||
    clean === 'six_months' ||
    clean.startsWith('6_month')
  ) {
    return '6_months';
  }
  if (
    clean === '1_year' ||
    clean === 'yearly' ||
    clean === 'year' ||
    clean === '1year' ||
    clean === 'one_year'
  ) {
    return '1_year';
  }
  return 'free_tier';
}

export const normalizeSubscriptionPlan = (raw?: string | null): 'free_tier' | '6_MONTHS' | 'YEARLY' => {
  const norm = normalizeSubscriptionType(raw);
  if (norm === 'free_tier') return 'free_tier';
  if (norm === '6_months') return '6_MONTHS';
  return 'YEARLY';
};

/**
 * Helper to determine if a given plan or subscription type is a Free Trial
 */
export function isFreeTrial(
  plan?: SubscriptionPlan | SubscriptionType | string | null
): boolean {
  if (!plan) return true;
  const clean = String(plan).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    clean === '6_months' ||
    clean === '6_month' ||
    clean === 'six_months' ||
    clean.startsWith('6_month') ||
    clean === '1_year' ||
    clean === 'yearly' ||
    clean === 'year' ||
    clean === '1year' ||
    clean === 'one_year'
  ) {
    return false;
  }
  return (
    clean === 'free_tier' ||
    clean === 'freetier' ||
    clean === 'free' ||
    clean === 'trial' ||
    clean === 'free_trial' ||
    clean === '30_day_trial' ||
    clean === '30_days' ||
    clean === 'pro_trial' ||
    clean.includes('trial') ||
    clean.includes('free')
  );
}

/**
 * Returns a human-friendly label for a subscription plan or type.
 */
export function getSubscriptionLabel(
  plan?: SubscriptionPlan | SubscriptionType | string | null
): string {
  if (isFreeTrial(plan)) {
    return '30-Day Free Trial';
  }
  const normalized = normalizeSubscriptionType(plan);
  switch (normalized) {
    case 'free_tier':
      return '30-Day Free Trial';
    case '6_months':
      return '6 Months Plan';
    case '1_year':
      return 'Yearly Plan (1 Year)';
    default:
      return '30-Day Free Trial';
  }
}

/**
 * Returns a concise label for badge/chip displays (e.g. '30-Day Free Tier', '6 Months', 'Yearly').
 */
export function getSubscriptionShortLabel(
  plan?: SubscriptionPlan | SubscriptionType | string | null
): string {
  if (isFreeTrial(plan)) {
    return '30-Day Free Tier';
  }
  const normalized = normalizeSubscriptionType(plan);
  switch (normalized) {
    case 'free_tier':
      return 'Free Tier';
    case '6_months':
      return '6 Months';
    case '1_year':
      return 'Yearly';
    default:
      return 'Free Tier';
  }
}

export type RenewalTemplateType =
  | 'UPGRADE'
  | 'UPGRADE_FROM_6_MONTHS'
  | 'RENEWAL'
  | 'EXTENSION'
  | 'REACTIVATION';

export interface RenewalTemplateChip {
  type: RenewalTemplateType;
  label: string;
}

export const RENEWAL_TEMPLATE_CHIPS: RenewalTemplateChip[] = [
  { type: 'UPGRADE', label: 'Upgrading Free Tier' },
  { type: 'RENEWAL', label: 'Standard Renewal' },
  { type: 'REACTIVATION', label: 'Urgent Reactivation' },
];

/**
 * Returns dynamically tailored chips based on store's current subscription plan and status.
 * Eliminates redundant upgrade chips for plans the store already holds.
 */
export function getAvailableTemplateChips(
  currentPlan?: string | null,
  status?: string | null,
  selectedPlan: '6_MONTHS' | 'YEARLY' = 'YEARLY'
): RenewalTemplateChip[] {
  const cleanStatus = String(status || '').toUpperCase();
  const isExpired = cleanStatus === 'EXPIRED';
  const normCurrent = normalizeSubscriptionPlan(currentPlan);

  if (isExpired) {
    return [
      { type: 'REACTIVATION', label: 'Urgent Reactivation' },
      { type: 'RENEWAL', label: 'Standard Renewal' },
    ];
  }

  if (normCurrent === 'YEARLY') {
    // Already active on 1-Year: user is on highest tier, show renewal / extension only
    return [
      { type: 'RENEWAL', label: 'Standard Renewal' },
      { type: 'EXTENSION', label: 'Extend +1 Year' },
    ];
  }

  if (normCurrent === '6_MONTHS') {
    // Already active on 6-Months: can renew 6-month or upgrade to 1-year
    if (selectedPlan === 'YEARLY') {
      return [
        { type: 'UPGRADE_FROM_6_MONTHS', label: 'Upgrade to 1-Year' },
        { type: 'RENEWAL', label: 'Renew 6-Month Plan' },
      ];
    }
    return [
      { type: 'RENEWAL', label: 'Renew 6-Month Plan' },
      { type: 'UPGRADE_FROM_6_MONTHS', label: 'Upgrade to 1-Year' },
    ];
  }

  // Free Tier / Trial evaluation
  return [
    { type: 'UPGRADE', label: 'Upgrading Free Tier' },
    { type: 'RENEWAL', label: 'Standard Renewal' },
  ];
}

/**
 * Returns the exact dynamic payment message template based on template type, plan selection, and current plan.
 */
export function getRenewalMessageTemplate(
  type: RenewalTemplateType,
  selectedPlan: '6_MONTHS' | 'YEARLY' = 'YEARLY',
  currentPlan?: string | null
): string {
  const planTerm = selectedPlan === '6_MONTHS' ? '6 Months' : '1 Year';
  const normCurrent = normalizeSubscriptionPlan(currentPlan);

  switch (type) {
    case 'UPGRADE':
      // If store is already paid, adjust appropriately
      if (normCurrent === '6_MONTHS' && selectedPlan === 'YEARLY') {
        return `Hi Admin, currently on 6-Month Plan and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]`;
      }
      if (normCurrent === 'YEARLY') {
        return `Hi Admin, renewing store's 1 Year subscription. Payment Ref ID: [Insert Ref ID]`;
      }
      return `Hi Admin, completed Free Tier evaluation and upgrading to ${planTerm} Premium Plan for my store. Payment Ref ID: [Insert Ref ID]`;

    case 'UPGRADE_FROM_6_MONTHS':
      return `Hi Admin, currently on 6-Month Plan and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]`;

    case 'EXTENSION':
      return `Hi Admin, extending active 1-Year Premium License (+12 Months) for my store. Payment Ref ID: [Insert Ref ID]`;

    case 'RENEWAL':
      return `Hi Admin, renewing store's ${planTerm} subscription. Payment Ref ID: [Insert Ref ID]`;

    case 'REACTIVATION':
      return `Hi Admin, store subscription expired. Paid via online transfer (Ref ID: [Insert Ref ID]). Please reactivate POS access.`;

    default:
      return `Hi Admin, renewing store's ${planTerm} subscription. Payment Ref ID: [Insert Ref ID]`;
  }
}

/**
 * Automatically determines the default renewal template type based on store status, current plan, and selected extension plan.
 */
export function resolveDefaultRenewalTemplateType(
  status?: string | null,
  currentPlan?: string | null,
  selectedPlan: '6_MONTHS' | 'YEARLY' = 'YEARLY'
): RenewalTemplateType {
  const cleanStatus = String(status || '').toUpperCase();
  if (cleanStatus === 'EXPIRED') {
    return 'REACTIVATION';
  }
  const norm = normalizeSubscriptionPlan(currentPlan);
  if (norm === 'free_tier') {
    return 'UPGRADE';
  }
  if (norm === '6_MONTHS') {
    if (selectedPlan === 'YEARLY') {
      return 'UPGRADE_FROM_6_MONTHS';
    }
    return 'RENEWAL';
  }
  if (norm === 'YEARLY') {
    return 'RENEWAL';
  }
  return 'RENEWAL';
}


