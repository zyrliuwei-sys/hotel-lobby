import { WaffoProvider } from '@/core/payment/waffo';

/**
 * Prompt screening via Waffo's content-safety API, run after the local
 * keyword filter and before any generation call.
 *
 * Active when `prompt_screening_enabled` isn't 'false' and the Waffo merchant
 * credentials are configured (the same ones the payment provider uses).
 * Waffo's verdict is enforced: only `allow` passes. A transport/credential
 * error is logged and lets the request through, so a Waffo outage on our side
 * can't take generation down — the keyword filter and the model's own safety
 * filter still apply.
 */
export async function screenPrompt(
  text: string | undefined,
  configs: Record<string, string>
): Promise<{ allowed: boolean; reasonCode?: string; requestId?: string }> {
  const prompt = text?.trim();
  if (!prompt) return { allowed: true };
  if (configs.prompt_screening_enabled === 'false') return { allowed: true };
  if (!configs.waffo_merchant_id || !configs.waffo_private_key) {
    return { allowed: true };
  }

  try {
    const waffo = new WaffoProvider({
      merchantId: configs.waffo_merchant_id,
      privateKey: configs.waffo_private_key,
    });
    const verdict = await waffo.scanPrompt({
      prompt,
      locale: /[\u3040-\u30ff]/.test(prompt)
        ? 'ja'
        : /[\u4e00-\u9fff]/.test(prompt)
          ? 'zh'
          : 'en',
    });
    if (!verdict?.action) throw new Error('scan-prompt returned no verdict');
    if (verdict.action === 'allow') return { allowed: true };
    console.warn(
      '[content-safety] prompt refused',
      verdict.action,
      verdict.reasonCode,
      verdict.requestId
    );
    return {
      allowed: false,
      reasonCode: verdict.reasonCode,
      requestId: verdict.requestId,
    };
  } catch (error) {
    console.error('[content-safety] prompt screening unavailable', error);
    return { allowed: true };
  }
}
