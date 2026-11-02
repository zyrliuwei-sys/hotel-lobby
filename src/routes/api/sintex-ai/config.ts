import { createFileRoute } from '@tanstack/react-router';

import { SINTEX_MODELS, sintexCredits } from '@/config/sintex-ai-models';
import { getAllConfigs } from '@/modules/config/service';
import { respData } from '@/lib/resp';

export const Route = createFileRoute('/api/sintex-ai/config')({
  server: {
    handlers: {
      GET: async () => {
        const configs = await getAllConfigs();
        return respData(
          {
            available: Boolean(configs.fal_api_key),
            models: Object.keys(SINTEX_MODELS).map((id) => ({
              id,
              credits: {
                '5': sintexCredits(id as keyof typeof SINTEX_MODELS, '5'),
                '10': sintexCredits(id as keyof typeof SINTEX_MODELS, '10'),
              },
            })),
          },
          { headers: { 'cache-control': 'no-store' } }
        );
      },
    },
  },
});
