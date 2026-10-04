import { createHash, createSign, createVerify } from 'crypto';

import {
  CheckoutSession,
  PaymentConfigs,
  PaymentEvent,
  PaymentEventType,
  PaymentInterval,
  PaymentOrder,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  SubscriptionCycleType,
  SubscriptionInfo,
  SubscriptionStatus,
  WebhookIgnoredError,
} from './types';

/**
 * Waffo Pancake payment provider configs
 * @docs https://www.npmjs.com/package/@waffo/pancake-ts
 */
export interface WaffoConfigs extends PaymentConfigs {
  merchantId: string; // MER_xxx (Dashboard > Settings > Developers)
  privateKey: string; // RSA private key (PEM / raw base64)
  baseUrl?: string;
  taxCategory?: string; // used when overriding price via priceSnapshot
  webhookPublicKey?: string; // optional override of the built-in Waffo keys
}

// Official Waffo webhook public keys (embedded in @waffo/pancake-ts)
const WAFFO_WEBHOOK_TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxnmRY6yMMA3lVqmAU6ZG
b1sjL/+r/z6E+ZjkXaDAKiqOhk9rpazni0bNsGXwmftTPk9jy2wn+j6JHODD/WH/
SCnSfvKkLIjy4Hk7BuCgB174C0ydan7J+KgXLkOwgCAxxB68t2tezldwo74ZpXgn
F49opzMvQ9prEwIAWOE+kV9iK6gx/AckSMtHIHpUesoPDkldpmFHlB2qpf1vsFTZ
5kD6DmGl+2GIVK01aChy2lk8pLv0yUMu18v44sLkO5M44TkGPJD9qG09wrvVG2wp
OTVCn1n5pP8P+HRLcgzbUB3OlZVfdFurn6EZwtyL4ZD9kdkQ4EZE/9inKcp3c1h4
xwIDAQAB
-----END PUBLIC KEY-----`;

const WAFFO_WEBHOOK_PROD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz+xApdTIb4ua+DgZKQ54
iBsD82ybyhGCLRETONW4Jgbb3A8DUM1LqBk6r/CmTOCHqLalTQHNigvP3R5zkDNX
iRJz6gA4MJ/+8K0+mnEE2RISQzN+Qu65TNd6svb+INm/kMaftY4uIXr6y6kchtTJ
dwnQhcKdAL2v7h7IFnkVelQsKxDdb2PqX8xX/qwd01iXvMcpCCaXovUwZsxH2QN5
ZKBTseJivbhUeyJCco4fdUyxOMHe2ybCVhyvim2uxAl1nkvL5L8RCWMCAV55LLo0
9OhmLahz/DYNu13YLVP6dvIT09ZFBYU6Owj1NxdinTynlJCFS9VYwBgmftosSE1U
dwIDAQAB
-----END PUBLIC KEY-----`;

// Replay window, same defaults as the official SDK (retries reuse the header)
const WEBHOOK_TOLERANCE_MS = 45 * 60 * 1000;
const WEBHOOK_FUTURE_TOLERANCE_MS = 60 * 1000;

/**
 * Waffo Pancake (Merchant of Record) payment provider implementation
 * @website https://pancake.waffo.ai/
 *
 * Order matching: our orderNo is sent as `orderMerchantExternalId` and also
 * returned as `checkoutInfo.sessionId`, so the order row's paymentSessionId
 * equals orderNo. Webhooks carry it back as `data.orderMerchantExternalId`,
 * exposed to the payment service as `paymentResult.out_trade_no`.
 */
export class WaffoProvider implements PaymentProvider {
  readonly name = 'waffo';
  configs: WaffoConfigs;

  private baseUrl: string;
  private privateKey: string;

  constructor(configs: WaffoConfigs) {
    this.configs = configs;
    this.baseUrl = (configs.baseUrl || 'https://api.waffo.ai').replace(
      /\/+$/,
      ''
    );
    this.privateKey = normalizePem(configs.privateKey || '', 'PRIVATE');
  }

