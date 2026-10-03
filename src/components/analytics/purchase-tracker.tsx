import { useEffect } from 'react';

import { track } from '@/lib/track';

/**
 * Reports a completed checkout. The payment success URL carries
 * `?paid=<orderNo>&plan=<productId>&value=<usd>` (added in
 * modules/payment/service createCheckout); fire `purchase` once per order and
 * strip the params so a reload or shared link doesn't count it again.
 */
export function PurchaseTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const orderNo = url.searchParams.get('paid');
    if (!orderNo) return;

    const key = `purchase-tracked:${orderNo}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === '1';
      sessionStorage.setItem(key, '1');
    } catch {}
    if (!seen) {
      track('purchase', {
        transaction_id: orderNo,
        plan: url.searchParams.get('plan') || '',
        value: Number(url.searchParams.get('value')) || 0,
        currency: 'USD',
      });
    }

    for (const k of ['paid', 'plan', 'value']) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  return null;
}
