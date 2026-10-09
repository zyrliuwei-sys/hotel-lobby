/** Shared helpers for legacy preview lookups and the disabled preview route. */

import { getUuid, md5 } from '@/lib/hash';

export const DEVICE_COOKIE = 'hl_did';
export const FREE_PREVIEW_USED = 'FREE_PREVIEW_USED';
export const FREE_PREVIEW_PAUSED = 'FREE_PREVIEW_PAUSED';

/** Free image previews are disabled; generation starts from the paid flow. */
export function previewLimits(_configs: Record<string, string>) {
  return { dailyCap: 0, perVisitor: 0 };
}

// cf-connecting-ip is set by Cloudflare and can't be forged by the client,
// unlike the first x-forwarded-for entry; prefer it.
function clientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

export function visitor(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([\\w-]{8,64})`)
  );
  const existing = match?.[1];
  return {
    ipHash: md5(`hotel-lobby:${clientIp(request)}`),
    deviceId: existing || getUuid(),
    isNewDevice: !existing,
  };
}

/** Set-Cookie header that pins the device id for a year. */
export function deviceCookie(deviceId: string, request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${DEVICE_COOKIE}=${deviceId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}
