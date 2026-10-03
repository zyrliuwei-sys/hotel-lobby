/**
 * Hotel Lobby duet credit pricing (client-safe, no server imports).
 *
 * 1 credit is sold at no less than $0.01 (see ./pricing.ts), and each video is
 * charged at ≥ 7× its fal cost:
 *   fal cost = GPT Image 2 edit scene (high quality; the priciest size, 1:1
 *              1024², lists at $0.22 — 9:16 measured ~$0.13) + DreamActor v2
 *              at $0.05 / second of the reference video.
 * Source: fal.ai model pages + fal dashboard request costs (2026-10-01).
 */

export const FAL_SCENE_IMAGE_USD = 0.22;
export const FAL_MOTION_USD_PER_SECOND = 0.05;
export const PRICE_MARKUP = 7;
export const USD_PER_CREDIT = 0.01;

// Length of the shipped reference video (public/videos/hotel-lobby-reference.mp4).
// Set hotel_lobby_video_seconds in admin if a different video is configured.
export const DEFAULT_REFERENCE_SECONDS = 8;

export function falCostUsd(referenceSeconds: number) {
  return FAL_SCENE_IMAGE_USD + FAL_MOTION_USD_PER_SECOND * referenceSeconds;
}

export function duetCredits(referenceSeconds = DEFAULT_REFERENCE_SECONDS) {
  const seconds = Math.min(Math.max(referenceSeconds, 1), 30);
  const credits = (falCostUsd(seconds) * PRICE_MARKUP) / USD_PER_CREDIT;
  // Round off float noise (0.6 × 7 / 0.01 = 420.00000000000006), then round
  // up to a whole 10 credits so prices read cleanly (434 → 440).
  return Math.ceil(Number(credits.toFixed(6)) / 10) * 10;
}

/**
 * Credits charged per video. An explicit admin override wins; otherwise the
 * price follows the configured reference video length.
 */
export function resolveDuetCredits(configs: Record<string, string>) {
  const override = Number(configs.hotel_lobby_credits);
  if (Number.isFinite(override) && override > 0) return Math.ceil(override);
  const seconds = Number(configs.hotel_lobby_video_seconds);
  return duetCredits(
    Number.isFinite(seconds) && seconds > 0
      ? seconds
      : DEFAULT_REFERENCE_SECONDS
  );
}

/**
 * Video lengths offered in the generator. Each maps to its own reference
 * performance (8 s: the original clip; 15 s: a two-person verse from the
 * COLORS session) and is priced at 7× its own fal cost.
 */
export const DUET_LENGTHS = { '8': 8, '15': 15 } as const;
export type DuetLength = keyof typeof DUET_LENGTHS;
export const DEFAULT_DUET_LENGTH: DuetLength = '8';

export function isDuetLength(value: unknown): value is DuetLength {
  return typeof value === 'string' && value in DUET_LENGTHS;
}

/**
 * Credits for one video of the given length. 8 s keeps the existing admin
 * settings (hotel_lobby_credits / hotel_lobby_video_seconds); 15 s can be
 * overridden with hotel_lobby_credits_15.
 */
export function resolveDuetCreditsFor(
  configs: Record<string, string>,
  length: DuetLength
) {
  if (length === '8') return resolveDuetCredits(configs);
  const override = Number(configs.hotel_lobby_credits_15);
  if (Number.isFinite(override) && override > 0) return Math.ceil(override);
  return duetCredits(DUET_LENGTHS[length]);
}
