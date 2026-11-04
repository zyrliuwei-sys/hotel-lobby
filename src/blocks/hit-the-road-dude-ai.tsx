import { useState } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Film,
  Plus,
  Route,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import {
  ROAD_DUDE_EXAMPLES,
  ROAD_DUDE_ORIGINAL,
  ROAD_DUDE_PROMPTS,
  ROAD_DUDE_SOURCE,
  type RoadDudePreset,
} from '@/config/hit-the-road-dude-ai';
import { m } from '@/paraglide/messages.js';
import { LocaleSelector } from '@/components/locale-selector';

import '@/styles/hit-the-road-dude-ai.css';

export function HitTheRoadDudePage() {
  const [preset, setPreset] = useState<RoadDudePreset>('dog');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  );
  const prompt = ROAD_DUDE_PROMPTS[preset];
  const [hero, ...gallery] = ROAD_DUDE_EXAMPLES;
  const exampleTitles = [
    m['road_dude.clips.driver'](),
    m['road_dude.clips.cat'](),
    m['road_dude.clips.carriage'](),
  ];
  const presets = [
    ['dog', m['road_dude.prompt.dog']()],
    ['cat', m['road_dude.prompt.cat']()],
    ['driver', m['road_dude.prompt.driver']()],
  ] as const;
  const steps = [
    [m['road_dude.steps.photo.title'](), m['road_dude.steps.photo.body']()],
    [m['road_dude.steps.scene.title'](), m['road_dude.steps.scene.body']()],
    [m['road_dude.steps.finish.title'](), m['road_dude.steps.finish.body']()],
  ];
  const faqs = [
    [m['road_dude.faq.origin.q'](), m['road_dude.faq.origin.a']()],
    [m['road_dude.faq.photos.q'](), m['road_dude.faq.photos.a']()],
    [m['road_dude.faq.pets.q'](), m['road_dude.faq.pets.a']()],
    [m['road_dude.faq.audio.q'](), m['road_dude.faq.audio.a']()],
    [m['road_dude.faq.format.q'](), m['road_dude.faq.format.a']()],
    [m['road_dude.faq.credits.q'](), m['road_dude.faq.credits.a']()],
  ];

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <div className="road-page">
      <header className="road-header">
        <div className="road-wrap road-header-inner">
          <Link href="/" className="road-brand">
            <img src={envConfigs.app_logo} alt="" width={34} height={34} />
            <span>{envConfigs.app_name}</span>
          </Link>
          <nav aria-label={m['hotel.nav_label']()}>
            <a href="#examples">{m['road_dude.nav.examples']()}</a>
            <a href="#prompt">{m['road_dude.nav.prompt']()}</a>
            <a href="#faq">{m['road_dude.nav.faq']()}</a>
          </nav>
          <LocaleSelector className="road-locale" />
        </div>
      </header>

      <main>
        <section className="road-hero road-wrap" aria-labelledby="road-title">
          <div className="road-hero-copy">
            <Link href="/" className="road-back">
              <ArrowLeft size={15} /> {m['road_dude.nav.home']()}
            </Link>
            <p className="road-kicker">
              <Route size={16} /> {m['road_dude.hero.kicker']()}
            </p>
            <h1 id="road-title">
              Hit the Road <br />
              Dude AI
            </h1>
            <p className="road-hero-description">
              {m['road_dude.hero.body']()}
            </p>
            <div className="road-actions">
              <a href="#prompt" className="road-button">
                <span>{m['road_dude.hero.template']()}</span>
                <ArrowRight size={18} />
              </a>
              <a href="#examples" className="road-text-link">
                {m['road_dude.hero.watch']()} <ArrowDown size={16} />
              </a>
            </div>
          </div>
          <figure className="road-hero-film">
            <div className="road-film-label">
              <span>
                <Film size={15} /> {m['road_dude.hero.reel']()}
              </span>
              <span>01 / 04</span>
            </div>
            <video
              controls
              playsInline
              preload="none"
              src={hero.src}
              poster={hero.poster}
              width={hero.width}
              height={hero.height}
              aria-label={m['road_dude.clips.bulldog']()}
            />
            <figcaption>
              <span>{m['road_dude.clips.bulldog']()}</span>
              <a
                href={ROAD_DUDE_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
              >
                Media.io <ArrowUpRight size={14} />
              </a>
            </figcaption>
          </figure>
        </section>

        <div className="road-marking" aria-hidden="true" />

        <section
          id="examples"
          className="road-gallery"
          aria-labelledby="road-gallery-title"
        >
          <div className="road-wrap">
            <div className="road-section-lead">
              <div>
                <p className="road-kicker">
                  01 / {m['road_dude.clips.kicker']()}
                </p>
                <h2 id="road-gallery-title">{m['road_dude.clips.title']()}</h2>
              </div>
              <p>{m['road_dude.clips.body']()}</p>
            </div>
            <div className="road-gallery-grid">
              {gallery.map((clip, index) => (
                <figure key={clip.id}>
                  <div className="road-film-label">
                    <span>{`0${index + 2} / 04`}</span>
                    <span>{clip.duration}</span>
                  </div>
                  <video
                    controls
                    playsInline
                    preload="none"
                    src={clip.src}
                    poster={clip.poster}
                    width={clip.width}
                    height={clip.height}
                    aria-label={exampleTitles[index]}
                  />
                  <figcaption>{exampleTitles[index]}</figcaption>
                </figure>
              ))}
            </div>
            <a
              className="road-source"
              href={ROAD_DUDE_SOURCE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m['road_dude.clips.source']()} <ArrowUpRight size={15} />
            </a>
          </div>
        </section>

        <section
          id="prompt"
          className="road-wrap road-prompt"
          aria-labelledby="road-prompt-title"
        >
          <div>
            <p className="road-kicker">02 / {m['road_dude.prompt.kicker']()}</p>
            <h2 id="road-prompt-title">{m['road_dude.prompt.title']()}</h2>
            <p className="road-body">{m['road_dude.prompt.body']()}</p>
            <ol className="road-steps">
              {steps.map(([title, body], index) => (
                <li key={title}>
                  <span>{`0${index + 1}`}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="road-workbench">
            <fieldset>
              <legend>{m['road_dude.prompt.choose']()}</legend>
              <div className="road-presets">
                {presets.map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="radio"
                      name="road-preset"
                      value={id}
                      checked={id === preset}
                      onChange={() => {
                        setPreset(id);
                        setCopyState('idle');
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="road-prompt-label" htmlFor="road-prompt-text">
              {m['road_dude.prompt.label']()}
            </label>
            <textarea id="road-prompt-text" readOnly value={prompt} lang="en" />
            <div className="road-workbench-actions">
              <button
                type="button"
                className="road-copy"
                onClick={() => void copyPrompt()}
              >
                {copyState === 'copied' ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {copyState === 'copied'
                  ? m['road_dude.prompt.copied']()
                  : m['road_dude.prompt.copy']()}
              </button>
              <RouterLink
                to="/sintex-ai"
                search={{ roadDude: preset }}
                hash="generator"
                className="road-button"
              >
                {m['road_dude.prompt.open']()} <ArrowRight size={17} />
              </RouterLink>
            </div>
            <p className="road-workbench-note" role="status">
              {copyState === 'error'
                ? m['road_dude.prompt.copy_error']()
                : m['road_dude.prompt.note']()}
            </p>
          </div>
        </section>

        <section className="road-origin" aria-labelledby="road-origin-title">
          <div className="road-wrap road-origin-inner">
            <div className="road-quote" aria-hidden="true">
              <span>
                PRIVATE
                <br />
                PROPERTY
              </span>
              <Route size={36} />
            </div>
            <div>
              <p className="road-kicker">
                03 / {m['road_dude.origin.kicker']()}
              </p>
              <h2 id="road-origin-title">{m['road_dude.origin.title']()}</h2>
              <p className="road-body">{m['road_dude.origin.story']()}</p>
              <p className="road-body">{m['road_dude.origin.remix']()}</p>
              <a
                className="road-text-link"
                href={ROAD_DUDE_ORIGINAL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {m['road_dude.origin.source']()} <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="road-wrap road-faq"
          aria-labelledby="road-faq-title"
        >
          <div>
            <p className="road-kicker">04 / FAQ</p>
            <h2 id="road-faq-title">{m['road_dude.faq.title']()}</h2>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question} <Plus size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="road-related road-wrap"
          aria-labelledby="road-related-title"
        >
          <div>
            <p className="road-kicker">{m['road_dude.related.kicker']()}</p>
            <h2 id="road-related-title">{m['road_dude.related.title']()}</h2>
            <p>{m['road_dude.related.body']()}</p>
          </div>
          <Link href="/" className="road-button">
            {m['road_dude.related.link']()} <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="road-wrap road-footer">
        <Link href="/">{envConfigs.app_name}</Link>
        <a href="#road-title">{m['road_dude.footer.top']()}</a>
      </footer>
    </div>
  );
}
