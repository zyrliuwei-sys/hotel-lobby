import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import {
  HERO_DESKTOP_SIZES,
  HERO_DESKTOP_WIDTHS,
  HERO_MOBILE_MEDIA,
  HERO_MOBILE_WIDTHS,
  optSrcSet,
} from '@/config/hotel-lobby-images';
import {
  DEFAULT_DUET_LENGTH,
  DUET_LENGTHS,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import {
  DEFAULT_DUET_SIZE,
  DUET_SIZES,
  OFFERED_DUET_SIZES,
  type DuetSize,
} from '@/config/hotel-lobby-sizes';
import { apiGet, apiPost } from '@/lib/api-client';
import { draftDelete, draftGet, draftSet } from '@/lib/draft-store';
import { track } from '@/lib/track';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Pricing } from '@/blocks/pricing';
import { FooterBadgeList } from '@/components/footer-badge-list';

import '@/styles/hotel-lobby.css';

// Popups load on demand: the user menu only exists for signed-in visitors and
// the paywall only after running out of credits — keep their dialog/menu code
// out of the homepage's initial JS.
const SiteUserMenu = lazy(() =>
  import('@/components/site-user-menu').then((mod) => ({
    default: mod.SiteUserMenu,
  }))
);
const PaywallDialog = lazy(() => import('@/blocks/paywall-dialog'));

const heroImage = '/imgs/generated/hotel-lobby-duet.png';
const mobileHeroImage = '/imgs/generated/duet-hero-mobile.jpg';
const previewImage = '/imgs/generated/duet-scene-preview.jpg';
const friendsImage = '/imgs/generated/duet-friends.jpg';
const siblingsImage = '/imgs/generated/duet-siblings.jpg';
const coupleImage = '/imgs/generated/duet-couple.jpg';

const IDEA_SIZES = '(max-width: 600px) 100vw, (max-width: 1020px) 50vw, 420px';

/** <picture> with AVIF → WebP → original fallback; lazy unless `eager`. */
function OptImage({
  name,
  widths,
  sizes,
  src,
  eager,
  ...img
}: {
  name: string;
  widths: number[];
  sizes: string;
  src: string;
  eager?: boolean;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={optSrcSet(name, widths, 'avif')}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={optSrcSet(name, widths, 'webp')}
        sizes={sizes}
      />
      <img
        src={src}
        loading={eager ? undefined : 'lazy'}
        decoding="async"
        {...img}
      />
    </picture>
  );
}

// Finished duet clips shown under the hero (muted autoplay loops). Drop MP4s
// into public/videos/examples/ and list them here; the strip hides when empty.
const exampleVideos: { src: string; poster?: string }[] = [];

const INSUFFICIENT_CREDITS = 'Insufficient credits';

type DuetTask = {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  stage: 'scene' | 'motion' | null;
  sceneImageUrl: string | null;
  videoUrl: string | null;
  error: string | null;
};

type DuetPreview = {
  id: string;
  status: 'pending' | 'success' | 'failed';
  size: string;
  imageUrl: string | null;
  animatedTaskId: string | null;
  error: string | null;
};

type FreeQuota = { left: number; reason: string | null };

const FREE_PREVIEW_USED = 'FREE_PREVIEW_USED';
const FREE_PREVIEW_PAUSED = 'FREE_PREVIEW_PAUSED';
const DIRECTION_BLOCKED = 'DIRECTION_BLOCKED';

type Saved = { previewId?: string; taskId?: string; at: number };
const SAVED_KEY = 'hl-duet';
const SAVED_TTL = 3 * 24 * 60 * 60 * 1000;

// Unsent form (photos + options) kept in IndexedDB so it survives the
// sign-in redirect (Google OAuth leaves the site) and reloads. Device-local,
// never uploaded; dropped after a day.
type Draft = {
  photoA: File | null;
  photoB: File | null;
  direction: string;
  size: DuetSize;
  length: DuetLength;
  consent: boolean;
  at: number;
};
const DRAFT_KEY = 'hl-create-draft';
const DRAFT_TTL = 24 * 60 * 60 * 1000;

function loadSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    return saved && Date.now() - saved.at < SAVED_TTL ? saved : null;
  } catch {
    return null;
  }
}

// Preview the visitor asked to animate before being sent to sign up.
const RESUME_KEY = 'hl-resume-animate';

function resumeAnimate(previewId?: string) {
  try {
    if (previewId) {
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ previewId, at: Date.now() })
      );
    }
  } catch {}
}

