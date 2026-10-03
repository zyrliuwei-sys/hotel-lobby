import handler from '@tanstack/react-start/server-entry';

import { getCookieFromHeader } from './lib/cookie';
import { paraglideMiddleware } from './paraglide/server.js';

// On Cloudflare Workers, stash the binding env (D1, ASSETS, …) on globalThis
// so synchronous code paths (e.g. the db() singleton with DATABASE_PROVIDER=d1)
// can reach bindings without threading the request context through every call.
// The specifier is kept non-literal so bundlers leave the import to runtime;
// outside workerd the import rejects and we just move on.
const CF_WORKERS_MODULE = 'cloudflare:workers';
let cfEnvPromise: Promise<void> | null = null;

function ensureCloudflareEnv(): Promise<void> {
  if (!cfEnvPromise) {
    cfEnvPromise = import(/* @vite-ignore */ CF_WORKERS_MODULE)
      .then((mod) => {
        (globalThis as any).__CF_ENV__ = mod.env;
      })
      .catch(() => {
        // Not running on Cloudflare Workers — nothing to stash.
      });
  }
  return cfEnvPromise;
}

// Custom server entry — wraps every request in Paraglide's middleware so
// getLocale() resolves per-request (AsyncLocalStorage) during SSR.
export default {
  async fetch(req: Request): Promise<Response> {
    await ensureCloudflareEnv();
    const response = await paraglideMiddleware(req, () => handler.fetch(req));
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    // Hardening that can't break third-party scripts: HTTPS-only for a year
    // (no includeSubDomains/preload — mail records live on subdomains), no
    // framing by other sites, popups (Google sign-in, PayPal) still allowed.
    // A script-src allowlist / Trusted Types is deliberately left out: GA,
    // Clarity, PayPal and SSR inline scripts would need a nonce rollout first.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set(
      'Cross-Origin-Opener-Policy',
      'same-origin-allow-popups'
    );
    response.headers.set(
      'Content-Security-Policy',
      "frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
    );
    const utmSource = new URL(req.url).searchParams.get('utm_source');
    const existing = getCookieFromHeader(
      req.headers.get('cookie'),
      'utm_source'
    );
    if (utmSource && !existing) {
      const sanitized = utmSource.replace(/[^\w.\-]/g, '').slice(0, 100);
      if (sanitized) {
        response.headers.append(
          'Set-Cookie',
          `utm_source=${sanitized}; Max-Age=2592000; Path=/; SameSite=Lax${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`
        );
      }
    }
    return response;
  },
};
