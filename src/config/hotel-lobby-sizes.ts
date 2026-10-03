/**
 * Output sizes offered by the Hotel Lobby generator (client-safe).
 *
 * The scene image sets the final video's frame, so each option is a
 * gpt-image-2 edit size (multiples of 16) inside DreamActor v2's accepted
 * image range (480–1920 px per side).
 *
 * Only OFFERED_DUET_SIZES are shown to users. Tested 2026-10-03: the
 * reference performance is 9:16, and a 16:9 scene animates with black side
 * bars and jumpy framing, so landscape/square stay hidden (kept here so
 * older previews made with them can still be animated).
 */

export const DUET_SIZES = {
  '9:16': {
    width: 720,
    height: 1280,
    framing:
      'Use a tall vertical 9:16 composition so both subjects remain clearly visible, framed from about the knees up.',
  },
  full: {
    width: 720,
    height: 1280,
    framing:
      'Use a tall vertical 9:16 composition showing both subjects in full body, head to toe, with their feet and shoes clearly visible standing on the floor and some orange space above their heads.',
  },
  '3:4': {
    width: 960,
    height: 1280,
    framing:
      'Use a vertical 3:4 composition so both subjects remain clearly visible, framed from about mid-thigh up.',
  },
  '1:1': {
    width: 1024,
    height: 1024,
    framing:
      'Use a square 1:1 composition so both subjects remain clearly visible, framed from about the waist up.',
  },
  '16:9': {
    width: 1280,
    height: 720,
    framing:
      'Use a wide horizontal 16:9 composition with generous orange space on both sides, both subjects framed from about the waist up.',
  },
} as const;

export type DuetSize = keyof typeof DUET_SIZES;

export const DEFAULT_DUET_SIZE: DuetSize = '9:16';

/** Framings offered in the generator: classic knees-up and full body. */
export const OFFERED_DUET_SIZES: DuetSize[] = ['9:16', 'full'];

export function isDuetSize(value: unknown): value is DuetSize {
  return typeof value === 'string' && value in DUET_SIZES;
}
