export const ROAD_DUDE_PATH = '/hit-the-road-dude-ai';

export const ROAD_DUDE_SOURCE =
  'https://www.media.io/ai/zh/explore/zone/hit-the-road-dude-ai-video';

export const ROAD_DUDE_ORIGINAL = 'https://www.youtube.com/watch?v=IjQwPjLMbxI';

// Public previews from Media.io's trend page. Store locally so the signed
// creator-gallery URLs can expire without breaking playback.
export const ROAD_DUDE_EXAMPLES = [
  { id: 'bulldog', width: 854, height: 480, duration: '0:15' },
  { id: 'driver', width: 480, height: 854, duration: '0:13' },
  { id: 'cat', width: 480, height: 854, duration: '0:16' },
  { id: 'carriage', width: 480, height: 854, duration: '0:15' },
].map((clip) => ({
  ...clip,
  src: `/videos${ROAD_DUDE_PATH}/${clip.id}.mp4`,
  poster: `/imgs${ROAD_DUDE_PATH}/${clip.id}.jpg`,
}));

const scene =
  'A single handheld shot from outside the open driver-side window of a parked white pickup beside a quiet fishing pond. The camera stays at window height, with soft daylight and trees in the background.';

export const ROAD_DUDE_PROMPTS = {
  dog: `${scene} Cast the dog from the reference photo as the driver, preserving its markings, ears and muzzle. One paw rests on the window sill. The dog gives a slow, unimpressed stare, then flicks its paw toward the road and says, "Hit the road, dude. This is private property." Natural English speech, a brief pause before the line, quiet outdoor ambience and no added captions.`,
  cat: `${scene} Cast the cat from the reference photo as the driver, preserving its fur pattern and eye color. The cat leans on the window, glances at the water and turns back to the camera with a long, deadpan stare. It lifts one paw slightly and says, "Hit the road, dude. This is private property." Quiet outdoor ambience, natural English speech and no added captions.`,
  driver: `${scene} Cast the person from the reference photo as the driver, keeping their recognizable face and clothing. The driver rests an elbow on the window and asks, "Who said you could fish here?" After a short pause, the driver points down the road and says, "Hit the road, dude." Calm deadpan delivery, natural daylight, quiet pond ambience and no added captions.`,
} as const;

export type RoadDudePreset = keyof typeof ROAD_DUDE_PROMPTS;

export function isRoadDudePreset(value: unknown): value is RoadDudePreset {
  return typeof value === 'string' && Object.hasOwn(ROAD_DUDE_PROMPTS, value);
}
