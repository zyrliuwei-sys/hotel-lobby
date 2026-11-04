import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import {
  isRoadDudePreset,
  type RoadDudePreset,
} from '@/config/hit-the-road-dude-ai';
import { SINTEX_VIDEO_EXAMPLES } from '@/config/sintex-ai-media';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { SintexAiPage } from '@/blocks/sintex-ai';

export const Route = createFileRoute('/sintex-ai')({
  validateSearch: (
    search: Record<string, unknown>
  ): { roadDude?: RoadDudePreset } =>
    isRoadDudePreset(search.roadDude) ? { roadDude: search.roadDude } : {},
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const title = m['syntx.meta.title']({}, { locale });
    const description = m['syntx.meta.description']({}, { locale });
    const urlFor = (loc: (typeof locales)[number]) =>
      localizeUrl(`${envConfigs.app_url}/sintex-ai`, { locale: loc }).href;

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:image',
          content: `${envConfigs.app_url}${SINTEX_VIDEO_EXAMPLES[0].poster}`,
        },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        { rel: 'canonical', href: urlFor(locale) },
        ...locales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: urlFor(loc),
        })),
        { rel: 'alternate', hrefLang: 'x-default', href: urlFor('en') },
      ],
    };
  },
  component: SintexPage,
});

function SintexPage() {
  const { roadDude } = Route.useSearch();
  return <SintexAiPage key={roadDude ?? 'default'} roadDude={roadDude} />;
}
