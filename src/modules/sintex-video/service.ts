import { z } from 'zod';

import { AIMediaType, FalProvider } from '@/core/ai';
import { SINTEX_MODELS } from '@/config/sintex-ai-models';

export const videoInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(1500),
    model: z.enum(['wan', 'kling']),
    duration: z.enum(['5', '10']),
    aspect: z.enum(['vertical', 'wide', 'square']),
    imageData: z
      .string()
      .max(5_600_000)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/)
      .optional(),
  })
  .strict();

export type VideoInput = z.infer<typeof videoInputSchema>;

export function providerEndpoint(input: VideoInput) {
  const spec = SINTEX_MODELS[input.model];
  return input.imageData ? spec.imageEndpoint : spec.textEndpoint;
}

export async function submitVideo(apiKey: string, input: VideoInput) {
  const options: Record<string, unknown> = {
    duration: input.duration,
    enable_safety_checker: true,
  };
  if (input.model === 'wan') {
    options.resolution = '720p';
    options.enable_prompt_expansion = false;
    if (input.imageData) options.image_url = input.imageData;
  } else {
    options.generate_audio = true;
    if (input.imageData) options.start_image_url = input.imageData;
  }
  if (!input.imageData) {
    options.aspect_ratio = { vertical: '9:16', wide: '16:9', square: '1:1' }[
      input.aspect
    ];
  }
  return new FalProvider({ apiKey }).generate({
    params: {
      mediaType: AIMediaType.VIDEO,
      model: providerEndpoint(input),
      prompt: input.prompt,
      options,
    },
  });
}
