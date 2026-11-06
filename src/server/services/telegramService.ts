import { pgClient } from '../../db/index.ts';
import { getCachedAppSetting } from './appSettingsService.ts';
import type { PosActionNotification } from '../pushNotificationService.ts';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  alertsEnabled: boolean;
  storeName?: string;
}

/**
 * Escapes characters for Telegram HTML mode.
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a message via the Telegram Bot API.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const cleanToken = String(botToken || '').trim();
  const cleanChatId = String(chatId || '').trim();

  if (!cleanToken) {
    return { ok: false, error: 'Telegram Bot Token is required.' };
  }
  if (!cleanChatId) {
    return { ok: false, error: 'Telegram Chat ID is required.' };
  }

  const endpoint = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9500);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = (await res.json().catch(() => ({}))) as any;

    if (res.ok && data?.ok) {
      return { ok: true, messageId: data?.result?.message_id };
    }

    const desc = data?.description || `HTTP ${res.status} ${res.statusText}`;
    return { ok: false, error: desc };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Telegram API request timed out' : (err?.message || 'Network error');
    return { ok: false, error: msg };
  }
}

/**
 * Retrieves the Telegram configuration for a given store tenant.
 * Falls back to platform default Bot Token if the store only specified their Chat ID.
 */
export async function getStoreTelegramConfig(tenantId: number): Promise<TelegramConfig> {
  const cleanTenantId = Number(tenantId) || 1;
  const globalMasterEnabled = getCachedAppSetting('TELEGRAM_ALERTS_ENABLED', 'true').toLowerCase() !== 'false';
  const globalBotToken = getCachedAppSetting('TELEGRAM_BOT_TOKEN', '').trim();

  let storeBotToken = '';
  let storeChatId = '';
  let storeAlertsEnabled = false;
  let storeName = 'Retail Shoe Store';

  try {
    const res = await pgClient.query<{
      telegram_bot_token: string | null;
      telegram_chat_id: string | null;
      telegram_alerts_enabled: boolean | null;
      active_alert_provider: string | null;
      store_name: string | null;
    }>(
      `SELECT cs.telegram_bot_token, cs.telegram_chat_id, cs.telegram_alerts_enabled, cs.active_alert_provider,
              COALESCE(cs.company_name, t.name) AS store_name
       FROM company_settings cs
       LEFT JOIN tenants t ON t.id = cs.tenant_id
       WHERE cs.tenant_id = $1
       LIMIT 1`,
      [cleanTenantId]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      storeBotToken = String(row.telegram_bot_token || '').trim();
      storeChatId = String(row.telegram_chat_id || '').trim();
      const provider = String(row.active_alert_provider || 'both').toLowerCase();
      const isProviderActive = provider === 'both' || provider === 'telegram';
      storeAlertsEnabled = Boolean(row.telegram_alerts_enabled) && isProviderActive;
      if (row.store_name) storeName = row.store_name;
    }
  } catch (err) {
    console.warn(`[telegramService] Could not query store Telegram config for tenant ${cleanTenantId}:`, err);
  }

  // Fallback: If store didn't configure a custom bot token, use global platform bot
  const effectiveBotToken = storeBotToken || globalBotToken;
  const effectiveAlertsEnabled = globalMasterEnabled && storeAlertsEnabled && Boolean(storeChatId);

  return {
    botToken: effectiveBotToken,
    chatId: storeChatId,
    alertsEnabled: effectiveAlertsEnabled,
    storeName,
  };
}

/**
 * Formats and dispatches a real-time POS alert (Sale, Return, Exchange) to the Store Owner's Telegram.
 */
