/**
 * Authoritative pricing catalog.
 *
 * The checkout API uses this as the SOURCE OF TRUTH for price/credits/duration.
 * Any price, credits, or plan info sent by the client is IGNORED — only the
 * product_id is honored, and everything else is looked up here.
 *
 * To change pricing, edit this file and redeploy. Admin UI cannot alter prices.
 */

import { PaymentInterval, PaymentType } from '@/core/payment/types';

export type PricingPlanInfo = {
  name: string;
  interval: PaymentInterval;
  intervalCount: number;
};

export type PricingProduct = {
  productId: string;
  productName: string;
  planName: string;
  description: string;
  type: PaymentType;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays?: number;
  plan?: PricingPlanInfo;
};

/**
 * Hotel Lobby AI catalog. A duet video costs a fixed number of credits
 * (see ./hotel-lobby-pricing.ts — 440 at the default 8s reference video), and
 * every pack holds a whole number of videos.
 *
 * Pricing floor: no product may sell credits below $0.01 each, so every
 * video is sold at ≥ 7× its fal cost. That is why there are no discounted
 * yearly plans — check priceInCents / credits ≥ 0.01 before adding a product.
 * Keys MUST match what the pricing UI sends as product_id.
 */
/**
 * First-order bonus (one extra video's worth of credits), granted once per
 * user on their first monthly subscription order of $23 or more. One-time
 * packs don't earn it.
 */
export const FIRST_ORDER_BONUS_MIN_CENTS = 2300;

export function qualifiesForFirstOrderBonus(order: {
  type?: string;
  priceInCents: number;
}) {
  return (
    order.type === PaymentType.SUBSCRIPTION &&
    order.priceInCents >= FIRST_ORDER_BONUS_MIN_CENTS
  );
}

export const pricingCatalog: Record<string, PricingProduct> = {
  pack_starter: {
    productId: 'pack_starter',
    productName: 'Starter Pack',
    planName: 'Starter Pack',
    description: 'Starter Pack',
    type: PaymentType.ONE_TIME,
    priceInCents: 500,
    currency: 'usd',
    credits: 440,
  },
  pack_standard: {
    productId: 'pack_standard',
    productName: 'Standard Pack',
    planName: 'Standard Pack',
    description: 'Standard Pack',
    type: PaymentType.ONE_TIME,
    priceInCents: 2300,
    currency: 'usd',
    credits: 2200,
  },
  pack_pro: {
    productId: 'pack_pro',
    productName: 'Pro Pack',
    planName: 'Pro Pack',
    description: 'Pro Pack',
    type: PaymentType.ONE_TIME,
    priceInCents: 4400,
    currency: 'usd',
    credits: 4400,
  },
  basic_monthly: {
    productId: 'basic_monthly',
    productName: 'Basic',
    planName: 'Basic Monthly',
    description: 'Basic Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 2300,
    currency: 'usd',
    credits: 2200,
    plan: {
      name: 'Basic',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  pro_monthly: {
    productId: 'pro_monthly',
    productName: 'Pro',
    planName: 'Pro Monthly',
    description: 'Pro Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 4400,
    currency: 'usd',
    credits: 4400,
    plan: {
      name: 'Pro',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  studio_monthly: {
    productId: 'studio_monthly',
    productName: 'Studio',
    planName: 'Studio Monthly',
    description: 'Studio Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 8800,
    currency: 'usd',
    credits: 8800,
    plan: {
      name: 'Studio',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
};

export function getPricingProduct(productId: string): PricingProduct | null {
  if (!productId) return null;
  return pricingCatalog[productId] ?? null;
}

export function listPricingProducts(): PricingProduct[] {
  return Object.values(pricingCatalog);
}
