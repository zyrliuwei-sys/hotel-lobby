/**
 * IndexNow — push changed URLs to Bing, Yandex, Naver, Seznam, … in one call.
 *
 * The key lives in the DB config table (`indexnow_key`, set at /admin/indexnow)
 * and is served at `/{key}.txt` (src/routes/{$key}[.]txt.ts) so search
 * engines can verify the site owns it.
 * Spec: https://www.indexnow.org/documentation
 *
 * The key-file check and sitemap reading run in the admin's browser: a
 * Cloudflare Worker can't fetch its own custom domain (HTTP 522).
 */

import { envConfigs } from '@/config';
import { getAllConfigs, saveConfigs } from '@/modules/config/service';

export const INDEXNOW_CONFIG_KEY = 'indexnow_key';
// Tried in order. Submissions are shared between engines, so one success is
// enough; the next is only tried on an error such as 429 (Workers egress IPs
// are shared and can be rate-limited by one endpoint but not another).
export const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
];
const MAX_URLS_PER_POST = 10_000;

/** 8–128 chars of a-z, A-Z, 0-9 and dashes. */
export function isValidIndexNowKey(key: string) {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key);
}

export async function getIndexNowKey() {
  const key = (await getAllConfigs())[INDEXNOW_CONFIG_KEY]?.trim();
  return key && isValidIndexNowKey(key) ? key : null;
}

export async function saveIndexNowKey(key: string) {
  await saveConfigs({ [INDEXNOW_CONFIG_KEY]: key.trim() });
}

export function siteOrigin() {
  return new URL(envConfigs.app_url).origin;
}

export function keyFileUrl(key: string) {
  return `${siteOrigin()}/${key}.txt`;
}

const MEANINGS: Record<number, string> = {
  200: 'OK — URLs submitted',
  202: 'Accepted — key validation pending',
  400: 'Bad request — invalid format',
  403: 'Forbidden — key not valid (key file missing or wrong content)',
  422: "Unprocessable — URLs don't belong to this host or key doesn't match",
  429: 'Too many requests — slow down',
};

/**
 * Submit URLs (must be on this site's host). Splits into 10k batches.
 * Returns one result per batch with the engine's status code.
 */
export async function submitUrls(key: string, urls: string[]) {
  const origin = siteOrigin();
  const host = new URL(origin).host;
  const list = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const foreign = list.filter((u) => {
    try {
      return new URL(u).host !== host;
    } catch {
      return true;
    }
  });
  if (foreign.length) {
    throw new Error(
      `URLs must be on ${host}: ${foreign.slice(0, 3).join(', ')}`
    );
  }
  if (!list.length) throw new Error('No URLs to submit');

  const results = [];
  for (let i = 0; i < list.length; i += MAX_URLS_PER_POST) {
    const batch = list.slice(i, i + MAX_URLS_PER_POST);
    const body = JSON.stringify({
      host,
      key,
      keyLocation: keyFileUrl(key),
      urlList: batch,
    });
    const attempts: { endpoint: string; status: number; meaning: string }[] =
      [];
    for (const endpoint of INDEXNOW_ENDPOINTS) {
      let status = 0;
      let meaning: string;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body,
        });
        status = res.status;
        meaning = MEANINGS[status] ?? (await res.text()).slice(0, 200);
      } catch (error: any) {
        meaning = error?.message || 'Network error';
      }
      attempts.push({ endpoint: new URL(endpoint).host, status, meaning });
      if (status === 200 || status === 202) break;
      // A bad request or key won't get better on another engine.
      if (status === 400 || status === 403 || status === 422) break;
    }
    const last = attempts[attempts.length - 1];
    results.push({
      ok: last.status === 200 || last.status === 202,
      count: batch.length,
      attempts,
    });
  }
  return results;
}
