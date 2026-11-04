import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import {
  ROAD_DUDE_PROMPTS,
  type RoadDudePreset,
} from '@/config/hit-the-road-dude-ai';
import {
  SINTEX_REFERENCE_PAGE,
  SINTEX_VIDEO_EXAMPLES,
} from '@/config/sintex-ai-media';
import {
  SINTEX_MODELS,
  sintexCredits,
  type SintexDuration,
  type SintexModel,
  type SintexTask,
} from '@/config/sintex-ai-models';
import { apiGet, apiPost } from '@/lib/api-client';
import { track } from '@/lib/track';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { SintexAiFaq } from '@/blocks/sintex-ai-faq';
import { VideoBreadcrumb } from '@/blocks/video-navigation';
import { SiteHeader } from '@/components/site-header';

import '@/styles/syntx-ai.css';

type ModelId = SintexModel;
type AspectId = 'vertical' | 'wide' | 'square';
type DurationId = SintexDuration;

export function SintexAiPage({ roadDude }: { roadDude?: RoadDudePreset }) {
  const starterPrompt = roadDude
    ? ROAD_DUDE_PROMPTS[roadDude]
    : m['syntx.prompt_example']();
  const [prompt, setPrompt] = useState<string>(starterPrompt);
  const [model, setModel] = useState<ModelId>(roadDude ? 'kling' : 'wan');
  const [aspect, setAspect] = useState<AspectId>(
    roadDude ? 'vertical' : 'wide'
  );
  const [duration, setDuration] = useState<DurationId>(roadDude ? '10' : '5');
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [activeTask, setActiveTask] = useState<{ key: string; id: string }>();
  const [inputError, setInputError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [heroPaused, setHeroPaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const heroExample = SINTEX_VIDEO_EXAMPLES[0];
  const { data: session, isPending: sessionPending } = useSession();
  const userId = session?.user?.id;
  const taskStorageKey = userId
    ? `sintex-task-${userId}${roadDude ? `-road-${roadDude}` : ''}`
    : undefined;
  const taskId =
    activeTask?.key === taskStorageKey ? activeTask?.id : undefined;
  const queryClient = useQueryClient();
  const permissions = useUserPermissions(Boolean(userId));
  const configQuery = useQuery({
    queryKey: ['sintex-config'],
    queryFn: () => apiGet<{ available: boolean }>('/api/sintex-ai/config'),
    staleTime: 30000,
  });
  const balanceQuery = useQuery({
    queryKey: ['sintex-credits', userId],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
    enabled: Boolean(userId),
  });
  const taskQuery = useQuery({
    queryKey: ['sintex-task', userId, taskId],
    queryFn: () =>
      apiGet<SintexTask>(
        `/api/sintex-ai/task?id=${encodeURIComponent(taskId!)}`
      ),
    enabled: Boolean(userId && taskId),
    retry: (attempts, error) =>
      error.message !== 'Task not found' && attempts < 2,
    refetchInterval: (q) =>
      q.state.error?.message === 'Task not found' ||
      (q.state.data &&
        (['failed', 'canceled'].includes(q.state.data.status) ||
          (q.state.data.status === 'success' && q.state.data.videoUrl)))
        ? false
        : 5000,
    refetchIntervalInBackground: true,
  });
  const task = taskQuery.data;
  const generate = useMutation({
    mutationFn: (imageData: string | undefined) =>
      apiPost<SintexTask>('/api/sintex-ai/generate', {
        model,
        duration,
        aspect,
        prompt: prompt.trim(),
        ...(imageData ? { imageData } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(['sintex-task', userId, result.id], result);
      if (taskStorageKey) {
        setActiveTask({ key: taskStorageKey, id: result.id });
        try {
          localStorage.setItem(taskStorageKey, result.id);
        } catch {}
      }
      void balanceQuery.refetch();
    },
    onError: () => {
      void balanceQuery.refetch();
    },
  });
  const [preparingImage, setPreparingImage] = useState(false);
  const isGenerating =
    preparingImage ||
    generate.isPending ||
    Boolean(
      taskId &&
      (!task ||
        (!['failed', 'canceled'].includes(task.status) &&
          !(task.status === 'success' && task.videoUrl)))
    );
  const hasPreview = task?.status === 'success' && Boolean(task.videoUrl);
  const price = permissions.data?.isAdmin ? 0 : sintexCredits(model, duration);

  useEffect(() => {
    if (!taskStorageKey) return;
    try {
      const saved = localStorage.getItem(taskStorageKey);
      setActiveTask(saved ? { key: taskStorageKey, id: saved } : undefined);
    } catch {}
  }, [taskStorageKey]);
  useEffect(() => {
    if (!taskStorageKey || taskQuery.error?.message !== 'Task not found')
      return;
    setActiveTask(undefined);
    try {
      localStorage.removeItem(taskStorageKey);
    } catch {}
  }, [taskQuery.error, taskStorageKey]);
  useEffect(() => {
    if (task?.status === 'success' || task?.status === 'failed')
      void balanceQuery.refetch();
  }, [task?.status]);

  function errorText(error: string) {
    if (error === 'Unauthorized') return m['syntx.generator.sign_in']();
    if (error === 'Insufficient credits')
      return m['syntx.generator.insufficient']();
    if (error === 'GENERATION_UNAVAILABLE')
      return m['syntx.generator.unavailable']();
    if (error === 'PROMPT_BLOCKED') return m['syntx.generator.blocked']();
    if (error === 'POLL_RETRY') return m['syntx.generator.poll_retry']();
    if (error === 'INVALID_INPUT') return m['syntx.generator.invalid']();
    return m['syntx.generator.failed']();
  }
  const generationError =
    inputError ||
    (generate.error
      ? errorText(generate.error.message)
      : task?.error
        ? errorText(task.error)
        : taskQuery.error
          ? errorText(taskQuery.error.message)
          : null);

  const models: { id: ModelId; label: string; note: string }[] = [
    {
      id: 'wan',
      label: SINTEX_MODELS.wan.label,
      note: m['syntx.models.wan_note'](),
    },
    {
      id: 'kling',
      label: m['syntx.models.kling'](),
      note: m['syntx.models.kling_note'](),
    },
  ];
  const aspects: { id: AspectId; label: string }[] = [
    { id: 'vertical', label: m['syntx.aspect.vertical']() },
    { id: 'wide', label: m['syntx.aspect.wide']() },
    { id: 'square', label: m['syntx.aspect.square']() },
  ];
  const durations: { id: DurationId; label: string }[] = [
    { id: '5', label: m['syntx.duration.short']() },
    { id: '10', label: m['syntx.duration.medium']() },
  ];
  const activeModel = models.find((item) => item.id === model) ?? models[0];

  useEffect(() => {
    return () => {
      if (referenceUrl) {
        URL.revokeObjectURL(referenceUrl);
      }
    };
  }, [referenceUrl]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pauseForPreference = () => {
      if (reducedMotion.matches) heroVideoRef.current?.pause();
    };
    pauseForPreference();
    reducedMotion.addEventListener('change', pauseForPreference);
    return () =>
      reducedMotion.removeEventListener('change', pauseForPreference);
  }, []);

  function handleReferenceChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setInputError(m['syntx.generator.upload_error']());
      event.target.value = '';
      return;
    }
    setInputError(null);
    setReferenceUrl(URL.createObjectURL(file));
    setReferenceName(file.name);
    setReferenceFile(file);
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    if (!userId || !configQuery.data?.available || (roadDude && !referenceFile))
      return;
    setInputError(null);
    setMediaError(null);
    let imageData: string | undefined;
    if (referenceFile) {
      setPreparingImage(true);
      try {
        const bitmap = await createImageBitmap(referenceFile);
        const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        if (Math.min(width, height) < 360) {
          bitmap.close();
          throw new Error('Small image');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          bitmap.close();
          throw new Error('Canvas unavailable');
        }
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        imageData = canvas.toDataURL('image/jpeg', 0.9);
      } catch {
        setInputError(m['syntx.generator.image_dimensions']());
        return;
      } finally {
        setPreparingImage(false);
      }
    }
    generate.mutate(imageData);
    track('sintex_generate', {
      model: activeModel.label,
      aspect,
      duration,
    });
  }

  function resetGenerator() {
    setActiveTask(undefined);
    if (taskStorageKey) {
      try {
        localStorage.removeItem(taskStorageKey);
      } catch {}
    }
    generate.reset();
    setInputError(null);
    setMediaError(null);
    setReferenceName(null);
    setReferenceFile(null);
    setReferenceUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="syntx-page">
      <SiteHeader
        navLinks={[
          { href: '/', label: m['syntx.nav.home']() },
          { href: '#generator', label: m['syntx.nav.generator']() },
          { href: '#how-it-works', label: m['syntx.nav.how']() },
          { href: '/pricing', label: m['syntx.nav.pricing']() },
        ]}
        logoAlt={m['hotel.logo_alt']()}
      />

      <main>
        <VideoBreadcrumb
          title={m['hotel.nav.syntx']()}
          className="syntx-breadcrumb"
        />
        <section className="syntx-hero">
          <div className="syntx-hero-copy">
            <p className="syntx-eyebrow">
              <span className="syntx-eyebrow-mark" />
              {m['syntx.kicker']()}
            </p>
            <h1>
              {m['syntx.title.line_one']()}{' '}
              <em>{m['syntx.title.line_two']()}</em>
            </h1>
            <p className="syntx-hero-body">{m['syntx.subtitle']()}</p>
            <div className="syntx-hero-actions">
              <a className="syntx-primary-link" href="#generator">
                {m['syntx.cta']()}
                <ArrowRight className="size-4" />
              </a>
              <span className="syntx-hero-note">
                <Check className="size-4" />
                {m['syntx.hero_note']()}
              </span>
            </div>
            <div
              className="syntx-hero-stats"
              aria-label={m['syntx.stats_label']()}
            >
              <div>
                <strong>{m['syntx.stats.text']()}</strong>
                <span>{m['syntx.stats.models']()}</span>
              </div>
              <div>
                <strong>{m['syntx.stats.image']()}</strong>
                <span>{m['syntx.stats.media']()}</span>
              </div>
              <div>
                <strong>{m['syntx.stats.video']()}</strong>
                <span>{m['syntx.stats.workspace']()}</span>
              </div>
            </div>
          </div>

          <div className="syntx-hero-media">
            <div className="syntx-hero-reel">
              <video
                ref={heroVideoRef}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster={heroExample.poster}
                src={heroExample.src}
                aria-label={m['syntx.examples.kling.title']()}
                onPlay={() => setHeroPaused(false)}
                onPause={() => setHeroPaused(true)}
              />
              <div className="syntx-reel-shade" />
              <div className="syntx-reel-topline">
                <span>{m['syntx.reel_label']()}</span>
                <span className="syntx-reel-status">
                  <span />
                  {m['syntx.reel_status']()}
                </span>
              </div>
              <div className="syntx-reel-bottomline">
                <button
                  className="syntx-reel-play"
                  type="button"
                  aria-label={
                    heroPaused
                      ? m['syntx.reel_play']()
                      : m['syntx.reel_pause']()
                  }
                  onClick={() => {
                    const video = heroVideoRef.current;
                    if (!video) return;
                    if (video.paused)
                      void video.play().catch(() => setHeroPaused(true));
                    else video.pause();
                  }}
                >
                  {heroPaused ? (
                    <Play className="size-4 fill-current" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <a
              className="syntx-source-link"
              href={SINTEX_REFERENCE_PAGE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m['syntx.examples.source']()}{' '}
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>

        <section className="syntx-workbench-section" id="generator">
          <div className="syntx-section-heading">
            <div>
              <p className="syntx-section-kicker">
                {m['syntx.generator.kicker']()}
              </p>
              <h2>{m['syntx.generator.title']()}</h2>
            </div>
            <p>{m['syntx.generator.description']()}</p>
          </div>

          <div className="syntx-workbench">
            <form className="syntx-form" onSubmit={handleGenerate}>
              <div className="syntx-form-header">
                <div>
                  <span className="syntx-form-index">01</span>
                  <h3>{m['syntx.generator.prompt_label']()}</h3>
                </div>
                <Sparkles className="size-5" />
              </div>
              <textarea
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                }}
                placeholder={m['syntx.generator.prompt_placeholder']()}
                aria-label={m['syntx.generator.prompt_label']()}
                maxLength={1500}
                disabled={isGenerating}
                rows={5}
              />
              <div className="syntx-form-subrow">
                <span>{prompt.length}/1500</span>
                <button
                  type="button"
                  disabled={isGenerating}
                  className="syntx-inline-action"
                  onClick={() => setPrompt(starterPrompt)}
                >
                  {m['syntx.use_example']()}
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>

              <div className="syntx-form-divider" />

              <div className="syntx-form-header syntx-form-header-compact">
                <div>
                  <span className="syntx-form-index">02</span>
                  <h3>{m['syntx.generator.reference']()}</h3>
                </div>
                <span className="syntx-optional">
                  {roadDude
                    ? m['road_dude.generator.required']()
                    : m['syntx.optional']()}
                </span>
              </div>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg"
                disabled={isGenerating}
                onChange={handleReferenceChange}
              />
              <button
                type="button"
                disabled={isGenerating}
                className={`syntx-upload-zone ${referenceUrl ? 'syntx-uploaded' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {referenceUrl ? (
                  <img src={referenceUrl} alt={referenceName ?? ''} />
                ) : (
                  <span className="syntx-upload-icon">
                    <ImagePlus className="size-5" />
                  </span>
                )}
                <span className="syntx-upload-copy">
                  <strong>
                    {referenceName ?? m['syntx.generator.upload']()}
                  </strong>
                  <small>
                    {roadDude
                      ? m['road_dude.generator.upload_hint']()
                      : m['syntx.generator.upload_hint']()}
                  </small>
                </span>
                <ArrowUpRight className="syntx-upload-arrow size-4" />
              </button>
              {inputError ? (
                <p className="syntx-input-error" role="alert">
                  {inputError}
                </p>
              ) : null}

              <div className="syntx-form-divider" />

              <div className="syntx-form-header syntx-form-header-compact">
                <div>
                  <span className="syntx-form-index">03</span>
                  <h3>{m['syntx.generator.settings']()}</h3>
                </div>
                <Clapperboard className="size-5" />
              </div>
              <div className="syntx-settings-grid">
                <label>
                  <span>{m['syntx.generator.model_label']()}</span>
                  <span className="syntx-select-wrap">
                    <select
                      value={model}
                      disabled={isGenerating}
                      onChange={(event) => {
                        setModel(event.target.value as ModelId);
                      }}
                    >
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="size-4" />
                  </span>
                </label>
                <label>
                  <span>{m['syntx.generator.aspect_label']()}</span>
                  <span className="syntx-select-wrap">
                    <select
                      value={aspect}
                      disabled={isGenerating || Boolean(referenceFile)}
                      onChange={(event) => {
                        setAspect(event.target.value as AspectId);
                      }}
                    >
                      {aspects.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="size-4" />
                  </span>
                </label>
                <label>
                  <span>{m['syntx.generator.duration_label']()}</span>
                  <span className="syntx-select-wrap">
                    <select
                      value={duration}
                      disabled={isGenerating}
                      onChange={(event) => {
                        setDuration(event.target.value as DurationId);
                      }}
                    >
                      {durations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="size-4" />
                  </span>
                </label>
              </div>

              <div className="syntx-model-note">
                <span>{activeModel.label}</span>
                <span>{activeModel.note}</span>
              </div>

              {!userId && !sessionPending ? (
                <Link
                  className="syntx-generate-button"
                  href={`/sign-in?callbackUrl=${encodeURIComponent(`/sintex-ai${roadDude ? `?roadDude=${roadDude}` : ''}#generator`)}`}
                >
                  {m['syntx.generator.sign_in']()}{' '}
                  <ArrowRight className="size-4" />
                </Link>
              ) : (
                <button
                  type="submit"
                  className="syntx-generate-button"
                  disabled={
                    isGenerating ||
                    !prompt.trim() ||
                    Boolean(roadDude && !referenceFile) ||
                    sessionPending ||
                    !configQuery.data?.available
                  }
                >
                  {isGenerating ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      {m['syntx.generator.generating']({
                        model: activeModel.label,
                      })}
                    </>
                  ) : (
                    <>
                      {m['syntx.generator.generate']()}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              )}
              <p className="syntx-credit-note">
                {m['syntx.generator.credits']({ credits: String(price) })}
              </p>
              {userId && balanceQuery.data ? (
                <p className="syntx-credit-note">
                  {m['syntx.generator.balance']({
                    credits: String(balanceQuery.data.balance),
                  })}{' '}
                  <Link href="/pricing">
                    {m['syntx.generator.buy_credits']()}
                  </Link>
                </p>
              ) : null}
              {referenceFile ? (
                <p className="syntx-credit-note">
                  {m['syntx.generator.image_aspect']()}
                </p>
              ) : null}
              {configQuery.isSuccess && !configQuery.data.available ? (
                <p className="syntx-input-error" role="alert">
                  {m['syntx.generator.unavailable']()}
                </p>
              ) : null}
              {generationError ? (
                <p className="syntx-input-error" role="alert">
                  {generationError}
                </p>
              ) : null}
            </form>

            <div className="syntx-output-panel">
              <div className="syntx-output-heading">
                <div>
                  <span className="syntx-section-kicker">
                    {m['syntx.generator.preview']()}
                  </span>
                  <h3>
                    {isGenerating
                      ? task?.status === 'processing'
                        ? m['syntx.generator.processing']()
                        : m['syntx.generator.loading']()
                      : hasPreview
                        ? m['syntx.generator.success']()
                        : m['syntx.generator.ready']()}
                  </h3>
                </div>
                {hasPreview ? (
                  <button
                    type="button"
                    className="syntx-reset-button"
                    onClick={resetGenerator}
                  >
                    <RotateCcw className="size-3.5" />
                    {m['syntx.generator.reset']()}
                  </button>
                ) : null}
              </div>
              <div
                className={`syntx-output-frame syntx-output-${task?.aspect || aspect}`}
                aria-live="polite"
              >
                {hasPreview ? (
                  <video
                    key={task!.id}
                    autoPlay
                    controls
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    src={`/api/sintex-ai/download?id=${encodeURIComponent(task!.id)}&inline=1`}
                    aria-label={m['syntx.generator.success']()}
                    onError={() => {
                      setMediaError(m['syntx.generator.media_error']());
                    }}
                  />
                ) : (
                  <>
                    <img
                      src={referenceUrl || heroExample.poster}
                      alt={m['syntx.reel_caption']()}
                    />
                    <div className="syntx-output-empty">
                      <span className="syntx-output-empty-icon">
                        <Play className="ml-0.5 size-4 fill-current" />
                      </span>
                      <strong>
                        {isGenerating
                          ? m['syntx.generator.generating']({
                              model: activeModel.label,
                            })
                          : m['syntx.generator.ready']()}
                      </strong>
                      <span>
                        {isGenerating
                          ? m['syntx.generator.wait_note']()
                          : m['syntx.generator.preview_hint']()}
                      </span>
                    </div>
                  </>
                )}
                <div className="syntx-output-overlay" />
                <div className="syntx-output-meta">
                  <span>{SINTEX_MODELS[task?.model || model].label}</span>
                  <span>
                    {task?.imageInput
                      ? m['syntx.generator.image_frame']()
                      : aspects.find((a) => a.id === (task?.aspect || aspect))
                          ?.label}
                  </span>
                  <span>{task?.duration || duration}s</span>
                </div>
              </div>
              {mediaError ? (
                <p className="syntx-input-error" role="alert">
                  {mediaError}
                </p>
              ) : null}
              <div className="syntx-output-footer">
                <p>
                  {hasPreview
                    ? m['syntx.generator.result_note']()
                    : m['syntx.generator.preview_hint']()}
                </p>
                {hasPreview ? (
                  <a
                    className="syntx-download-link"
                    href={`/api/sintex-ai/download?id=${encodeURIComponent(task!.id)}`}
                    download
                  >
                    <Download className="size-4" />
                    {m['syntx.generator.download']()}
                  </a>
                ) : (
                  <span className="syntx-output-format">
                    {m['syntx.output_format']()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          className="syntx-examples-section"
          id="examples"
          aria-labelledby="sintex-examples-title"
        >
          <div className="syntx-section-heading">
            <div>
              <p className="syntx-section-kicker">
                {m['syntx.examples.kicker']()}
              </p>
              <h2 id="sintex-examples-title">{m['syntx.examples.title']()}</h2>
            </div>
            <p>{m['syntx.examples.description']()}</p>
          </div>
          <div className="syntx-examples-grid">
            {SINTEX_VIDEO_EXAMPLES.map((example) => (
              <figure key={example.id}>
                <video
                  controls
                  muted
                  playsInline
                  preload="none"
                  poster={example.poster}
                  src={example.src}
                  aria-label={
                    example.id === 'kling'
                      ? m['syntx.examples.kling.title']()
                      : m['syntx.examples.motion.title']()
                  }
                />
                <figcaption>
                  <div>
                    <h3>
                      {example.id === 'kling'
                        ? m['syntx.examples.kling.title']()
                        : m['syntx.examples.motion.title']()}
                    </h3>
                    <p>
                      {example.id === 'kling'
                        ? m['syntx.examples.kling.description']()
                        : m['syntx.examples.motion.description']()}
                    </p>
                  </div>
                  <span>{example.duration}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <a
            className="syntx-source-link"
            href={SINTEX_REFERENCE_PAGE}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m['syntx.examples.source']()} <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="syntx-story-section" id="how-it-works">
          <div className="syntx-story-intro">
            <p className="syntx-section-kicker">{m['syntx.story.kicker']()}</p>
            <h2>{m['syntx.story.title']()}</h2>
            <p>{m['syntx.story.body']()}</p>
            <Link className="syntx-text-link" href="/pricing">
              {m['syntx.story.link']()}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="syntx-feature-grid">
            <article className="syntx-feature-card syntx-feature-card-large">
              <div className="syntx-feature-icon">
                <Sparkles className="size-5" />
              </div>
              <h3>{m['syntx.feature.prompt.title']()}</h3>
              <p>{m['syntx.feature.prompt.body']()}</p>
            </article>
            <article className="syntx-feature-card syntx-feature-card-image">
              <div className="syntx-feature-photo">
                <img
                  src={SINTEX_VIDEO_EXAMPLES[1].poster}
                  alt=""
                  loading="lazy"
                />
              </div>
              <div>
                <div className="syntx-feature-icon">
                  <ImagePlus className="size-5" />
                </div>
                <h3>{m['syntx.feature.image.title']()}</h3>
                <p>{m['syntx.feature.image.body']()}</p>
              </div>
            </article>
            <article className="syntx-feature-card syntx-feature-card-model">
              <div className="syntx-model-stack" aria-hidden="true">
                {models.slice(0, 3).map((item, index) => (
                  <span key={item.id} style={{ zIndex: 3 - index }}>
                    {item.label.split(' ')[0]}
                  </span>
                ))}
              </div>
              <div className="syntx-feature-icon">
                <Clapperboard className="size-5" />
              </div>
              <h3>{m['syntx.feature.model.title']()}</h3>
              <p>{m['syntx.feature.model.body']()}</p>
            </article>
          </div>
        </section>

        <SintexAiFaq />
        <section className="syntx-cta-section">
          <div>
            <p className="syntx-section-kicker">{m['syntx.cta.kicker']()}</p>
            <h2>{m['syntx.cta.title']()}</h2>
          </div>
          <a
            className="syntx-primary-link syntx-primary-link-light"
            href="#generator"
          >
            {m['syntx.cta.button']()}
            <ArrowRight className="size-4" />
          </a>
        </section>
      </main>
    </div>
  );
}
