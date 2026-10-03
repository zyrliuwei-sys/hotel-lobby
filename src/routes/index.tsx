import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import {
  HERO_DESKTOP_SIZES,
  HERO_DESKTOP_WIDTHS,
  HERO_MOBILE_MEDIA,
  HERO_MOBILE_WIDTHS,
  optSrcSet,
} from '@/config/hotel-lobby-images';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { HotelLobbyPage } from '@/blocks/hotel-lobby';

export const Route = createFileRoute('/')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const title = m['common.metadata.title']({}, { locale: locale as any });
    const description = m['common.metadata.description'](
      {},
      { locale: locale as any }
    );
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/`, { locale: loc as any }).href;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:image',
          content: `${envConfigs.app_url}/imgs/generated/hotel-lobby-duet.png`,
        },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        // LCP: the hero <picture> sits behind <source>s, which the browser
        // only discovers after layout — preload the matching rendition.
        {
          rel: 'preload',
          as: 'image',
          type: 'image/avif',
          media: HERO_MOBILE_MEDIA,
          imageSrcSet: optSrcSet('hero-mobile', HERO_MOBILE_WIDTHS, 'avif'),
          imageSizes: '100vw',
          fetchPriority: 'high',
        },
        {
          rel: 'preload',
          as: 'image',
          type: 'image/avif',
          media: '(min-width: 601px)',
          imageSrcSet: optSrcSet('hero-desktop', HERO_DESKTOP_WIDTHS, 'avif'),
          imageSizes: HERO_DESKTOP_SIZES,
          fetchPriority: 'high',
        },
        {
          rel: 'preload',
          as: 'image',
          type: 'image/webp',
          href: '/imgs/generated/opt/studio-backdrop-960.webp',
        },
        { rel: 'canonical', href: urlFor(locale) },
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
            '@type': 'WebPage',
            name: title,
            description,
            url: urlFor(locale),
            inLanguage: locale,
            primaryImageOfPage: `${envConfigs.app_url}/imgs/generated/hotel-lobby-duet.png`,
          }),
        },
      ],
    };
  },
  component: HotelLobbyPage,
});