  // create payment
  // @docs @waffo/pancake-ts checkout.authenticated.create / anonymous.create
  async createPayment({
    order,
  }: {
    order: PaymentOrder;
  }): Promise<CheckoutSession> {
    if (!order.productId) {
      throw new Error('productId is required');
    }
    if (!/^PROD_/.test(order.productId)) {
      throw new Error(
        `Waffo product ID must look like PROD_xxx, got "${order.productId}" — check waffo_product_ids_mapping`
      );
    }
    if (!order.orderNo) {
      throw new Error('orderNo is required');
    }

    const currency = (order.price?.currency || 'USD').toUpperCase();

    const payload: Record<string, any> = {
      productId: order.productId,
      currency,
      successUrl: order.successUrl,
      orderMerchantExternalId: order.orderNo,
      metadata: {
        ...stringifyValues(order.metadata),
        order_no: order.orderNo,
      },
    };
    if (order.customer?.email) {
      payload.buyerEmail = order.customer.email;
    }
    if (order.price?.amount) {
      payload.priceSnapshot = {
        amount: centsToAmount(order.price.amount, currency),
        taxCategory: this.configs.taxCategory || 'saas',
      };
    }

    // Authenticated checkout binds the order to a stable buyer identity
    const buyerIdentity = order.customer?.id || order.customer?.email;
    const [session, token] = await Promise.all([
      this.request('/v1/actions/checkout/create-session', payload),
      buyerIdentity
        ? this.request('/v1/actions/auth/issue-session-token', {
            productId: order.productId,
            buyerIdentity,
          })
        : Promise.resolve(null),
    ]);

    if (!session?.checkoutUrl) {
      throw new Error('create waffo checkout session failed');
    }

    const checkoutUrl = token?.token
      ? `${session.checkoutUrl}#token=${token.token}`
      : session.checkoutUrl;

    return {
      provider: this.name,
      checkoutParams: payload,
      checkoutInfo: {
        sessionId: order.orderNo,
        checkoutUrl,
      },
      checkoutResult: session,
      metadata: order.metadata || {},
    };
  }

