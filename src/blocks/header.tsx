import { m } from '@/paraglide/messages.js';
import { TrendingVideos } from '@/blocks/video-navigation';
import { SiteHeader } from '@/components/site-header';

export function Header() {
  const navLinks = [
    { href: '/#features', label: m['landing.nav.features']() },
    { href: '/pricing', label: m['landing.nav.pricing']() },
    { href: '/blog', label: m['landing.nav.blog']() },
  ];

  return (
    <SiteHeader
      navLinks={navLinks}
      logoAlt={m['hotel.logo_alt']()}
      featuredNav={<TrendingVideos />}
    />
  );
}
