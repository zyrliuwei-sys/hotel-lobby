import { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Flame,
  House,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import {
  ROAD_DUDE_EXAMPLES,
  ROAD_DUDE_PATH,
} from '@/config/hit-the-road-dude-ai';
import { SINTEX_VIDEO_EXAMPLES } from '@/config/sintex-ai-media';
import { m } from '@/paraglide/messages.js';

import '@/styles/video-navigation.css';

export function TrendingVideos() {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const links = [
    {
      href: '/sintex-ai',
      title: m['hotel.nav.syntx'](),
      description: m['video_nav.sintex'](),
      poster: SINTEX_VIDEO_EXAMPLES[0].poster,
    },
    {
      href: ROAD_DUDE_PATH,
      title: m['road_dude.nav.title'](),
      description: m['video_nav.road_dude'](),
      poster: ROAD_DUDE_EXAMPLES[0].poster,
    },
  ];

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const menu = menuRef.current;
      if (
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      ) {
        menu.open = false;
      }
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  return (
    <details
      ref={menuRef}
      className="video-trends"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.currentTarget.open = false;
          triggerRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary ref={triggerRef} className="video-trends-trigger">
        <Flame className="video-trends-flame" size={16} aria-hidden="true" />
        {m['video_nav.trending']()}
        <ChevronDown
          className="video-trends-chevron"
          size={14}
          aria-hidden="true"
        />
      </summary>
      <ul className="video-trends-panel">
        {links.map(({ href, title, description, poster }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
              }}
            >
              <img src={poster} alt="" width={68} height={44} loading="lazy" />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function VideoBreadcrumb({
  title,
  className,
}: {
  title: string;
  className: string;
}) {
  return (
    <nav
      className={`video-breadcrumb ${className}`}
      aria-label={m['video_nav.breadcrumb']()}
    >
      <ol>
        <li>
          <Link href="/">
            <House size={15} aria-hidden="true" />
            {m['syntx.nav.home']()}
          </Link>
        </li>
        <li aria-current="page">
          <ChevronRight size={14} aria-hidden="true" />
          {title}
        </li>
      </ol>
    </nav>
  );
}
