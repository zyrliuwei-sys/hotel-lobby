/**
 * Fire a funnel event to whichever analytics the admin enabled (GA4 and/or
 * Plausible). A no-op on the server or when neither script has loaded.
 */
export function track(name: string, props?: Record<string, string | number>) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  try {
    w.gtag?.('event', name, props);
    w.plausible?.(name, props ? { props } : undefined);
  } catch {
    // Analytics must never break the page.
  }
}
