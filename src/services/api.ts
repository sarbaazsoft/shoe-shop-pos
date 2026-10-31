// Central API service with JWT token injection, tenant isolation, and offline catalog fallback
import { cacheCatalogOffline, deleteCachedProductOffline, lookupCachedProductOffline, searchCachedProductsOffline } from '../utils/offlineDb.ts';
import { transformKeysToCamelCase } from '../utils/caseTransformer.ts';
import type { ProductFormValues, TrialActivation, PlatformNotification, PlatformNotificationType, AiProductSuggestionResult, GroupedNotificationsResponse, AllNotificationsResponse, HistoricalNotificationItem } from '../types.ts';

const TOKEN_KEY = 'pos_auth_token';
const ALT_TOKEN_KEY = 'shoe_pos_jwt_token';
const USER_KEY = 'pos_current_user';
const ALT_USER_KEY = 'shoe_pos_user';
const ACTIVE_TENANT_ID_KEY = 'shoe_pos_active_tenant_id';

function decodeTokenPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getActiveTenantId(): number | null {
  if (typeof window !== 'undefined' && (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'))) {
    return null;
  }
  const token = getAuthToken();
  const payload = token ? decodeTokenPayload(token) : null;
  const tokenRole = String(payload?.role || '').toUpperCase();
  const tokenTenantId = Number(payload?.tenantId ?? payload?.tenant_id);
  if (tokenRole && tokenRole !== 'SUPERADMIN' && Number.isSafeInteger(tokenTenantId) && tokenTenantId > 0) {
    return tokenTenantId;
  }
  const storedUser = getStoredUser();
  const storedRole = String(storedUser?.originalRole || storedUser?.role || '').toUpperCase();
  const storedTenantId = Number(storedUser?.tenantId ?? storedUser?.tenant_id);
  if (storedRole && storedRole !== 'SUPERADMIN' && Number.isSafeInteger(storedTenantId) && storedTenantId > 0) {
    return storedTenantId;
  }
  const queryId = (() => {
    if (typeof window === 'undefined') return 0;
    const sp = new URLSearchParams(window.location.search);
    const qVal = sp.get('tenantId') || sp.get('storeId') || sp.get('tenant_id') || sp.get('store_id');
    const num = Number(qVal);
    return Number.isSafeInteger(num) && num > 0 ? num : 0;
  })();
  if (queryId > 0) return queryId;
  const selectedId = tokenRole === 'SUPERADMIN' ? Number(localStorage.getItem(ACTIVE_TENANT_ID_KEY)) : 0;
  return Number.isSafeInteger(selectedId) && selectedId > 0 ? selectedId : null;
}

export function setActiveTenantId(tenantId: number | null) {
  const token = getAuthToken();
  const payload = token ? decodeTokenPayload(token) : null;
  if (String(payload?.role || '').toUpperCase() === 'SUPERADMIN' && Number.isSafeInteger(tenantId) && Number(tenantId) > 0) {
    localStorage.setItem(ACTIVE_TENANT_ID_KEY, String(tenantId));
    return;
  }
  // Store users get tenant context from JWT; unauthenticated PWA launches use URL tenantId.
  localStorage.removeItem(ACTIVE_TENANT_ID_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ALT_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ALT_TOKEN_KEY, token);
}

export function removeAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ALT_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ALT_USER_KEY);
}

export function setAuthSession(token: string, user: any) {
  setAuthToken(token);
  if (String(user?.role || '').toUpperCase() !== 'SUPERADMIN') {
    setActiveTenantId(Number(user?.tenantId || 0) || null);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ALT_USER_KEY, JSON.stringify(user));
}

export function clearAllSessionState(): void {
  removeAuthToken();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(ACTIVE_TENANT_ID_KEY);
      localStorage.removeItem('cached_company_settings');
      localStorage.removeItem('cached_store_name');
      localStorage.removeItem('pos_read_notifications');
      localStorage.removeItem('pos_superadmin_read_notifs');
      localStorage.removeItem('sammi_chat_history');
      localStorage.removeItem('pos_barcode_tag_options');
      localStorage.removeItem('pos_last_synced_at');
      localStorage.removeItem('pos_welcome_partner_dismissed');

      // Clear any tenant-scoped or user-scoped cache keys without removing device preferences like pos_theme or remembered accounts
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('pos_welcome_partner_dismissed_') ||
          key.startsWith('pos_dashboard_visited_') ||
          key.startsWith('cached_company_settings') ||
          key.startsWith('cached_store_name') ||
          key.startsWith('pos_read_notifs_')
        )) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.clear();
    } catch {}
  }
}

export function clearAuthSession() {
  clearAllSessionState();
}

/**
 * Tells the server to terminate the current session (revokes the token, clears auth cookies).
 * Fire-and-forget on purpose: logging out in the UI must be immediate and must never be blocked
 * by the network. `keepalive` lets the request finish even if the page is navigating away.
 * The token is read synchronously, so callers can clear local state right after calling this.
 */