/** The pending preview id (if fresh), cleared so it only resumes once. */
function takeResumeAnimate(): string | undefined {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return undefined;
    localStorage.removeItem(RESUME_KEY);
    const { previewId, at } = JSON.parse(raw);
    return Date.now() - at < 60 * 60 * 1000 ? previewId : undefined;
  } catch {
    return undefined;
  }
}

function saveState(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Private mode / blocked storage: the flow still works, just not resumable.
  }
}

// Free stills are drawn onto a canvas with a tiled watermark, so neither
// "save image" nor a screenshot yields a clean frame.
function WatermarkedImage({
  src,
  alt,
  label,
  onError,
}: {
  src: string;
  alt: string;
  label: string;
  onError: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const step = Math.max(canvas.width, canvas.height) / 5;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.font = `700 ${Math.round(step / 6)}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.textAlign = 'center';
      const span = Math.max(canvas.width, canvas.height) * 1.5;
      const gap = ctx.measureText(label).width + step * 0.6;
      for (let y = -span, row = 0; y < span; y += step, row++) {
        for (let x = -span; x < span; x += gap) {
          ctx.fillText(label, x + (row % 2) * (gap / 2), y);
        }
      }
      ctx.restore();
    };
    img.onerror = onError;
    // Fetched as a blob (not <img src>) so the request is a plain API call;
    // dev servers treat image-destination requests as static assets.
    let objectUrl: string | undefined;
    let cancelled = false;
    fetch(src)
      .then((res) => (res.ok ? res.blob() : Promise.reject(res.status)))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      })
      .catch(() => !cancelled && onError());
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, label]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// Downscale to ≤1536px JPEG so uploads stay small; fal accepts data URIs.
async function toDataUrl(file: File, maxSide = 1536): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

function PhotoInput({
  label,
  side,
  file,
  onFile,
}: {
  label: string;
  side: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  // Derived from the file prop so a draft restored after sign-in shows too.
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) return setPreview(undefined);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <label className="hl-upload">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (file && file.size > 10 * 1024 * 1024) {
            alert(m['hotel.upload_limit']());
            e.target.value = '';
            return;
          }
          onFile(file);
        }}
      />
      {preview ? (
        <img src={preview} alt={label} className="hl-upload-preview" />
      ) : (
        <Upload size={24} strokeWidth={1.5} />
      )}
      <span>{label}</span>
      <small>{side}</small>
    </label>
  );
}

export function HotelLobbyPage() {
  const [photoA, setPhotoA] = useState<File | null>(null);
  const [photoB, setPhotoB] = useState<File | null>(null);
  const [direction, setDirection] = useState('');
  const [size, setSize] = useState<DuetSize>(DEFAULT_DUET_SIZE);
  const [length, setLength] = useState<DuetLength>(DEFAULT_DUET_LENGTH);
  const [previewId, setPreviewId] = useState<string>();
  const [taskId, setTaskId] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [menu, setMenu] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;
  const canGenerate = consent && !!photoA && !!photoB;
  const queryClient = useQueryClient();
  const [paywall, setPaywall] = useState(false);
  // Mount the (lazy) paywall dialog on first open and keep it mounted, so
  // its close animation and later opens behave as before.
  const [paywallMounted, setPaywallMounted] = useState(false);
  if (paywall && !paywallMounted) setPaywallMounted(true);

  // Survive the sign-in / checkout round trip and reloads mid-generation:
  // the preview and task ids live in localStorage, photos aren't needed again.
  useEffect(() => {
    const saved = loadSaved();
    if (!saved) return;
    setPreviewId(saved.previewId);
    setTaskId(saved.taskId);
    if (Date.now() - saved.at < 2 * 60 * 60 * 1000) {
      setTimeout(
        () =>
          document
            .getElementById('create')
            ?.scrollIntoView({ behavior: 'smooth' }),
        300
      );
    }
  }, []);
  // Restore the unsent form, then keep it saved. `draftReady` stops the save
  // effect from overwriting the draft with the empty initial state.
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    draftGet<Draft>(DRAFT_KEY).then((d) => {
      if (d && Date.now() - d.at < DRAFT_TTL) {
        setPhotoA(d.photoA);
        setPhotoB(d.photoB);
        setDirection(d.direction);
        if (OFFERED_DUET_SIZES.includes(d.size)) setSize(d.size);
        if (d.length in DUET_LENGTHS) setLength(d.length);
        setConsent(d.consent);
      }
      setDraftReady(true);
    });
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    if (!photoA && !photoB && !direction.trim()) {
      draftDelete(DRAFT_KEY);
      return;
    }
    draftSet(DRAFT_KEY, {
      photoA,
      photoB,
      direction,
      size,
      length,
      consent,
      at: Date.now(),
    } satisfies Draft);
  }, [draftReady, photoA, photoB, direction, size, length, consent]);
  // Only ever written here; cleared explicitly by `forget` so a (re)mount
  // with empty state can't wipe what the restore above is about to read.
  useEffect(() => {
    if (previewId || taskId) saveState({ previewId, taskId, at: Date.now() });
  }, [previewId, taskId]);
  const forget = () => {
    saveState(null);
    setTaskId(undefined);
    setPreviewId(undefined);
  };

  const quotaQuery = useQuery({
    queryKey: ['hotel-lobby-free'],
    queryFn: () => apiGet<FreeQuota>('/api/hotel-lobby/preview'),
  });
  const freeLeft = quotaQuery.data?.left ?? 0;

  const makePreview = useMutation({
    mutationFn: async () =>
      apiPost<DuetPreview>('/api/hotel-lobby/preview', {
        photoA: await toDataUrl(photoA!),
        photoB: await toDataUrl(photoB!),
        direction: direction.trim() || undefined,
        size,
      }),
    onMutate: () => track('hl_preview_start', { size }),
    onSuccess: (preview) => {
      setTaskId(undefined);
      setPreviewId(preview.id);
      queryClient.invalidateQueries({ queryKey: ['hotel-lobby-free'] });
    },
    onError: (e: Error) => {
      if (
        e.message === FREE_PREVIEW_USED ||
        e.message === FREE_PREVIEW_PAUSED
      ) {
        track('hl_preview_limit', { reason: e.message });
        queryClient.invalidateQueries({ queryKey: ['hotel-lobby-free'] });
      }
    },
  });

  const previewQuery = useQuery({
    queryKey: ['hotel-lobby-preview', previewId],
    queryFn: () =>
      apiGet<DuetPreview>(`/api/hotel-lobby/preview?id=${previewId}`),
    enabled: !!previewId,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 4000 : false,
  });
  const preview = previewQuery.data;
  useEffect(() => {
    if (preview?.status === 'success') track('hl_preview_ready');
    // A preview animated in another tab/session: follow its task.
    if (preview?.animatedTaskId && !taskId) setTaskId(preview.animatedTaskId);
  }, [preview?.status, preview?.animatedTaskId]);
  // Saved id that no longer exists (or expired), or a not-yet-animated preview
  // in a framing no longer offered (old 1:1 / 3:4 / 16:9): forget it quietly.
  useEffect(() => {
    if (
      previewQuery.error ||
      (preview &&
        !preview.animatedTaskId &&
        !OFFERED_DUET_SIZES.includes(preview.size as DuetSize))
    ) {
      forget();
    }
  }, [previewQuery.error, preview?.size, preview?.animatedTaskId]);

  const onTaskStarted = (task: DuetTask) => {
    setTaskId(task.id);
    track('hl_video_start');
    queryClient.invalidateQueries({ queryKey: ['credits'] });
  };
  const onPaidError = (e: Error) => {
    if (e.message === INSUFFICIENT_CREDITS) openPaywall();
  };

  const animate = useMutation({
    mutationFn: () =>
      apiPost<DuetTask>('/api/hotel-lobby/animate', { previewId, length }),
    onSuccess: onTaskStarted,
    onError: onPaidError,
  });

  const generate = useMutation({
    mutationFn: async () =>
      apiPost<DuetTask>('/api/hotel-lobby/generate', {
        photoA: await toDataUrl(photoA!),
        photoB: await toDataUrl(photoB!),
        direction: direction.trim() || undefined,
        size,
        length,
      }),
    onSuccess: (task) => {
      setPreviewId(undefined);
      onTaskStarted(task);
    },
    // Server is the source of truth: out of credits → show the paywall.
    onError: onPaidError,
  });

  const taskQuery = useQuery({
    queryKey: ['hotel-lobby-task', taskId],
    queryFn: () => apiGet<DuetTask>(`/api/hotel-lobby/task?id=${taskId}`),
    enabled: !!taskId && !!user,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'failed' ? false : 5000;
    },
  });
  const task = taskQuery.data;
  useEffect(() => {
    if (task?.status === 'success') track('hl_video_ready');
  }, [task?.status]);
  const priceQuery = useQuery({
    queryKey: ['hotel-lobby-price'],
    queryFn: () =>
      apiGet<{ credits: number; lengths?: Record<DuetLength, number> }>(
        '/api/hotel-lobby/price'
      ),
    staleTime: 10 * 60_000,
  });
  const creditsQuery = useQuery({
    queryKey: ['credits'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
    enabled: !!user,
  });
  const { data: permissions } = useUserPermissions(!!user);
  // Price of the selected length (older API responses only had `credits`).
  const price =
    priceQuery.data?.lengths?.[length] ??
    (length === DEFAULT_DUET_LENGTH ? priceQuery.data?.credits : undefined);
  const openPaywall = () => {
    track('hl_paywall_open');
    setPaywall(true);
  };
  // Pre-check so an unpaid user sees the plans before anything is submitted.
  const lacksCredits = () => {
    const balance = creditsQuery.data?.balance;
    return (
      !permissions?.isAdmin &&
      balance !== undefined &&
      price !== undefined &&
      balance < price
    );
  };
  const startGenerate = () => {
    if (lacksCredits()) return openPaywall();
    generate.mutate();
  };
  const startAnimate = () => {
    track('hl_animate_click', { signed_in: user ? 1 : 0 });
    if (!user) {
      track('hl_sign_in_prompt');
      resumeAnimate(previewId);
      window.location.href = localizeHref(
        `/sign-up?callbackUrl=${encodeURIComponent('/')}`
      );
      return;
    }
    if (lacksCredits()) return openPaywall();
    animate.mutate();
  };

  const previewReady = preview?.status === 'success' && !taskId;
  // Back from sign-up with the preview they wanted animated: carry on (or show
  // the plans) without making them find and click the button again.
  useEffect(() => {
    if (
      user &&
      previewReady &&
      price !== undefined &&
      creditsQuery.data !== undefined &&
      takeResumeAnimate() === previewId
    ) {
      startAnimate();
    }
  }, [user, previewReady, price, creditsQuery.data, previewId]);
  const previewRunning =
    makePreview.isPending || (!!previewId && preview?.status === 'pending');
  const taskRunning =
    generate.isPending ||
    animate.isPending ||
    (!!taskId && task?.status !== 'success' && task?.status !== 'failed');
  const running = previewRunning || taskRunning;
  // Why the free preview isn't offered: from a rejected attempt, or — for a
  // signed-out visitor — straight from the quota, so the page says "today's
  // free preview is used" instead of silently showing only "Sign in".
  const freeReason =
    makePreview.error?.message ??
    (!user && !previewId && !taskId && quotaQuery.data?.left === 0
      ? quotaQuery.data.reason
      : null);
  const freeError =
    freeReason === FREE_PREVIEW_USED
      ? m['hotel.create.free_used']()
      : freeReason === FREE_PREVIEW_PAUSED
        ? m['hotel.create.free_paused']()
        : null;
  const paidError = (e: Error | null) =>
    e?.message === INSUFFICIENT_CREDITS ? null : e?.message;
  const blockedNote =
    [generate.error, makePreview.error].some(
      (e) => e?.message === DIRECTION_BLOCKED
    ) && m['hotel.create.direction_blocked']();
  const error =
    (blockedNote || null) ??
    paidError(generate.error) ??
    paidError(animate.error) ??
    (freeError ? null : makePreview.error?.message) ??
    // Provider errors mean nothing to the visitor; say what it cost them.
    (preview?.status === 'failed' && !taskId
      ? m['hotel.create.preview_failed']()
      : null) ??
    (task?.status === 'failed' ? m['hotel.create.video_failed']() : null) ??
    null;
  // The inline status line is easy to miss below the button; also toast.
  useEffect(() => {
    if (error) toast.error(`${m['hotel.create.failed']()}: ${error}`);
  }, [error]);
  const reset = () => {
    generate.reset();
    animate.reset();
    makePreview.reset();
    forget();
  };
  // A preview/video belongs to the photos and framing it was made from:
  // changing either starts over, so the next click can't animate a stale one.
  const changeInput =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      if (previewId || taskId) reset();
    };
  const credits = price?.toLocaleString('en-US') ?? '…';

  return (
    <div className="hotel-page">
      <header className="hl-header">
        <Link href="/" className="hl-brand">
          <img
            src={envConfigs.app_logo}
            alt={m['hotel.logo_alt']()}
            width={512}
            height={512}
            className="hl-brand-mark"
          />
          <span>{envConfigs.app_name}</span>
        </Link>
        <nav
          className={menu ? 'hl-nav hl-nav-open' : 'hl-nav'}
          aria-label={m['hotel.nav_label']()}
        >
          <a href="#create" onClick={() => setMenu(false)}>
            {m['hotel.nav.create']()}
          </a>
          <a href="#how" onClick={() => setMenu(false)}>
            {m['hotel.nav.how']()}
          </a>
          <a href="#ideas" onClick={() => setMenu(false)}>
            {m['hotel.nav.ideas']()}
          </a>
          <a href="#faq" onClick={() => setMenu(false)}>
            {m['hotel.nav.faq']()}
          </a>
          <a href="#pricing" onClick={() => setMenu(false)}>
            {m['hotel.nav.pricing']()}
          </a>
        </nav>
        <div className="hl-header-actions">
          {user ? (
            <Suspense fallback={<span className="block size-9" />}>
              <SiteUserMenu
                name={user.name || user.email}
                email={user.email}
                image={user.image}
              />
            </Suspense>
          ) : (
            <Link className="hl-nav-cta" href="/sign-in">
              {m['common.sign.sign_in_title']()} <ArrowRight size={16} />
            </Link>
          )}
          <button
            className="hl-menu"
            onClick={() => setMenu(!menu)}
            aria-label={m['hotel.nav_label']()}
          >
            {menu ? <X /> : <span>☰</span>}
          </button>
        </div>
      </header>

      <main>
        <section className="hl-hero">
          <div className="hl-hero-frame">
            {/* Preloaded in routes/index.tsx — keep the srcsets in sync. */}
            <picture>
              <source
                media={HERO_MOBILE_MEDIA}
                type="image/avif"
                srcSet={optSrcSet('hero-mobile', HERO_MOBILE_WIDTHS, 'avif')}
                sizes="100vw"
              />
              <source
                media={HERO_MOBILE_MEDIA}
                type="image/webp"
                srcSet={optSrcSet('hero-mobile', HERO_MOBILE_WIDTHS, 'webp')}
                sizes="100vw"
              />
              <source media={HERO_MOBILE_MEDIA} srcSet={mobileHeroImage} />
              <source
                type="image/avif"
                srcSet={optSrcSet('hero-desktop', HERO_DESKTOP_WIDTHS, 'avif')}
                sizes={HERO_DESKTOP_SIZES}
              />
              <source
                type="image/webp"
                srcSet={optSrcSet('hero-desktop', HERO_DESKTOP_WIDTHS, 'webp')}
                sizes={HERO_DESKTOP_SIZES}
              />
              <img
                src={heroImage}
                alt={m['hotel.hero.image_alt']()}
                width={1672}
                height={941}
                fetchPriority="high"
              />
            </picture>
          </div>
          <div className="hl-hero-copy">
            <p className="hl-kicker">{m['hotel.hero.eyebrow']()}</p>
            <h1>{m['hotel.hero.title']()}</h1>
            <p className="hl-tagline">{m['hotel.hero.tagline']()}</p>
            <p className="hl-subtitle">{m['hotel.hero.subtitle']()}</p>
            <a href="#create" className="hl-button">
              {m['hotel.hero.cta']()} <ArrowRight size={18} />
            </a>
            <ul className="hl-trust">
              <li>{m['hotel.hero.trust_free']()}</li>
              <li>{m['hotel.hero.trust_time']()}</li>
              <li>{m['hotel.hero.trust_spec']()}</li>
              <li>{m['hotel.hero.trust_refund']()}</li>
            </ul>
          </div>
        </section>

        {exampleVideos.length > 0 && (
          <section className="hl-examples">
            {exampleVideos.map((video) => (
              <video
                key={video.src}
                src={video.src}
                poster={video.poster}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ))}
          </section>
        )}

        <section className="hl-explainer" aria-labelledby="filter-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.explainer.eyebrow']()}</p>
            <h2 id="filter-heading">{m['hotel.explainer.title']()}</h2>
          </div>
          <div className="hl-prose">
            <p>{m['hotel.explainer.origin']()}</p>
            <p>{m['hotel.explainer.one']()}</p>
            <p>{m['hotel.explainer.two']()}</p>
            <p>{m['hotel.explainer.three']()}</p>
          </div>
        </section>

        <section id="create" className="hl-create">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.create.eyebrow']()}</p>
            <h2>{m['hotel.create.title']()}</h2>
            <p>{m['hotel.create.description']()}</p>
          </div>
          <div className="hl-create-grid">
            <div className="hl-create-form">
              <div className="hl-form-top">
                <span className="hl-step">{m['hotel.create.photos']()}</span>
                <span>{m['hotel.create.format']()}</span>
              </div>
              <div className="hl-upload-grid">
                <PhotoInput
                  label={m['hotel.create.person_a']()}
                  side={m['hotel.create.left']()}
                  file={photoA}
                  onFile={changeInput(setPhotoA)}
                />
                <PhotoInput
                  label={m['hotel.create.person_b']()}
                  side={m['hotel.create.right']()}
                  file={photoB}
                  onFile={changeInput(setPhotoB)}
                />
              </div>
              <p className="hl-field-label" id="duet-size-label">
                {m['hotel.create.size']()}
              </p>
              <div
                className="hl-sizes"
                role="radiogroup"
                aria-labelledby="duet-size-label"
              >
                {OFFERED_DUET_SIZES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={size === key}
                    className="hl-size"
                    disabled={running}
                    onClick={() => key !== size && changeInput(setSize)(key)}
                  >
                    <span
                      className="hl-size-shape"
                      style={{
                        aspectRatio: `${DUET_SIZES[key].width} / ${DUET_SIZES[key].height}`,
                      }}
                    />
                    <span>
                      {key === 'full'
                        ? m['hotel.create.shot_full']()
                        : m['hotel.create.shot_classic']()}
                    </span>
                  </button>
                ))}
              </div>
              <p className="hl-field-label" id="duet-length-label">
                {m['hotel.create.length']()}
              </p>
              <div
                className="hl-sizes"
                role="radiogroup"
                aria-labelledby="duet-length-label"
              >
                {(Object.keys(DUET_LENGTHS) as DuetLength[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={length === key}
                    className="hl-size"
                    disabled={running}
                    onClick={() => setLength(key)}
                  >
                    <span className="hl-length-seconds">
                      {m['hotel.create.length_seconds']({ seconds: key })}
                    </span>
                    <span>
                      {priceQuery.data?.lengths?.[key]?.toLocaleString(
                        'en-US'
                      ) ?? '…'}{' '}
                      {m['hotel.create.length_credits']()}
                    </span>
                  </button>
                ))}
              </div>
              <label className="hl-field-label" htmlFor="direction">
                {m['hotel.create.direction']()}
              </label>
              <textarea
                id="direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                maxLength={400}
                placeholder={m['hotel.create.placeholder']()}
              />
              <label className="hl-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{m['hotel.create.consent']()}</span>
              </label>
              <div className="hl-form-actions">
                {task?.status === 'success' || task?.status === 'failed' ? (
                  <button className="hl-button" type="button" onClick={reset}>
                    {m['hotel.create.again']()} <ArrowRight size={17} />
                  </button>
                ) : previewReady ? (
                  <>
                    <button
                      className={`hl-button ${animate.isPending ? 'hl-disabled' : ''}`}
                      type="button"
                      disabled={animate.isPending}
                      onClick={startAnimate}
                    >
                      {animate.isPending && (
                        <Loader2 size={17} className="animate-spin" />
                      )}
                      {user
                        ? m['hotel.create.animate']({ credits })
                        : m['hotel.create.animate_sign_in']()}
                      {!animate.isPending && <ArrowRight size={17} />}
                    </button>
                    <button
                      className="hl-outline"
                      type="button"
                      onClick={reset}
                    >
                      {m['hotel.create.start_over']()}
                    </button>
                  </>
                ) : freeLeft > 0 && !taskId ? (
                  <button
                    className={`hl-button ${!canGenerate || running ? 'hl-disabled' : ''}`}
                    type="button"
                    disabled={!canGenerate || running}
                    onClick={() => makePreview.mutate()}
                  >
                    {running && <Loader2 size={17} className="animate-spin" />}
                    {m['hotel.create.free_preview']()}
                    {!running && <ArrowRight size={17} />}
                  </button>
                ) : !user ? (
                  <Link
                    className="hl-button"
                    href={`/sign-up?callbackUrl=${encodeURIComponent('/')}`}
                  >
                    {m['hotel.create.sign_in']()} <ArrowRight size={17} />
                  </Link>
                ) : (
                  <button
                    className={`hl-button ${!canGenerate || running ? 'hl-disabled' : ''}`}
                    type="button"
                    disabled={!canGenerate || running}
                    onClick={startGenerate}
                  >
                    {running && <Loader2 size={17} className="animate-spin" />}
                    {m['hotel.create.generate']()}
                    {!running && <ArrowRight size={17} />}
                  </button>
                )}
                {task?.videoUrl && (
                  <>
                    <a
                      className="hl-outline"
                      href={`/api/hotel-lobby/download?id=${task.id}`}
                      download
                    >
                      {m['hotel.create.download']()} <Download size={17} />
                    </a>
                    <Link className="hl-outline" href="/settings/videos">
                      {m['hotel.create.my_videos']()}
                    </Link>
                  </>
                )}
              </div>
              {price !== undefined && !previewReady && (
                <p className="hl-hint">
                  {freeLeft > 0 && !previewReady && !taskId
                    ? `${m['hotel.create.free_note']()} `
                    : ''}
                  {m['hotel.create.cost']({ credits })}{' '}
                  <a href="#pricing">{m['hotel.create.buy_credits']()}</a>
                </p>
              )}
              <p className="hl-hint" role="status" aria-live="polite">
                {error
                  ? `${m['hotel.create.failed']()}: ${error}`
                  : freeError
                    ? freeError
                    : task?.status === 'success'
                      ? m['hotel.create.done']()
                      : generate.isPending
                        ? m['hotel.create.submitting']()
                        : task?.stage === 'motion'
                          ? `${m['hotel.create.stage_motion']()} ${m['hotel.create.keep_open']()}`
                          : taskId
                            ? `${m['hotel.create.stage_scene']()} ${m['hotel.create.keep_open']()}`
                            : previewReady
                              ? m['hotel.create.preview_ready']({ credits })
                              : makePreview.isPending
                                ? m['hotel.create.submitting']()
                                : previewRunning
                                  ? m['hotel.create.preview_working']()
                                  : photoA && photoB
                                    ? m['hotel.create.ready']()
                                    : m['hotel.create.hint']()}
              </p>
            </div>
            <aside className="hl-preview">
              <div className="hl-preview-media">
                {task?.videoUrl ? (
                  <video
                    src={task.videoUrl}
                    poster={task.sceneImageUrl ?? undefined}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : task?.sceneImageUrl ? (
                  <img
                    src={task.sceneImageUrl}
                    alt={m['hotel.hero.image_alt']()}
                    width={1024}
                    height={1536}
                  />
                ) : preview?.imageUrl ? (
                  <WatermarkedImage
                    src={preview.imageUrl}
                    alt={m['hotel.hero.image_alt']()}
                    label={m['hotel.create.watermark']()}
                    onError={forget}
                  />
                ) : (
                  <OptImage
                    name="scene-preview"
                    widths={[480, 768]}
                    sizes="(max-width: 600px) 100vw, 480px"
                    src={previewImage}
                    alt={m['hotel.hero.image_alt']()}
                    width={1024}
                    height={1536}
                  />
                )}
              </div>
              <div className="hl-preview-caption">
                <span>{m['hotel.create.preview']()}</span>
                <span>{m['hotel.create.duet']()}</span>
              </div>
              <p>{m['hotel.create.preview_note']()}</p>
            </aside>
          </div>
        </section>

        <section id="how" className="hl-how">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.how.eyebrow']()}</p>
            <h2>{m['hotel.how.title']()}</h2>
          </div>
          <div className="hl-how-grid">
            <article>
              <h3>{m['hotel.how.one.title']()}</h3>
              <p>{m['hotel.how.one.text']()}</p>
            </article>
            <article>
              <h3>{m['hotel.how.two.title']()}</h3>
              <p>{m['hotel.how.two.text']()}</p>
            </article>
            <article>
              <h3>{m['hotel.how.three.title']()}</h3>
              <p>{m['hotel.how.three.text']()}</p>
            </article>
          </div>
        </section>

        <section id="ideas" className="hl-ideas">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.ideas.eyebrow']()}</p>
            <h2>{m['hotel.ideas.title']()}</h2>
            <p>{m['hotel.ideas.description']()}</p>
          </div>
          <div className="hl-ideas-grid">
            <article>
              <div className="hl-idea-media">
                <OptImage
                  name="friends"
                  widths={[640, 960]}
                  sizes={IDEA_SIZES}
                  src={friendsImage}
                  alt={m['hotel.ideas.image_alt']()}
                  width={1536}
                  height={1024}
                />
              </div>
              <h3>{m['hotel.ideas.friends.title']()}</h3>
              <p>{m['hotel.ideas.friends.text']()}</p>
            </article>
            <article>
              <div className="hl-idea-media">
                <OptImage
                  name="siblings"
                  widths={[640, 960]}
                  sizes={IDEA_SIZES}
                  src={siblingsImage}
                  alt={m['hotel.ideas.siblings.image_alt']()}
                  width={1536}
                  height={1024}
                />
              </div>
              <h3>{m['hotel.ideas.siblings.title']()}</h3>
              <p>{m['hotel.ideas.siblings.text']()}</p>
            </article>
            <article>
              <div className="hl-idea-media">
                <OptImage
                  name="couple"
                  widths={[640, 960]}
                  sizes={IDEA_SIZES}
                  src={coupleImage}
                  alt={m['hotel.ideas.couples.image_alt']()}
                  width={1536}
                  height={1024}
                />
              </div>
              <h3>{m['hotel.ideas.couples.title']()}</h3>
              <p>{m['hotel.ideas.couples.text']()}</p>
            </article>
          </div>
        </section>

        <section className="hl-guide" aria-labelledby="guide-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.guide.eyebrow']()}</p>
            <h2 id="guide-heading">{m['hotel.guide.title']()}</h2>
            <p>{m['hotel.guide.intro']()}</p>
          </div>
          <div className="hl-guide-grid">
            <article>
              <span>01</span>
              <h3>{m['hotel.guide.photos.title']()}</h3>
              <p>{m['hotel.guide.photos.text']()}</p>
            </article>
            <article>
              <span>02</span>
              <h3>{m['hotel.guide.motion.title']()}</h3>
              <p>{m['hotel.guide.motion.text']()}</p>
            </article>
            <article>
              <span>03</span>
              <h3>{m['hotel.guide.review.title']()}</h3>
              <p>{m['hotel.guide.review.text']()}</p>
            </article>
          </div>
        </section>

        <section className="hl-prompt-guide" aria-labelledby="prompt-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.prompt.eyebrow']()}</p>
            <h2 id="prompt-heading">{m['hotel.prompt.title']()}</h2>
            <div className="hl-prompt-ratio" aria-hidden="true">
              <span>9:16</span>
            </div>
          </div>
          <div className="hl-prose">
            <p>{m['hotel.prompt.one']()}</p>
            <p>{m['hotel.prompt.two']()}</p>
            <CopyPrompt />
          </div>
        </section>

        <Pricing />

        {paywallMounted && (
          <Suspense fallback={null}>
            <PaywallDialog open={paywall} onOpenChange={setPaywall} />
          </Suspense>
        )}

        <section id="faq" className="hl-faq" aria-labelledby="faq-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.faq.eyebrow']()}</p>
            <h2 id="faq-heading">{m['hotel.faq.title']()}</h2>
          </div>
          <div className="hl-faq-list">
            {/* Static message refs: a template-literal key (m[`…${x}`])
                pulls every message of both locales into the client bundle. */}
            {[
              [m['hotel.faq.one.question'], m['hotel.faq.one.answer']],
              [m['hotel.faq.two.question'], m['hotel.faq.two.answer']],
              [m['hotel.faq.three.question'], m['hotel.faq.three.answer']],
              [m['hotel.faq.four.question'], m['hotel.faq.four.answer']],
              [m['hotel.faq.five.question'], m['hotel.faq.five.answer']],
              [m['hotel.faq.six.question'], m['hotel.faq.six.answer']],
              [m['hotel.faq.seven.question'], m['hotel.faq.seven.answer']],
              [m['hotel.faq.eight.question'], m['hotel.faq.eight.answer']],
            ].map(([question, answer], item) => (
              <details key={item}>
                <summary>{question()}</summary>
                <p>{answer()}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="hl-bottom">
          <h2>{m['hotel.bottom.title']()}</h2>
          <p>{m['hotel.bottom.text']()}</p>
          <a className="hl-button" href="#create">
            {m['hotel.hero.cta']()} <ArrowRight size={18} />
          </a>
        </section>
      </main>
      <footer className="hl-footer">
        <div>
          <Link href="/" className="hl-brand">
            <img
              src={envConfigs.app_logo}
              alt={m['hotel.logo_alt']()}
              width={512}
              height={512}
              className="hl-brand-mark"
            />
            <span>{envConfigs.app_name}</span>
          </Link>
          <p>{m['hotel.footer.line']()}</p>
        </div>
        <div className="hl-footer-links">
          <a href="mailto:support@hotel-lobby.org">support@hotel-lobby.org</a>
          <Link href="/privacy-policy">{m['landing.footer.privacy']()}</Link>
          <Link href="/terms-of-service">{m['landing.footer.terms']()}</Link>
          <Link href="/acceptable-use-policy">{m['landing.footer.aup']()}</Link>
        </div>
        <FooterBadgeList className="basis-full" />
      </footer>
    </div>
  );
}

function CopyPrompt() {
  const [copied, setCopied] = useState(false);
  const text = m['hotel.prompt.copy_text']();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(m['hotel.prompt.copied']());
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the prompt stays selectable in the block.
    }
  };

  return (
    <div className="hl-copy-prompt">
      <pre>{text}</pre>
      <button type="button" className="hl-button" onClick={copy}>
        {copied ? <Check size={18} /> : <Copy size={18} />}
        {copied ? m['hotel.prompt.copied']() : m['hotel.prompt.copy']()}
      </button>
    </div>
  );
}
