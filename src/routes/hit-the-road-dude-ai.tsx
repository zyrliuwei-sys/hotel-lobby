import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import {
  ROAD_DUDE_EXAMPLES,
  ROAD_DUDE_PATH,
} from '@/config/hit-the-road-dude-ai';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { HitTheRoadDudePage } from '@/blocks/hit-the-road-dude-ai';

export const Route = createFileRoute('/hit-the-road-dude-ai')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const title = m['road_dude.meta.title']({}, { locale });
    const description = m['road_dude.meta.description']({}, { locale });
    const urlFor = (loc: (typeof locales)[number], path = ROAD_DUDE_PATH) =>
      localizeUrl(new URL(path, envConfigs.app_url), { locale: loc }).href;
    const canonical = urlFor(locale);

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonical },
        {
          property: 'og:image',
          content: new URL(ROAD_DUDE_EXAMPLES[0].poster, envConfigs.app_url)
            .href,
        },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        { rel: 'canonical', href: canonical },
        ...locales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: urlFor(loc),
        })),
        { rel: 'alternate', hrefLang: 'x-default', href: urlFor('en') },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: m['syntx.nav.home']({}, { locale }),
                item: urlFor(locale, '/'),
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: m['road_dude.nav.title']({}, { locale }),
                item: canonical,
              },
            ],
          }),
        },
      ],
    };
  },
  component: HitTheRoadDudePage,
});