  // get payment by our orderNo (stored as paymentSessionId)
  async getPaymentSession({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<PaymentSession> {
    const data = await this.graphql(
      `query ($ref: String!) {
        payments(filter: { orderMerchantExternalId: { eq: $ref } }) {
          id orderId status createdAt
          snapshotAmountDetails { currency total }
          onetimeOrder { id buyerEmail status }
          subscriptionOrder {
            id buyerEmail status billingPeriod
            currentPeriodStart currentPeriodEnd canceledAt
          }
        }
      }`,
      { ref: sessionId }
    );

    const payments: any[] = data?.payments || [];
    const paid = payments.find((p) => p.status === 'succeeded');
    const payment = paid || payments[0];

    if (!payment) {
      return {
        provider: this.name,
        paymentStatus: PaymentStatus.PROCESSING,
        paymentResult: { out_trade_no: sessionId },
      };
    }

    const amountDetails = Array.isArray(payment.snapshotAmountDetails)
      ? payment.snapshotAmountDetails[0]
      : payment.snapshotAmountDetails;
    const currency = amountDetails?.currency || '';
    const subOrder = payment.subscriptionOrder;

    const result: PaymentSession = {
      provider: this.name,
      paymentStatus: this.mapPaymentStatus(payment.status),
      paymentInfo: {
        transactionId: payment.id,
        amount: amountToCents(amountDetails?.total, currency),
        currency,
        paymentAmount: amountToCents(amountDetails?.total, currency),
        paymentCurrency: currency,
        paymentEmail:
          payment.onetimeOrder?.buyerEmail || subOrder?.buyerEmail || '',
        paidAt: payment.createdAt ? new Date(payment.createdAt) : undefined,
        subscriptionCycleType: subOrder
          ? SubscriptionCycleType.CREATE
          : undefined,
      },
      // no top-level `id`: the payment service matches orders on out_trade_no
      paymentResult: { out_trade_no: sessionId, payment },
    };

    if (subOrder?.id && subOrder.currentPeriodStart) {
      result.subscriptionId = subOrder.id;
      result.subscriptionInfo = this.buildSubscriptionInfo({
        orderId: subOrder.id,
        orderStatus: subOrder.status,
        billingPeriod: subOrder.billingPeriod,
        currentPeriodStart: subOrder.currentPeriodStart,
        currentPeriodEnd: subOrder.currentPeriodEnd,
        canceledAt: subOrder.canceledAt,
        currency,
        planPrice: { total: amountDetails?.total },
      });
      result.subscriptionResult = subOrder;
    }

    return result;
  }

  async getPaymentEvent({ req }: { req: Request }): Promise<PaymentEvent> {
    const rawBody = await req.text();
    const signature = req.headers.get('x-waffo-signature');

    if (!rawBody || !signature) {
      throw new Error('Invalid webhook request');
    }

    this.verifyWebhookSignature(rawBody, signature);

    const event = JSON.parse(rawBody);
    if (!event?.eventType || !event.data) {
      throw new Error('Invalid webhook payload');
    }

    const eventType = this.mapEventType(event.eventType);
    const data = event.data;
    const orderNo: string =
      data.orderMerchantExternalId || data.orderMetadata?.order_no || '';

    let paymentSession: PaymentSession;

    if (event.eventType === 'order.completed') {
      // one-time order paid
      paymentSession = this.buildPaymentSessionFromEvent(event, orderNo);
    } else if (event.eventType === 'subscription.activated') {
      // first subscription period paid
      paymentSession = this.buildPaymentSessionFromEvent(event, orderNo);
      paymentSession.paymentInfo!.subscriptionCycleType =
        SubscriptionCycleType.CREATE;
      this.attachSubscription(paymentSession, data);
    } else if (event.eventType === 'subscription.renewed') {
      paymentSession = this.buildPaymentSessionFromEvent(event, orderNo);
      paymentSession.paymentInfo!.subscriptionCycleType =
        SubscriptionCycleType.RENEWAL;
      this.attachSubscription(paymentSession, data);
    } else {
      // subscription status change
      paymentSession = { provider: this.name, metadata: data.orderMetadata };
      this.attachSubscription(paymentSession, data);
    }

    return {
      eventType,
      eventResult: event,
      paymentSession,
    };
  }

  async cancelSubscription({
    subscriptionId,
  }: {
    subscriptionId: string;
  }): Promise<PaymentSession> {
    const result = await this.request(
      '/v1/actions/subscription-order/cancel-order',
      { orderId: subscriptionId }
    );

    // "canceling" = active until period end, "canceled" = terminated now
    const now = new Date();
    return {
      provider: this.name,
      subscriptionId,
      subscriptionInfo: {
        subscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: now,
        status:
          result?.status === 'canceling'
            ? SubscriptionStatus.PENDING_CANCEL
            : SubscriptionStatus.CANCELED,
        canceledAt: now,
      },
      subscriptionResult: result,
    };
  }

  /**
   * Content-safety scan of a user prompt before AIGC generation. Stateless —
   * Waffo does not store the text. Continue only when `action` is `allow`;
   * Waffo itself fails closed to `review` when its safety service is down.
   * @docs @waffo/pancake-ts contentSafety.scanPrompt
   */
  async scanPrompt({
    prompt,
    locale,
  }: {
    prompt: string;
    locale?: 'en' | 'zh' | 'ja';
  }): Promise<{
    action: 'allow' | 'review' | 'block';
    reasonCode?: string;
    matchedCategories?: string[];
    requestId?: string;
  }> {
    return this.request('/v1/actions/verification/scan-prompt', {
      prompt: prompt.slice(0, 10_000),
      ...(locale ? { locale } : {}),
    });
  }

  // --- request signing -----------------------------------------------------

  private async request(path: string, body: any): Promise<any> {
    const envelope = await this.post(path, body);
    if (envelope.errors?.length) {
      throw new Error(
        `waffo ${path} failed: ${envelope.errors[0]?.message || 'unknown error'}`
      );
    }
    return envelope.data;
  }

  private async graphql(query: string, variables?: Record<string, any>) {
    const envelope = await this.post('/v1/graphql', { query, variables });
    if (envelope.errors?.length) {
      throw new Error(
        `waffo graphql failed: ${envelope.errors[0]?.message || 'unknown error'}`
      );
    }
    return envelope.data;
  }

  private async post(path: string, body: any): Promise<any> {
    if (!this.configs.merchantId || !this.privateKey) {
      throw new Error('Waffo merchantId / privateKey not configured');
    }

    const bodyStr = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyHash = createHash('sha256').update(bodyStr).digest('base64');
    const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = createSign('sha256')
      .update(canonical)
      .sign(this.privateKey, 'base64');

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': this.configs.merchantId,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: bodyStr,
    });

    try {
      return await response.json();
    } catch {
      throw new Error(
        `request waffo api failed with status: ${response.status}`
      );
    }
  }

