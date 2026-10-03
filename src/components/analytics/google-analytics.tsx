// GA4 (gtag.js) as a native inline <script> — see analytics/plausible.tsx for
// why we avoid next/script. The gtag queue is set up immediately (so no hit
// is lost), but the ~180 KB gtag.js itself is only fetched once the page has
// loaded and the main thread is idle, keeping it out of LCP/TBT.
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(measurementId)) return null;
  const src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  return (
    // async={true} flags this to React 19 as a hoistable resource — without
    // it, React logs the "Encountered a script tag while rendering React
    // component" warning and won't re-execute it on client navigations.
    <script
      id="ga-init"
      async
      dangerouslySetInnerHTML={{
        __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)});${deferredLoader(src)}`,
      }}
    />
  );
}

/** Inline JS that injects `src` after window load, when the browser is idle. */
export function deferredLoader(src: string) {
  return `(function(){function l(){var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(src)};document.head.appendChild(s)}function i(){'requestIdleCallback' in window?requestIdleCallback(l,{timeout:3000}):setTimeout(l,1)}document.readyState==='complete'?i():window.addEventListener('load',i,{once:true})})();`;
}
