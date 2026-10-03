/**
 * Homepage image renditions (client-safe, no React).
 *
 * Compressed AVIF/WebP versions live in public/imgs/generated/opt/
 * <name>-<width>.<ext>; the originals stay as the fallback for browsers
 * without AVIF/WebP and for og:image. Kept out of blocks/hotel-lobby.tsx so
 * routes/index.tsx can preload the hero without pulling the whole page block
 * into the entry chunk.
 */

export function optSrcSet(name: string, widths: number[], ext: string) {
  return widths
    .map((w) => `/imgs/generated/opt/${name}-${w}.${ext} ${w}w`)
    .join(', ');
}

export const HERO_DESKTOP_WIDTHS = [960, 1280, 1672];
export const HERO_MOBILE_WIDTHS = [480, 768, 1024];
export const HERO_MOBILE_MEDIA = '(max-width: 600px)';
// The desktop hero is height-bound (≤720px tall at 1672:941), so it never
// renders wider than ~1280 CSS px — don't let 100vw pick the 1672 file.
export const HERO_DESKTOP_SIZES = 'min(100vw, 1280px)';
