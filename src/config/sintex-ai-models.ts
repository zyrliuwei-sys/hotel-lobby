export const SINTEX_MODELS = {
  wan: {
    label: 'Wan 2.5',
    textEndpoint: 'fal-ai/wan-25-preview/text-to-video',
    imageEndpoint: 'fal-ai/wan-25-preview/image-to-video',
    usdPerSecond: 0.1,
  },
  kling: {
    label: 'Kling 2.6 Pro',
    textEndpoint: 'fal-ai/kling-video/v2.6/pro/text-to-video',
    imageEndpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video',
    usdPerSecond: 0.14,
  },
} as const;

export type SintexModel = keyof typeof SINTEX_MODELS;
export type SintexAspect = 'vertical' | 'wide' | 'square';
export type SintexDuration = '5' | '10';

export function sintexCredits(model: SintexModel, duration: SintexDuration) {
  return (
    Math.ceil(
      (SINTEX_MODELS[model].usdPerSecond * Number(duration) * 7) / 0.1 - 1e-9
    ) * 10
  );
}

export interface SintexTask {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'canceled';
  model: SintexModel;
  duration: SintexDuration;
  aspect: SintexAspect;
  imageInput: boolean;
  videoUrl: string | null;
  error: string | null;
}