export function revokeSessionOnServer(): void {
  const token = getAuthToken();
  if (!token || typeof fetch === 'undefined') return;
  try {
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    }).catch(() => {});
  } catch {
    // Never let a logout request failure surface to the user.
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(ALT_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface RequestOptions extends RequestInit {
  body?: any;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const activeTenantId = getActiveTenantId();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  if (activeTenantId) headers['X-Tenant-Id'] = String(activeTenantId);

  const { body: rawBody, ...restOptions } = options;
  const method = (restOptions.method || 'GET').toUpperCase();
  const serializedBody =
    rawBody === undefined || rawBody === null
      ? undefined
      : typeof rawBody === 'object'
      ? JSON.stringify(rawBody)
      : typeof rawBody === 'number' || typeof rawBody === 'boolean'
      ? JSON.stringify({ value: rawBody })
      : (rawBody as BodyInit);

  const config: RequestInit = {
    ...restOptions,
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    ...(serializedBody !== undefined ? { body: serializedBody } : {}),
  };

  let response: Response | null = null;
  let contentType = '';
  let lastNetworkError: any = null;

  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Retry transient network errors or 502/503/504 gateway responses when online; fail fast when offline
  const retryDelays = isBrowserOffline ? [0] : [0, 400, 800, 1400, 2200, 3200];
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, retryDelays[attempt]));
    }
    try {
      const candidate = await fetch(`/api${endpoint}`, config);
      const candType = candidate.headers.get('content-type') || '';
      if (
        (candidate.status === 502 || candidate.status === 503 || candidate.status === 504) &&
        attempt < retryDelays.length - 1
      ) {
        continue;
      }
      response = candidate;
      contentType = candType;
      lastNetworkError = null;
      break;
    } catch (err: any) {
      lastNetworkError = err;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        break;
      }
    }
  }

  // If an iframe proxy or service worker intercepts POST/PUT/PATCH/DELETE or custom headers with non-JSON 403/error
  // or network reset, automatically retry via GET RPC query bridge so authentication & mutations succeed reliably.
  if (
    !isBrowserOffline &&
    (!response || (!contentType.includes('application/json') && !response.ok))
  ) {
    const fallbackDelays = [0, 600, 1400];
    for (let fbAttempt = 0; fbAttempt < fallbackDelays.length; fbAttempt++) {
      if (fallbackDelays[fbAttempt] > 0) {
        await new Promise((r) => setTimeout(r, fallbackDelays[fbAttempt]));
      }
      try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const fallbackParams = new URLSearchParams();
        if (method !== 'GET') {
          fallbackParams.set('__method', method);
        }
        if (typeof serializedBody === 'string' && serializedBody.length < 6000) {
          fallbackParams.set('__body', serializedBody);
        }
        if (token) {
          fallbackParams.set('__token', token);
        }
        if (activeTenantId) fallbackParams.set('__tenantId', String(activeTenantId));
        fallbackParams.set('_t', String(Date.now()));

        const fallbackUrl = `/api${endpoint}${separator}${fallbackParams.toString()}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const fallbackType = fallbackRes.headers.get('content-type') || '';
        if (
          (fallbackRes.status === 502 || fallbackRes.status === 503 || fallbackRes.status === 504) &&
          fbAttempt < fallbackDelays.length - 1
        ) {
          continue;
        }
        if (!response || fallbackType.includes('application/json') || fallbackRes.ok) {
          response = fallbackRes;
          contentType = fallbackType;
          lastNetworkError = null;
        }
        break;
      } catch (fallbackErr: any) {
        if (!lastNetworkError) {
          lastNetworkError = fallbackErr;
        }
      }
    }
  }

  if (!response) {
    throw new Error(
      lastNetworkError?.message && !String(lastNetworkError.message).includes('Failed to fetch')
        ? lastNetworkError.message
        : 'Server is temporarily reconnecting. Please try again in a moment.'
    );
  }

  // Handle 204 No Content / 205 Reset Content safely (no body expected)
  if (response.status === 204 || response.status === 205) {
    return {} as T;
  }

  let data: any = null;
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    data = await response.json().catch(() => ({}));
  } else {
    // Attempt parsing JSON in case content-type was omitted or returned as text/plain
    const textBody = await response.text().catch(() => '');
    if (!textBody.trim()) {
      data = {};
    } else {
      try {
        data = JSON.parse(textBody);
      } catch {
        if (!response.ok) {
          throw new Error(`Server Error (${response.status}): Endpoint /api${endpoint} unavailable.`);
        }
        throw new Error(`Unexpected non-JSON response from server on /api${endpoint}.`);
      }
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/auth/') && !endpoint.includes('/login')) {
      clearAuthSession();
    }
    if (data?.code === 'SUBSCRIPTION_EXPIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tenant:subscription-expired', { detail: data }));
    }
    const apiError = new Error(data.error || `API Error (${response.status})`) as Error & {
      code?: string;
      stores?: Array<{ tenantId: number; name: string }>;
      status?: number;
    };
    apiError.code = data.code;
    apiError.stores = Array.isArray(data.stores) ? data.stores : undefined;
    apiError.status = response.status;
    throw apiError;
  }

  return transformKeysToCamelCase<T>(data);
}

export const api = {
  // Multi-Tenant SaaS & Onboarding Endpoints
  saas: {
    resolve: (targetTenantId?: number | string | null) => {
      let q = '';
      if (targetTenantId) {
        q = `?tenantId=${encodeURIComponent(targetTenantId)}&storeId=${encodeURIComponent(targetTenantId)}`;
      } else if (typeof window !== 'undefined' && window.location.search) {
        q = window.location.search;
      }
      return apiFetch(`/saas/resolve${q}`);
    },
    getPublicStats: () => apiFetch<{
      stores: number;
      products: number;
      platformRevenue: number;
      invoicesToday: number;
      superAdminEmail?: string;
      superAdminPhone?: string;
    }>('/saas/public-stats'),
    getPlatformOwner: () => apiFetch<{
      name: string;
      email: string;
      phone?: string;
    }>('/saas/platform-owner'),
    submitStoreRequest: (data: {
      name?: string;
      email?: string;
      phone?: string;
      storeName?: string;
      ownerName?: string;
      ownerEmail?: string;
      ownerPhone?: string;
      password?: string;
      confirmPassword?: string;
      address?: string;
      plan?: string;
      businessType?: 'RETAIL' | 'WHOLESALE' | string;
      pricingMode?: 'FIXED' | 'NEGOTIABLE' | string;
      minSellingQuantity?: number | string;
      allowHalfCarton?: boolean;
      createCashier?: boolean;
      cashierName?: string;
      cashierEmail?: string;
      cashierPassword?: string;
      cashierPhone?: string;
      currency?: string;
      currencySymbol?: string;
      taxId?: string;
      taxRate?: number;
      invoiceFooter?: string;
    }) => apiFetch<{
      success: boolean;
      trialActivated?: boolean;
      tenantId?: number;
      storeName?: string;
      ownerName?: string;
      ownerEmail?: string;
      initialPassword?: string;
      cashierName?: string | null;
      cashierEmail?: string | null;
      cashierPassword?: string | null;
      address?: string;
      invoiceFooter?: string;
      currency?: string;
      currencySymbol?: string;
      loginUrl?: string;
      subscriptionPlan?: string;
      subscriptionStartDate?: string;
      subscriptionEndDate?: string;
      trialDays?: number;
      requestId?: number;
      superAdminEmail?: string;
      superAdminPhone?: string;
      token?: string;
      user?: any;
      onboardingCompleted?: boolean;
      message: string;
    }>('/saas/store-requests', { method: 'POST', body: data }),
    checkEmailAvailability: (email: string) =>
      apiFetch<{
        available: boolean;
        validFormat: boolean;
        reason?: string;
        message?: string;
      }>(`/saas/check-email?email=${encodeURIComponent(email.trim().toLowerCase())}`),
    registerTrial: (data: { name: string; email: string; phone?: string; password: string; confirmPassword?: string }) =>
      apiFetch<{
        success: boolean;
        token: string;
        user: any;
        tenantId: number;
        storeName: string;
        loginUrl: string;
        onboardingUrl: string;
        redirectUrl: string;
        message: string;
      }>('/saas/store-requests', { method: 'POST', body: data }),
    getManifest: (tenantId: number) => apiFetch(`/tenants/manifest?tenantId=${encodeURIComponent(String(tenantId))}`),
    getOnboarding: (tenantId?: number) => {
      const query = tenantId ? `?tenantId=${encodeURIComponent(String(tenantId))}` : '';
      return apiFetch(`/tenants/onboarding${query}`, {
        headers: tenantId ? { 'X-Tenant-Id': String(tenantId) } : undefined,
      });
    },
    completeOnboarding: (data: any, tenantId?: number) => {
      const query = tenantId ? `?tenantId=${encodeURIComponent(String(tenantId))}` : '';
      return apiFetch(`/tenants/onboarding${query}`, {
        method: 'POST',
        body: tenantId ? { ...data, tenantId } : data,
        headers: tenantId ? { 'X-Tenant-Id': String(tenantId) } : undefined,
      });
    },

  },

  // SuperAdmin Control Panel Endpoints
  superAdmin: {
    getOverview: () => apiFetch('/superadmin/overview'),
    getSaaSMetrics: () => apiFetch('/superadmin/saas-metrics'),
    getTrialActivations: (params?: { search?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return apiFetch<{
        trials: TrialActivation[];
        summary: {
          totalTrials: number;
          activeTrials: number;
          expiredTrials: number;
          todayTrials: number;
        };
      }>(`/superadmin/trial-activations${queryStr}`);
    },
    extendTrialActivation: (id: number, days = 30) =>
      apiFetch<{
        success: boolean;
        message: string;
        trial: TrialActivation;
      }>(`/superadmin/trial-activations/${id}/extend`, {
        method: 'POST',
        body: { days },
      }),
    toggleTenantStatus: (tenantId: number, status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED') =>
      apiFetch(`/superadmin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    updateTenantSubscription: (
      tenantId: number,
      data: {
        storeName?: string;
        ownerEmail?: string;
        ownerPhone?: string;
        subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string;
        subscriptionStartDate?: string;
        subscriptionEndDate?: string;
        subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
        renewFromNow?: boolean;
      }
    ) =>
      apiFetch(`/superadmin/tenants/${tenantId}/subscription`, {
        method: 'PATCH',
        body: data,
      }),
    deleteTenant: (tenantId: number) =>
      apiFetch(`/superadmin/tenants/${tenantId}/delete`, {
        method: 'POST',
      }),
    exportTenantSql: (tenantId: number) =>
      apiFetch<{
        success: boolean;
        filename: string;
        storeName: string;
        totalRows: number;
        sql: string;
      }>(`/superadmin/tenants/${tenantId}/export-sql`),
    exportPlatformSql: () =>
      apiFetch<{
        success: boolean;
        filename: string;
        totalRows: number;
        sql: string;
      }>('/superadmin/export-sql'),
    importPlatformSql: (sqlContent: string) =>
      apiFetch<{
        success: boolean;
        message: string;
        counts?: {
          stores: number;
          products: number;
          purchases: number;
          sales: number;
          customers: number;
          returns: number;
        };
        timestamp?: string;
      }>('/superadmin/import-sql', {
        method: 'POST',
        body: { sql: sqlContent, sqlContent },
      }),
    createTenant: (data: {
      storeName: string;
      ownerName: string;
      ownerEmail: string;
      password?: string;
      ownerPhone?: string;
      currency?: string;
      businessType?: 'RETAIL' | 'WHOLESALE' | string;
      pricingMode?: 'FIXED' | 'NEGOTIABLE' | string;
      minSellingQuantity?: number;
      allowHalfCarton?: boolean;
      subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string;
      subscriptionStartDate?: string;
      subscriptionEndDate?: string;
    }) => apiFetch('/superadmin/tenants', { method: 'POST', body: data }),
    approveRequest: (
      requestId: number,
      data?: {
        password?: string;
        storeName?: string;
        businessType?: 'RETAIL' | 'WHOLESALE' | string;
        pricingMode?: 'FIXED' | 'NEGOTIABLE' | string;
        minSellingQuantity?: number;
        allowHalfCarton?: boolean;
        subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string;
      }
    ) =>
      apiFetch(`/superadmin/store-requests/${requestId}/approve`, {
        method: 'POST',
        body: data || {},
      }),
    rejectRequest: (requestId: number) =>
      apiFetch(`/superadmin/store-requests/${requestId}/reject`, {
        method: 'POST',
      }),
    updateRequest: (
      requestId: number,
      data: {
        status?: 'PENDING' | 'APPROVED' | 'REJECTED';
        storeName?: string;
        ownerEmail?: string;
        ownerPhone?: string;
        plan?: string;
      }
    ) =>
      apiFetch(`/superadmin/store-requests/${requestId}`, {
        method: 'PATCH',
        body: data,
      }),
    deleteRequest: (requestId: number) =>
      apiFetch(`/superadmin/store-requests/${requestId}/delete`, {
        method: 'POST',
      }),
    getNotifications: () =>
      apiFetch<{ notifications: PlatformNotification[] }>('/superadmin/notifications'),
    sendNotification: (data: {
      tenantId?: number | null;
      targetRole?: 'ALL' | 'ADMIN' | 'CASHIER' | 'SUPERADMIN';
      title: string;
      message: string;
      type?: PlatformNotificationType;
      actionUrl?: string;
      actionLabel?: string;
      expiresAt?: string | null;
    }) =>
      apiFetch<{ success: boolean; message: string; notification: PlatformNotification }>(
        '/superadmin/notifications',
        { method: 'POST', body: data }
      ),
    deleteNotification: (id: number) =>
      apiFetch<{ success: boolean; message: string }>(`/superadmin/notifications/${id}`, {
        method: 'DELETE',
      }),
  },

  install: {
    status: () => apiFetch<any>('/install/status'),
    bootstrap: (data: { name: string; email: string; password: string; phone?: string; whatsapp?: string }) =>
      apiFetch('/install/bootstrap', { method: 'POST', body: data }),
    installPlatform: (data: { name: string; email: string; password: string; phone?: string; whatsapp?: string }) =>
      apiFetch('/install/install-platform', { method: 'POST', body: data }),
    reset: (password: string, email?: string, dropTables?: boolean) =>
      apiFetch('/install/reset', { method: 'POST', body: { password, email, dropTables } }),
    dropTables: (password: string) =>
      apiFetch('/install/drop-tables', { method: 'POST', body: { password } }),
    lock: (password?: string) =>
      apiFetch('/install/lock', { method: 'POST', body: { password } }),
  },
  auth: {
    login: (credentials: any) => {
      const rawTid = Number(credentials?.tenantId ?? credentials?.tenant_id ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      return apiFetch('/auth/login', {
        method: 'POST',
        body: {
          ...credentials,
          ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
        },
        ...(cleanTenantId ? { headers: { 'X-Tenant-Id': String(cleanTenantId) } } : {}),
      });
    },
    getStoreCredentials: (tenantId?: number) => {
      const query = tenantId && tenantId > 0 ? `?tenantId=${tenantId}` : '';
      return apiFetch<any>(`/auth/store-credentials${query}`);
    },
    signup: (data: any) => apiFetch('/auth/signup', { method: 'POST', body: data }),
    forgotPassword: (data: { email: string; tenantId?: number | null; origin?: string }) => {
      const rawTid = Number(data?.tenantId ?? getActiveTenantId() ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      return apiFetch<{
        success?: boolean;
        emailSent?: boolean;
        email?: string;
        resetLink?: string;
        resetToken?: string;
        expiresAt?: string;
        message: string;
      }>('/auth/send-reset-link', {
        method: 'POST',
        body: {
          ...data,
          tenantId: cleanTenantId,
          origin: data.origin || (typeof window !== 'undefined' ? window.location.origin : ''),
        },
        ...(cleanTenantId ? { headers: { 'X-Tenant-Id': String(cleanTenantId) } } : {}),
      });
    },
    sendResetLink: (data: { email: string; tenantId?: number | null; origin?: string }) => {
      const rawTid = Number(data?.tenantId ?? getActiveTenantId() ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      return apiFetch<{
        success: boolean;
        emailSent: boolean;
        emailProvider?: string;
        emailPreviewUrl?: string | null;
        email: string;
        resetLink: string;
        resetToken: string;
        expiresAt: string;
        message: string;
      }>('/auth/send-reset-link', {
        method: 'POST',
        body: {
          ...data,
          tenantId: cleanTenantId,
          origin: data.origin || (typeof window !== 'undefined' ? window.location.origin : ''),
        },
        ...(cleanTenantId ? { headers: { 'X-Tenant-Id': String(cleanTenantId) } } : {}),
      });
    },
    verifyResetToken: (token: string) =>
      apiFetch<{
        valid: boolean;
        email?: string;
        name?: string;
        role?: string;
        tenantId?: number;
        expiresAt?: string;
      }>(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`),
    resetPassword: (data: {
      email: string;
      token: string;
      newPassword: string;
      tenantId?: number | null;
    }) => {
      const rawTid = Number(data?.tenantId ?? getActiveTenantId() ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      return apiFetch('/auth/reset-password', {
        method: 'POST',
        body: { ...data, tenantId: cleanTenantId },
        ...(cleanTenantId ? { headers: { 'X-Tenant-Id': String(cleanTenantId) } } : {}),
      });
    },
    changePassword: (data: { currentPassword?: string; newPassword: string; confirmPassword?: string }) =>
      apiFetch('/auth/change-password', { method: 'PUT', body: data }),
    me: () => apiFetch('/auth/me'),
    updateProfile: (data: any) => apiFetch('/auth/profile', { method: 'PUT', body: data }),
    listUsers: () => apiFetch('/auth/users'),
    createUser: (data: any) => apiFetch('/auth/users', { method: 'POST', body: data }),
    updateUser: (id: number, data: any) => apiFetch(`/auth/users/${id}`, { method: 'PUT', body: data }),
    approveUser: (id: number, status: 'APPROVED' | 'PENDING') =>
      apiFetch(`/auth/users/${id}/status`, { method: 'PATCH', body: { status } }),
    deleteUser: (id: number) => apiFetch(`/auth/users/${id}`, { method: 'DELETE' }),
    listApiTokens: () => apiFetch('/auth/api-tokens'),
    createApiToken: (name: string) => apiFetch('/auth/api-tokens', { method: 'POST', body: { name } }),
    deleteApiToken: (id: number) => apiFetch(`/auth/api-tokens/${id}`, { method: 'DELETE' }),
  },
  products: {
    list: async (params?: { search?: string; category?: string; brand?: string; lowStock?: boolean; lowStockOnly?: boolean; limit?: number }) => {
      const activeTenantId = getActiveTenantId();
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      if (params?.brand) qs.set('brand', params.brand);
      if (params?.lowStock || params?.lowStockOnly) qs.set('lowStockOnly', 'true');
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';

      const fallbackFromOfflineCache = async () => {
        let cached = await searchCachedProductsOffline(
          params?.search || '',
          activeTenantId,
          params?.limit || 500
        );
        if (params?.brand) {
          const b = params.brand.toLowerCase().trim();
          cached = cached.filter(
            (p: any) => String(p.brandName || p.brand_name || p.brand || '').toLowerCase() === b
          );
        }
        if (params?.category) {
          const c = params.category.toLowerCase().trim();
          cached = cached.filter(
            (p: any) => String(p.categoryName || p.category_name || p.category || '').toLowerCase() === c
          );
        }
        if (params?.lowStock || params?.lowStockOnly) {
          cached = cached.filter(
            (p: any) => (Number(p.totalStock ?? p.total_stock ?? 0) || 0) <= (Number(p.lowStockLimit ?? 5) || 5)
          );
        }
        return { products: cached, offline: true };
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return fallbackFromOfflineCache();
      }

      try {
        const res = await apiFetch<any>(`/products${query}`);
        if (res && Array.isArray(res.products) && res.products.length > 0) {
          cacheCatalogOffline(res.products, activeTenantId).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          msg.includes('Failed to fetch') ||
          msg.includes('temporarily reconnecting') ||
          msg.includes('Network')
        ) {
          return fallbackFromOfflineCache();
        }
        throw err;
      }
    },
    scanBarcode: async (code: string) => {
      const activeTenantId = getActiveTenantId();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeTenantId);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeTenantId).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeTenantId).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    lookupBarcode: async (code: string) => {
      const activeTenantId = getActiveTenantId();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeTenantId);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeTenantId).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeTenantId).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    getByBarcode: async (code: string) => {
      const activeTenantId = getActiveTenantId();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeTenantId);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeTenantId).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeTenantId).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    getNextId: () => apiFetch('/products/next-id'),
    generateBarcode: (
      data?: number | string | { productId?: number | string; category?: string },
      categoryHint?: string
    ) => {
      const productId =
        typeof data === 'number' || typeof data === 'string'
          ? data
          : data?.productId;
      const category =
        typeof data === 'object' && data !== null ? data.category || categoryHint : categoryHint;
      const params = new URLSearchParams();
      if (productId !== undefined && productId !== null && productId !== '') {
        params.set('productId', String(productId));
      }
      if (category && category.trim()) {
        params.set('category', category.trim());
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiFetch(`/products/generate-barcode${qs}`);
    },
    validateBarcode: async (barcode: string, excludeId?: number) => {
      const cleanBarcode = String(barcode || '').trim();
      const qs = new URLSearchParams({ barcode: cleanBarcode });
      if (excludeId !== undefined && excludeId !== null) {
        qs.set('excludeId', String(excludeId));
      }
      try {
        return await apiFetch(`/products/validate-barcode?${qs.toString()}`);
      } catch (err) {
        const activeTenantId = getActiveTenantId();
        const cached = await searchCachedProductsOffline('', activeTenantId, 2000).catch(() => []);
        const dup = cached.find(
          (p: any) =>
            String(p.barcode || '').trim().toLowerCase() === cleanBarcode.toLowerCase() &&
            (!excludeId || Number(p.id) !== Number(excludeId))
        );
        if (dup) {
          return {
            valid: false,
            isDuplicate: true,
            existingProduct: dup,
            error: `Barcode is already in use in this store by product: "${dup.name || dup.article}"`,
          };
        }
        throw err;
      }
    },
    validateArticle: async (article: string, excludeId?: number) => {
      const cleanArt = String(article || '').trim().toUpperCase();
      const qs = new URLSearchParams({ article: cleanArt });
      if (excludeId !== undefined && excludeId !== null) {
        qs.set('excludeId', String(excludeId));
      }
      try {
        return await apiFetch(`/products/validate-article?${qs.toString()}`);
      } catch (err) {
        const activeTenantId = getActiveTenantId();
        const cached = await searchCachedProductsOffline('', activeTenantId, 2000).catch(() => []);
        const artDup = cached.find(
          (p: any) =>
            String(p.article || '').trim().toUpperCase() === cleanArt &&
            (!excludeId || Number(p.id) !== Number(excludeId))
        );
        if (artDup) {
          const msg = `Article "${cleanArt}" already exists in this store.`;
          return {
            valid: false,
            isDuplicate: true,
            duplicateField: 'article',
            articleError: msg,
            existingProduct: artDup,
            error: msg,
          };
        }
        throw err;
      }
    },
    suggestArticle: (params: {
      brand?: string;
      category?: string;
      article?: string;
      productId?: number;
      excludeId?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params.brand) qs.set('brand', params.brand);
      if (params.category) qs.set('category', params.category);
      if (params.article) qs.set('article', params.article);
      if (params.productId !== undefined && params.productId !== null) qs.set('productId', String(params.productId));
      if (params.excludeId !== undefined && params.excludeId !== null) qs.set('excludeId', String(params.excludeId));
      return apiFetch<any>(`/products/suggest-article?${qs.toString()}`);
    },
    aiSuggest: (image: string) =>
      apiFetch<{
        success: boolean;
        suggestion?: AiProductSuggestionResult;
        error?: string;
      }>('/products/ai-suggest', {
        method: 'POST',
        body: { image },
      }),
    aiSuggestFromImage: (image: string) =>
      apiFetch<{
        success: boolean;
        title?: string;
        category?: string;
        brand?: string;
        shoeType?: string;
        suggestion?: AiProductSuggestionResult;
        error?: string;
      }>('/products/ai-suggest-from-image', {
        method: 'POST',
        body: { image },
      }),
    create: async (data: ProductFormValues) => {
      const normalizedData = { ...data, brand: String(data.brand ?? '').trim() || 'Unbranded' };
      const res = await apiFetch<any>('/products', { method: 'POST', body: normalizedData });
      if (res && res.product) {
        cacheCatalogOffline([res.product], getActiveTenantId()).catch(() => {});
      }
      return res;
    },
    bulkImport: async (payload: any) => {
      const res = await apiFetch<any>('/products/bulk-import', {
        method: 'POST',
        body: Array.isArray(payload) ? { products: payload } : payload,
      });
      if (res && Array.isArray(res.products) && res.products.length > 0) {
        cacheCatalogOffline(res.products, getActiveTenantId()).catch(() => {});
      }
      return res;
    },
    nextCode: (brand?: string, category?: string) => {
      const qs = new URLSearchParams();
      if (brand) qs.set('brand', brand);
      if (category) qs.set('category', category);
      return apiFetch(`/products/next-code?${qs.toString()}`);
    },
    update: async (id: number, data: ProductFormValues) => {
      const normalizedData = { ...data, brand: String(data.brand ?? '').trim() || 'Unbranded' };
      const res = await apiFetch<any>(`/products/${id}`, { method: 'PUT', body: normalizedData });
      if (res && res.product) {
        cacheCatalogOffline([res.product], getActiveTenantId()).catch(() => {});
      }
      return res;
    },
    delete: async (id: number) => {
      const res = await apiFetch<any>(`/products/${id}`, { method: 'DELETE' });
      deleteCachedProductOffline(id, getActiveTenantId()).catch(() => {});
      return res;
    },
  },
  categories: {
    getCategories: () => apiFetch('/categories'),
    createCategory: (name: string) => apiFetch('/categories', { method: 'POST', body: { name } }),
    deleteCategory: (id: number) => apiFetch(`/categories/${id}`, { method: 'DELETE' }),
  },
  brandCategory: {
    getCategories: () => apiFetch('/categories'),
    createCategory: (name: string) => apiFetch('/categories', { method: 'POST', body: { name } }),
    deleteCategory: (id: number) => apiFetch(`/categories/${id}`, { method: 'DELETE' }),
  },
  pos: {
    verifyOverride: (credentials: { email?: string; password?: string; pin?: string }) =>
      apiFetch('/pos/verify-override', { method: 'POST', body: credentials }),
    createSale: (saleData: any) => apiFetch('/pos/sales', { method: 'POST', body: saleData }),
    checkout: (saleData: any) => apiFetch('/pos/checkout', { method: 'POST', body: saleData }),
    exchange: (exchangeData: any) => apiFetch('/pos/exchange', { method: 'POST', body: exchangeData }),
    listSales: (params?: { startDate?: string; endDate?: string; search?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      if (params?.search) qs.set('search', params.search);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/pos/sales${query}`);
    },
    getSale: (id: number) => apiFetch(`/pos/sales/${id}`),
    getSaleByInvoice: (invoiceNumber: string) =>
      apiFetch(`/pos/invoice/${encodeURIComponent(invoiceNumber)}`),
  },
  returns: {
    verifyInvoice: (invoiceNumber: string) =>
      apiFetch(`/returns/verify-invoice/${encodeURIComponent(invoiceNumber)}`),
    createReturn: (data: any) => apiFetch('/returns', { method: 'POST', body: data }),
    create: (data: any) => apiFetch('/returns', { method: 'POST', body: data }),
    listReturns: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/returns${query}`);
    },
    list: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/returns${query}`);
    },
    getReturn: (id: number) => apiFetch(`/returns/${id}`),
    get: (id: number) => apiFetch(`/returns/${id}`),
  },
  suppliers: {
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/suppliers${query}`);
    },
    get: (id: number) => apiFetch(`/suppliers/${id}`),
    getLedger: (id: number) => apiFetch(`/suppliers/${id}/ledger`),
    create: (data: any) => apiFetch('/suppliers', { method: 'POST', body: data }),
    recordPayment: (id: number, data: any) =>
      apiFetch(`/suppliers/${id}/payments`, { method: 'POST', body: data }),
    deletePayment: (idOrSupplierId: number, maybePaymentId?: number) => {
      if (maybePaymentId !== undefined) {
        return apiFetch(`/suppliers/${idOrSupplierId}/payments/${maybePaymentId}`, { method: 'DELETE' });
      }
      return apiFetch(`/suppliers/payments/${idOrSupplierId}`, { method: 'DELETE' });
    },
    update: (id: number, data: any) => apiFetch(`/suppliers/${id}`, { method: 'PUT', body: data }),
    delete: (id: number) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
  },
  purchases: {
    create: (data: any) => apiFetch('/purchases', { method: 'POST', body: data }),
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/purchases${query}`);
    },
    get: (id: number) => apiFetch(`/purchases/${id}`),
  },
  purchaseReturns: {
    create: (data: any) => apiFetch('/purchase-returns', { method: 'POST', body: data }),
    verifyPurchase: (purchaseNumber: string) =>
      apiFetch(`/purchase-returns/verify-purchase/${encodeURIComponent(purchaseNumber)}`),
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/purchase-returns${query}`);
    },
    get: (id: number) => apiFetch(`/purchase-returns/${id}`),
  },
  customers: {
    list: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/customers${query}`);
    },
    get: (id: number) => apiFetch(`/customers/${id}`),
    getLedger: (id: number) => apiFetch(`/customers/${id}/ledger`),
    recordPayment: (id: number, data: { amount: number; paymentMethod?: string; notes?: string; paymentDate?: string }) =>
      apiFetch(`/customers/${id}/payments`, { method: 'POST', body: data }),
    create: (data: any) => apiFetch('/customers', { method: 'POST', body: data }),
    update: (id: number, data: any) => apiFetch(`/customers/${id}`, { method: 'PUT', body: data }),
    delete: (id: number) => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
  },
  inventory: {
    listMovements: (params?: { productId?: number; type?: string; movementType?: string; search?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.productId) qs.set('productId', String(params.productId));
      if (params?.type || params?.movementType) qs.set('movementType', String(params.type || params.movementType));
      if (params?.search) qs.set('search', params.search);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/inventory/ledger${query}`);
    },
    ledger: (params?: { productId?: number; movementType?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.productId) qs.set('productId', String(params.productId));
      if (params?.movementType) qs.set('movementType', String(params.movementType));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/inventory/ledger${query}`);
    },
    adjustStock: (data: { productId: number; newStock: number; reason: string }) =>
      apiFetch('/inventory/adjust', { method: 'POST', body: data }),
    adjust: (data: { productId: number; newStock: number; reason: string }) =>
      apiFetch('/inventory/adjust', { method: 'POST', body: data }),
  },
  reports: {
    dashboard: () => apiFetch('/reports/dashboard'),
    getDashboard: () => apiFetch('/reports/dashboard'),
    profitLoss: (params?: { startDate?: string; endDate?: string }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/reports/profit-loss${query}`);
    },
    getProfitLoss: (params?: { startDate?: string; endDate?: string }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/reports/profit-loss${query}`);
    },
    topSelling: () => apiFetch('/reports/top-selling'),
    getTopSelling: () => apiFetch('/reports/top-selling'),
  },
  settings: {
    get: () => apiFetch('/settings'),
    getAppSettings: () => apiFetch<{ appSettings: Record<string, string>; appSettingsGrouped: Record<string, any[]> }>('/settings/app'),
    saveAppSettings: (appSettings: Record<string, string>) =>
      apiFetch('/settings/app', { method: 'PUT', body: { appSettings } }).catch(() =>
        apiFetch('/settings', { method: 'POST', body: { appSettings } })
      ),
    testEmail: (recipientEmail?: string) =>
      apiFetch<{
        success: boolean;
        delivered: boolean;
        message: string;
        details?: any;
      }>('/settings/test-email', { method: 'POST', body: { recipientEmail } }),
    post: (data: any) => apiFetch('/settings', { method: 'POST', body: data }),
    getSubscription: () => apiFetch('/settings/subscription'),
    requestSubscriptionRenewal: (data: { plan: '6_MONTHS' | 'YEARLY' | string; notes?: string }) =>
      apiFetch('/settings/renew-subscription', { method: 'POST', body: data }),
    update: (data: any) => apiFetch('/settings', { method: 'PUT', body: data }),
    changeSetting: (data: any) => apiFetch('/settings/changeSetting', { method: 'PUT', body: data }),
    getUsers: () => apiFetch('/settings/users'),
    createUser: (data: any) =>
      apiFetch<{
        message: string;
        user: any;
        welcomeNotification?: {
          delivered: boolean;
          previewUrl?: string | null;
          provider?: string | null;
          terminalUrl?: string;
          notificationId?: number;
        };
      }>('/settings/users', { method: 'POST', body: data }),
    updateUserStatus: (id: number, status: string) =>
      apiFetch(`/settings/users/${id}/status`, { method: 'PATCH', body: { status } }),
    updateUserRole: (id: number, role: string) =>
      apiFetch(`/settings/users/${id}/role`, { method: 'PATCH', body: { role } }),
    deleteUser: (id: number) => apiFetch(`/settings/users/${id}`, { method: 'DELETE' }),
  },
  backup: {
    stats: () => apiFetch('/backup/stats'),
    export: () => apiFetch('/backup/export'),
    restore: (backupPayload: any) =>
      apiFetch('/backup/restore', { method: 'POST', body: backupPayload }),
    importSql: (sqlContent: string) =>
      apiFetch('/backup/import-sql', { method: 'POST', body: { sql: sqlContent, sqlContent } }),
  },
  notifications: {
    list: () => apiFetch('/notifications'),
    grouped: (limit: number = 5) =>
      apiFetch<GroupedNotificationsResponse>(`/notifications/grouped?limit=${limit}`),
    all: (params?: {
      page?: number;
      limit?: number;
      tab?: string;
      category?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
      unreadOnly?: boolean;
    }) => {
      const sp = new URLSearchParams();
      if (params?.page) sp.set('page', String(params.page));
      if (params?.limit) sp.set('limit', String(params.limit));
      if (params?.tab) sp.set('tab', params.tab);
      if (params?.category) sp.set('category', params.category);
      if (params?.search) sp.set('search', params.search);
      if (params?.sortBy) sp.set('sortBy', params.sortBy);
      if (params?.sortOrder) sp.set('sortOrder', params.sortOrder);
      if (params?.unreadOnly !== undefined) sp.set('unreadOnly', String(params.unreadOnly));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return apiFetch<AllNotificationsResponse>(`/notifications/all${qs}`);
    },
    dismiss: (id: string | number, itemType?: string) =>
      apiFetch<{ success: boolean; message: string }>(`/notifications/${encodeURIComponent(String(id))}/dismiss`, {
        method: 'POST',
        body: itemType ? { itemType } : {},
      }),
    dismissAll: (category?: string) =>
      apiFetch<{ success: boolean; message: string }>('/notifications/dismiss-all', {
        method: 'POST',
        body: category ? { category } : {},
      }),
    markRead: (id: string | number, itemType?: string) =>
      apiFetch<{ success: boolean; message: string }>(`/notifications/${encodeURIComponent(String(id))}/read`, {
        method: 'POST',
        body: itemType ? { itemType } : {},
      }),
    markAllRead: () =>
      apiFetch<{ success: boolean; message: string }>('/notifications/mark-all-read', {
        method: 'POST',
      }),
    getVapidPublicKey: () => apiFetch<{ publicKey: string }>('/notifications/vapid-public-key'),
    subscribe: (subscription: any) =>
      apiFetch<{ success: boolean }>('/notifications/subscribe', { method: 'POST', body: { subscription } }),
    unsubscribe: (endpoint: string) =>
      apiFetch<{ success: boolean }>('/notifications/unsubscribe', { method: 'POST', body: { endpoint } }),
    testPush: () =>
      apiFetch<{ success: boolean; message: string }>('/notifications/test-push', { method: 'POST' }),
    getPlatformAnnouncements: () =>
      apiFetch<{ announcements: PlatformNotification[]; unreadCount: number }>('/notifications/platform'),
    dismissAnnouncement: (id: number) =>
      apiFetch<{ success: boolean; message: string }>(`/notifications/platform/${id}/dismiss`, {
        method: 'POST',
      }),
    dismissAllAnnouncements: () =>
      apiFetch<{ success: boolean; message: string }>('/notifications/platform/dismiss-all', {
        method: 'POST',
      }),
  },
  chat: {
    message: (data: { message: string; history?: { role: 'user' | 'assistant'; content: string }[] }) =>
      apiFetch('/chat', { method: 'POST', body: data }),
    send: (payload: any, history?: any) =>
      apiFetch('/chat', {
        method: 'POST',
        body: typeof payload === 'string' ? { message: payload, history } : payload,
      }),
  },
};