  // --- webhook verification ------------------------------------------------

  private verifyWebhookSignature(rawBody: string, header: string) {
    let t = '';
    let v1 = '';
    for (const pair of header.split(',')) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key === 't') t = value;
      else if (key === 'v1') v1 = value;
    }
    if (!t || !v1) {
      throw new Error('Malformed X-Waffo-Signature header');
    }

    const ageMs = Date.now() - Number(t);
    if (
      Number.isNaN(ageMs) ||
      ageMs > WEBHOOK_TOLERANCE_MS ||
      ageMs < -WEBHOOK_FUTURE_TOLERANCE_MS
    ) {
      throw new Error('Webhook timestamp outside tolerance window');
    }

    const input = `${t}.${rawBody}`;
    const keys = this.configs.webhookPublicKey
      ? [normalizePem(this.configs.webhookPublicKey, 'PUBLIC')]
      : [
          process.env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY
            ? normalizePem(process.env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY, 'PUBLIC')
            : WAFFO_WEBHOOK_PROD_PUBLIC_KEY,
          process.env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY
            ? normalizePem(process.env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY, 'PUBLIC')
            : WAFFO_WEBHOOK_TEST_PUBLIC_KEY,
        ];

    const ok = keys.some((key) => {
      try {
        return createVerify('RSA-SHA256')
          .update(input)
          .verify(key, v1, 'base64');
      } catch {
        return false;
      }
    });
    if (!ok) {
      throw new Error('Invalid webhook signature');
    }
  }

  // --- mapping -------------------------------------------------------------

  private mapEventType(eventType: string): PaymentEventType {
    switch (eventType) {
      case 'order.completed':
      case 'subscription.activated':
        return PaymentEventType.CHECKOUT_SUCCESS;
      case 'subscription.renewed':
        return PaymentEventType.PAYMENT_SUCCESS;
      case 'subscription.canceling':
      case 'subscription.uncanceled':
      case 'subscription.recovered':
      case 'subscription.plan_changed':
        return PaymentEventType.SUBSCRIBE_UPDATED;
      case 'subscription.canceled':
        return PaymentEventType.SUBSCRIBE_CANCELED;
      default:
        // subscription.payment_succeeded is covered by activated / renewed;
        // past_due, plan_change_*, refund.* are not handled
        throw new WebhookIgnoredError(
          `Not handle waffo event type: ${eventType}`
        );
    }
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return PaymentStatus.SUCCESS;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'canceled':
        return PaymentStatus.CANCELED;
      default:
        return PaymentStatus.PROCESSING;
    }
  }

  private buildPaymentSessionFromEvent(
    event: any,
    orderNo: string
  ): PaymentSession {
    const data = event.data;
    const currency = data.currency || '';
    const charged =
      data.chargedAmount ??
      data.listPrice?.total ??
      data.planPrice?.total ??
      data.amount;
    const listTotal =
      data.listPrice?.total ?? data.planPrice?.total ?? data.total ?? charged;

    return {
      provider: this.name,
      paymentStatus:
        data.paymentStatus && data.paymentStatus !== 'succeeded'
          ? this.mapPaymentStatus(data.paymentStatus)
          : PaymentStatus.SUCCESS,
      paymentInfo: {
        description: data.productName,
        transactionId: data.paymentId || event.eventId || data.orderId,
        amount: amountToCents(listTotal, currency),
        currency,
        paymentAmount: amountToCents(charged, currency),
        paymentCurrency: currency,
        paymentEmail: data.buyerEmail,
        paymentUserId: data.merchantProvidedBuyerIdentity,
        // paymentDate is date-only ("2026-10-03"), so prefer the event's
        // full timestamp
        paidAt: event.timestamp
          ? new Date(event.timestamp)
          : data.paymentDate
            ? new Date(data.paymentDate)
            : new Date(),
      },
      // no top-level `id`: the payment service matches orders on out_trade_no
      paymentResult: { out_trade_no: orderNo, event },
      metadata: data.orderMetadata,
    };
  }

  private attachSubscription(session: PaymentSession, data: any) {
    if (!data.orderId || !data.currentPeriodStart) {
      throw new WebhookIgnoredError(
        'waffo subscription event without subscription period'
      );
    }
    session.subscriptionId = data.orderId;
    session.subscriptionInfo = this.buildSubscriptionInfo(data);
    session.subscriptionResult = data;
  }

  private buildSubscriptionInfo(data: any): SubscriptionInfo {
    const { interval, count } = mapBillingPeriod(data.billingPeriod);
    const currency = data.currency || '';
    const info: SubscriptionInfo = {
      subscriptionId: data.orderId,
      description: data.productName,
      amount: amountToCents(
        data.planPrice?.total ?? data.total ?? data.amount,
        currency
      ),
      currency,
      interval,
      intervalCount: count,
      currentPeriodStart: new Date(data.currentPeriodStart),
      currentPeriodEnd: new Date(data.currentPeriodEnd),
      metadata: data.orderMetadata,
    };

    switch (data.orderStatus) {
      case 'canceling':
        info.status = SubscriptionStatus.PENDING_CANCEL;
        info.canceledAt = data.canceledAt
          ? new Date(data.canceledAt)
          : new Date();
        info.canceledEndAt = info.currentPeriodEnd;
        break;
      case 'canceled':
      case 'closed':
        info.status = SubscriptionStatus.CANCELED;
        info.canceledAt = data.canceledAt
          ? new Date(data.canceledAt)
          : new Date();
        break;
      case 'expired':
        info.status = SubscriptionStatus.EXPIRED;
        break;
      default:
        // active, past_due (still entitled while retrying), pending
        info.status = SubscriptionStatus.ACTIVE;
    }

    return info;
  }
}

