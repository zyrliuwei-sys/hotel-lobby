// Microsoft Clarity as a native inline <script> — see
// analytics/google-analytics.tsx. The window.clarity queue exists right away,
// but the tag only loads on the visitor's first interaction: Clarity sets
// third-party cookies (clarity.ms / bing.com), which Lighthouse's Best
// Practices score penalises, and sessions with no interaction have nothing to
// record anyway.
export function Clarity({ projectId }: { projectId: string }) {
  if (!/^[A-Za-z0-9]{1,32}$/.test(projectId)) return null;
  const src = `https://www.clarity.ms/tag/${projectId}`;
  return (
    <script
      id="clarity-init"
      async
      dangerouslySetInnerHTML={{
        __html: `window.clarity=window.clarity||function(){(window.clarity.q=window.clarity.q||[]).push(arguments)};(function(){var e=['pointerdown','keydown','scroll','touchstart'],d=false;function l(){if(d)return;d=true;e.forEach(function(n){removeEventListener(n,l)});var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(src)};document.head.appendChild(s)}e.forEach(function(n){addEventListener(n,l,{passive:true})})})();`,
      }}
    />
  );
}
