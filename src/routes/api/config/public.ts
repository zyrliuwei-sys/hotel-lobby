import { createFileRoute } from '@tanstack/react-router';

import { filterPublicConfigs, getAllConfigs } from '@/modules/config/service';
import { getStoredFooterBadges } from '@/modules/footer-badges/service';
import { respData } from '@/lib/resp';

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  },
};

const publicKeys = [
  'app_name',
  'app_description',
  'app_logo',
  'email_auth_enabled',
  'google_auth_enabled',
  'google_one_tap_enabled',
  'google_client_id',
  'github_auth_enabled',
  'invite_code_required',
  // Custom URL schemes /auth-callback may hand a session token to.
  'desktop_auth_schemes',
  'select_payment_enabled',
  'default_payment_provider',
  'stripe_enabled',
  'creem_enabled',
  'waffo_enabled',
  'paypal_enabled',
  'alipay_enabled',
  'wechat_enabled',
  'google_analytics_id',
  'plausible_domain',
  'plausible_src',
  'footer_badges',
];

function isEmailSendingConfigured(configs: Record<string, string>): boolean {
  const provider = configs.email_provider || 'resend';
  if (provider === 'cloudflare') {
    return (
      !!configs.cloudflare_email_api_token &&
      !!configs.cloudflare_email_account_id &&
      !!configs.cloudflare_email_sender_email
    );
  }
  return !!configs.resend_api_key && !!configs.resend_sender_email;
}

async function GET({ request }: { request: Request }) {
  const [configs, storedFooterBadges] = await Promise.all([
    getAllConfigs(),
    getStoredFooterBadges(),
  ]);
  const result = filterPublicConfigs(configs, publicKeys);
  // Read uncached so a saved badge list shows up on every instance at once.
  if (storedFooterBadges === undefined) delete result.footer_badges;
  else result.footer_badges = storedFooterBadges;
  const emailConfigured = isEmailSendingConfigured(configs);
  result.password_reset_enabled =
    configs.email_auth_enabled !== 'false' && emailConfigured
      ? 'true'
      : 'false';
  result.email_verification_enabled =
    configs.email_verification_enabled === 'true' && emailConfigured
      ? 'true'
      : 'false';
  return respData(result, noStore);
}

export const Route = createFileRoute('/api/config/public')({
  server: {
    handlers: { GET },
  },
});