export async function dispatchPosTelegramAlert(
  tenantId: number,
  payload: PosActionNotification
): Promise<boolean> {
  try {
    const config = await getStoreTelegramConfig(tenantId);
    if (!config.alertsEnabled || !config.botToken || !config.chatId) {
      return false;
    }

    const typeEmoji =
      payload.type === 'SALE'
        ? '🛍️'
        : payload.type === 'EXCHANGE'
        ? '🔁'
        : payload.type === 'RETURN'
        ? '↩️'
        : '📦';

    const actionTitle =
      payload.type === 'SALE'
        ? 'NEW SALE CONFIRMED'
        : payload.type === 'EXCHANGE'
        ? 'SHOE EXCHANGE PROCESSED'
        : payload.type === 'RETURN'
        ? 'CUSTOMER RETURN COMPLETED'
        : 'INVENTORY UPDATE';

    const safeStore = escapeHtml(config.storeName || 'SarbaazSoft Shoe POS');
    const safeInvoice = escapeHtml(payload.invoiceNumber || payload.returnNumber || 'N/A');
    const safeCashier = escapeHtml(payload.cashierName || 'Cashier');
    const safeCustomer = escapeHtml(payload.customerName || 'Walk-in Customer');
    const safeItems = escapeHtml(payload.itemsSummary || '');
    const amountVal = payload.totalAmount ?? payload.refundAmount ?? payload.netDifference ?? 0;
    const formattedAmount = Number(amountVal).toLocaleString();

    let detailsSection = '';
    if (payload.type === 'SALE') {
      detailsSection = `💰 <b>Total Bill:</b> Rs. ${formattedAmount}
👤 <b>Customer:</b> ${safeCustomer}`;
    } else if (payload.type === 'EXCHANGE') {
      detailsSection = `💰 <b>Net Difference:</b> Rs. ${formattedAmount}
👤 <b>Customer:</b> ${safeCustomer}`;
      if (payload.exchangeDetails) {
        detailsSection += `\n↩️ <b>Returned:</b> ${escapeHtml(payload.exchangeDetails.oldItems || 'N/A')}
🆕 <b>Issued:</b> ${escapeHtml(payload.exchangeDetails.newItems || 'N/A')}`;
      }
    } else if (payload.type === 'RETURN') {
      detailsSection = `💸 <b>Refund Amount:</b> Rs. ${formattedAmount}
👤 <b>Customer:</b> ${safeCustomer}`;
    }

    let itemsBlock = '';
    if (safeItems) {
      itemsBlock = `\n👟 <b>Items:</b>\n${safeItems}`;
    }

    const dateStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const message = `${typeEmoji} <b>${actionTitle}</b>
🏪 <b>Store:</b> ${safeStore}
━━━━━━━━━━━━━━━━━━
📄 <b>Invoice / Ref:</b> #${safeInvoice}
${detailsSection}${itemsBlock}
👤 <b>Handled By:</b> ${safeCashier}
🕒 <b>Time:</b> ${dateStr}
━━━━━━━━━━━━━━━━━━
<i>SarbaazSoft Shoe POS • Real-Time Alert</i>`;

    const result = await sendTelegramMessage(config.botToken, config.chatId, message);
    if (!result.ok) {
      console.warn(`[telegramService] Failed delivering alert to chat ${config.chatId}: ${result.error}`);
    }
    return result.ok;
  } catch (err: any) {
    console.error('[telegramService] Error dispatching POS alert to Telegram:', err);
    return false;
  }
}

/**
 * Dispatches a test ping message to verify token and chat ID.
 */
export async function testTelegramConnection(
  botToken: string,
  chatId: string,
  storeName: string = 'SarbaazSoft POS'
): Promise<{ ok: boolean; message: string; error?: string }> {
  const testMessage = `🤖 <b>TELEGRAM NOTIFICATIONS CONNECTED!</b>
━━━━━━━━━━━━━━━━━━
🏪 <b>Store:</b> ${escapeHtml(storeName)}
✅ <b>Status:</b> Verified &amp; Active
🔔 <b>Alerts:</b> You will receive instant push alerts on this device whenever a cashier creates a sale, exchange, or return.
🕒 <b>Time:</b> ${new Date().toLocaleTimeString()}
━━━━━━━━━━━━━━━━━━
<i>SarbaazSoft Shoe POS • Setup Successful</i>`;

  const result = await sendTelegramMessage(botToken, chatId, testMessage);
  if (result.ok) {
    return {
      ok: true,
      message: 'Test message sent successfully! Check your Telegram app for the instant alert.',
    };
  }

  let helperTip = '';
  if (result.error?.includes('Unauthorized')) {
    helperTip = ' Check that your Bot Token was copied correctly from @BotFather.';
  } else if (result.error?.includes('chat not found')) {
    helperTip = ' Make sure you have opened your bot in Telegram and clicked "Start" at least once.';
  }

  return {
    ok: false,
    message: (result.error || 'Failed to send message.') + helperTip,
    error: result.error,
  };
}