// --- helpers -----------------------------------------------------------------

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

function centsToAmount(cents: number, currency: string): string {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return String(Math.round(cents));
  return (cents / 100).toFixed(2);
}

function amountToCents(amount: unknown, currency: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) return Math.round(n);
  return Math.round(n * 100);
}

function stringifyValues(obj?: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function mapBillingPeriod(period?: string): {
  interval: PaymentInterval;
  count: number;
} {
  switch (period) {
    case 'weekly':
      return { interval: PaymentInterval.WEEK, count: 1 };
    case 'monthly':
      return { interval: PaymentInterval.MONTH, count: 1 };
    case 'quarterly':
      return { interval: PaymentInterval.MONTH, count: 3 };
    case 'yearly':
      return { interval: PaymentInterval.YEAR, count: 1 };
    default:
      return { interval: PaymentInterval.MONTH, count: 1 };
  }
}

/**
 * Accepts PEM (PKCS#8 / PKCS#1 / SPKI), literal "\n" from env vars and raw
 * base64 — same normalization as the official SDK.
 */
function normalizePem(raw: string, kind: 'PRIVATE' | 'PUBLIC'): string {
  let pem = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!pem) return '';

  const rsaHeader = `-----BEGIN RSA ${kind} KEY-----`;
  const isRsa = pem.includes(rsaHeader);
  const label = isRsa ? `RSA ${kind} KEY` : `${kind} KEY`;
  const base64 = pem
    .replace(/-----(BEGIN|END) (RSA )?(PRIVATE|PUBLIC) KEY-----/g, '')
    .replace(/\s+/g, '');
  const wrapped = (base64.match(/.{1,64}/g) || []).join('\n');
  pem = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
  return pem;
}

/**
 * Create Waffo provider with configs
 */
export function createWaffoProvider(configs: WaffoConfigs): WaffoProvider {
  return new WaffoProvider(configs);
}
