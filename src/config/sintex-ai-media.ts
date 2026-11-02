export const SINTEX_REFERENCE_PAGE = 'https://pollo.ai/m/syntx-ai';

// Public showcase videos embedded in the reference page's banner data.
// These are examples, never the output of a visitor's generation request.
export const SINTEX_VIDEO_EXAMPLES = [
  {
    id: 'kling',
    src: '/videos/sintex-ai/kling-showcase.mp4',
    poster: '/imgs/sintex-ai/kling-poster.jpg',
    duration: '12.3s',
    sourceUrl:
      'https://videocdn.pollo.ai/web-cdn/pollo/production/cmihen6fj002aejdpr1nfgapd/cover-process/1793323579348-c8c1e33d-2b29-409f-bcfe-e90eaca3d692.mp4',
  },
  {
    id: 'motion',
    src: '/videos/sintex-ai/motion-showcase.mp4',
    poster: '/imgs/sintex-ai/motion-poster.jpg',
    duration: '11.1s',
    sourceUrl:
      'https://videocdn.pollo.ai/web-cdn/pollo/production/cmihen6fj002aejdpr1nfgapd/cover-process/1793253574932-9ce98aed-10cb-4a34-a99b-18ea252c2b36.mp4',
  },
] as const;
