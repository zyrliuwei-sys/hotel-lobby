import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import {
  DEFAULT_DUET_SIZE,
  DUET_SIZES,
  type DuetSize,
} from '@/config/hotel-lobby-sizes';
import { apiGet, apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Pricing } from '@/blocks/pricing';
import { FooterBadgeList } from '@/components/footer-badge-list';
import { SiteUserMenu } from '@/components/site-user-menu';
import { Dialog, DialogContent } from '@/components/ui/dialog';

import '@/styles/hotel-lobby.css';

const heroImage = '/imgs/generated/hotel-lobby-duet.png';
const mobileHeroImage = '/imgs/generated/duet-hero-mobile.jpg';
const previewImage = '/imgs/generated/duet-scene-preview.jpg';
const friendsImage = '/imgs/generated/duet-friends.jpg';
const siblingsImage = '/imgs/generated/duet-siblings.jpg';
const coupleImage = '/imgs/generated/duet-couple.jpg';

const INSUFFICIENT_CREDITS = 'Insufficient credits';

type DuetTask = {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  stage: 'scene' | 'motion' | null;
  sceneImageUrl: string | null;
  videoUrl: string | null;
  error: string | null;
};

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
  onFile,
}: {
  label: string;
  side: string;
  onFile: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
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
          setPreview(file ? URL.createObjectURL(file) : undefined);
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
  const [taskId, setTaskId] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [menu, setMenu] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;
  const canGenerate = consent && !!photoA && !!photoB;
  const queryClient = useQueryClient();
  const [paywall, setPaywall] = useState(false);

  const generate = useMutation({
    mutationFn: async () =>
      apiPost<DuetTask>('/api/hotel-lobby/generate', {
        photoA: await toDataUrl(photoA!),
        photoB: await toDataUrl(photoB!),
        direction: direction.trim() || undefined,
        size,
      }),
    onSuccess: (task) => {
      setTaskId(task.id);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
    // Server is the source of truth: out of credits → show the paywall.
    onError: (e: Error) => {
      if (e.message === INSUFFICIENT_CREDITS) setPaywall(true);
    },
  });

  const taskQuery = useQuery({
    queryKey: ['hotel-lobby-task', taskId],
    queryFn: () => apiGet<DuetTask>(`/api/hotel-lobby/task?id=${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'failed' ? false : 5000;
    },
  });
  const task = taskQuery.data;
  const priceQuery = useQuery({
    queryKey: ['hotel-lobby-price'],
    queryFn: () => apiGet<{ credits: number }>('/api/hotel-lobby/price'),
    staleTime: 10 * 60_000,
  });
  const creditsQuery = useQuery({
    queryKey: ['credits'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
    enabled: !!user,
  });
  const { data: permissions } = useUserPermissions(!!user);
  // Pre-check so an unpaid user sees the plans before uploading photos.
  const startGenerate = () => {
    const balance = creditsQuery.data?.balance;
    const price = priceQuery.data?.credits;
    if (
      !permissions?.isAdmin &&
      balance !== undefined &&
      price !== undefined &&
      balance < price
    ) {
      setPaywall(true);
      return;
    }
    generate.mutate();
  };
  const running =
    generate.isPending ||
    (!!taskId && task?.status !== 'success' && task?.status !== 'failed');
  const error =
    (generate.error?.message === INSUFFICIENT_CREDITS
      ? null
      : generate.error?.message) ??
    (task?.status === 'failed' ? task.error : null) ??
    null;
  // The inline status line is easy to miss below the button; also toast.
  useEffect(() => {
    if (error) toast.error(`${m['hotel.create.failed']()}: ${error}`);
  }, [error]);
  const reset = () => {
    generate.reset();
    setTaskId(undefined);
  };

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
            <SiteUserMenu
              name={user.name || user.email}
              email={user.email}
              image={user.image}
            />
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
            <picture>
              <source media="(max-width: 600px)" srcSet={mobileHeroImage} />
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
            <p className="hl-subtitle">{m['hotel.hero.subtitle']()}</p>
            <a href="#create" className="hl-button">
              {m['hotel.hero.cta']()} <ArrowRight size={18} />
            </a>
          </div>
        </section>

        <section className="hl-explainer" aria-labelledby="filter-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.explainer.eyebrow']()}</p>
            <h2 id="filter-heading">{m['hotel.explainer.title']()}</h2>
          </div>
          <div className="hl-prose">
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
                  onFile={setPhotoA}
                />
                <PhotoInput
                  label={m['hotel.create.person_b']()}
                  side={m['hotel.create.right']()}
                  onFile={setPhotoB}
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
                {(Object.keys(DUET_SIZES) as DuetSize[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={size === key}
                    className="hl-size"
                    disabled={running}
                    onClick={() => setSize(key)}
                  >
                    <span
                      className="hl-size-shape"
                      style={{
                        aspectRatio: `${DUET_SIZES[key].width} / ${DUET_SIZES[key].height}`,
                      }}
                    />
                    <span>{key}</span>
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
                {!user ? (
                  <Link className="hl-button" href="/sign-in">
                    {m['hotel.create.sign_in']()} <ArrowRight size={17} />
                  </Link>
                ) : task?.status === 'success' || task?.status === 'failed' ? (
                  <button className="hl-button" type="button" onClick={reset}>
                    {m['hotel.create.again']()} <ArrowRight size={17} />
                  </button>
                ) : (
                  <button
                    className={`hl-button ${!canGenerate || running ? 'hl-disabled' : ''}`}
                    type="button"
                    disabled={!canGenerate || running}
                    onClick={startGenerate}
                  >
                    {running ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : null}
                    {m['hotel.create.generate']()}
                    {!running && <ArrowRight size={17} />}
                  </button>
                )}
                {task?.videoUrl && (
                  <a
                    className="hl-outline"
                    href={task.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    {m['hotel.create.download']()} <Download size={17} />
                  </a>
                )}
              </div>
              {priceQuery.data && (
                <p className="hl-hint">
                  {m['hotel.create.cost']({
                    credits: priceQuery.data.credits.toLocaleString('en-US'),
                  })}{' '}
                  <a href="#pricing">{m['hotel.create.buy_credits']()}</a>
                </p>
              )}
              <p className="hl-hint" role="status" aria-live="polite">
                {error
                  ? `${m['hotel.create.failed']()}: ${error}`
                  : task?.status === 'success'
                    ? m['hotel.create.done']()
                    : generate.isPending
                      ? m['hotel.create.submitting']()
                      : task?.stage === 'motion'
                        ? `${m['hotel.create.stage_motion']()} ${m['hotel.create.keep_open']()}`
                        : taskId
                          ? `${m['hotel.create.stage_scene']()} ${m['hotel.create.keep_open']()}`
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
                ) : (
                  <img
                    src={task?.sceneImageUrl ?? previewImage}
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
                <img
                  src={friendsImage}
                  alt={m['hotel.ideas.image_alt']()}
                  width={1536}
                  height={1024}
                  loading="lazy"
                />
              </div>
              <h3>{m['hotel.ideas.friends.title']()}</h3>
              <p>{m['hotel.ideas.friends.text']()}</p>
            </article>
            <article>
              <div className="hl-idea-media">
                <img
                  src={siblingsImage}
                  alt={m['hotel.ideas.siblings.image_alt']()}
                  width={1536}
                  height={1024}
                  loading="lazy"
                />
              </div>
              <h3>{m['hotel.ideas.siblings.title']()}</h3>
              <p>{m['hotel.ideas.siblings.text']()}</p>
            </article>
            <article>
              <div className="hl-idea-media">
                <img
                  src={coupleImage}
                  alt={m['hotel.ideas.couples.image_alt']()}
                  width={1536}
                  height={1024}
                  loading="lazy"
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
          </div>
        </section>

        <Pricing />

        <Dialog open={paywall} onOpenChange={setPaywall}>
          <DialogContent className="max-h-[90vh] overflow-y-auto p-6 sm:max-w-5xl">
            <Pricing variant="dialog" title={m['hotel.paywall.title']()} />
          </DialogContent>
        </Dialog>

        <section id="faq" className="hl-faq" aria-labelledby="faq-heading">
          <div className="hl-section-intro">
            <p className="hl-kicker">{m['hotel.faq.eyebrow']()}</p>
            <h2 id="faq-heading">{m['hotel.faq.title']()}</h2>
          </div>
          <div className="hl-faq-list">
            {(
              [
                'one',
                'two',
                'three',
                'four',
                'five',
                'six',
                'seven',
                'eight',
              ] as const
            ).map((item) => (
              <details key={item}>
                <summary>{m[`hotel.faq.${item}.question`]()}</summary>
                <p>{m[`hotel.faq.${item}.answer`]()}</p>
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
        </div>
        <FooterBadgeList className="basis-full" />
      </footer>
    </div>
  );
}
