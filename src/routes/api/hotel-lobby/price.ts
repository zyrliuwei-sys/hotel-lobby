import { createFileRoute } from '@tanstack/react-router';

import {
  DUET_LENGTHS,
  resolveDuetCredits,
  resolveDuetCreditsFor,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import { getAllConfigs } from '@/modules/config/service';
import { respData, respErr } from '@/lib/resp';

// Public: credits one duet video costs, per length (generator + pricing).
async function GET() {
  try {
    const configs = await getAllConfigs();
    const lengths = Object.fromEntries(
      (Object.keys(DUET_LENGTHS) as DuetLength[]).map((l) => [
        l,
        resolveDuetCreditsFor(configs, l),
      ])
    ) as Record<DuetLength, number>;
    // `credits` (8 s) kept for callers that only know one price.
    return respData({ credits: resolveDuetCredits(configs), lengths });
  } catch (error: any) {
    return respErr(error?.message || 'Internal error');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/price')({
  server: { handlers: { GET } },
});
