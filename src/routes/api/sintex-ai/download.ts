import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { findTask } from '@/modules/ai-tasks/service';
import { respErr } from '@/lib/resp';

import { isAllowedVideoUrl, isSintexTask, taskView } from './-shared';

export const Route = createFileRoute('/api/sintex-ai/download')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getAuth().api.getSession({
          headers: request.headers,
        });
        if (!session?.user) return respErr('Unauthorized', { status: 401 });
        const id = new URL(request.url).searchParams.get('id');
        const task = id ? await findTask(id) : null;
        if (
          !task ||
          task.userId !== session.user.id ||
          !isSintexTask(task) ||
          task.status !== 'success'
        )
          return respErr('Task not found', { status: 404 });
        const url = taskView(task).videoUrl;
        if (!url) return respErr('Video not found', { status: 404 });
        if (!isAllowedVideoUrl(url))
          return respErr('Invalid video URL', { status: 400 });
        const upstream = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
          headers: request.headers.has('range')
            ? { range: request.headers.get('range')! }
            : undefined,
        });
        if (!upstream.ok) return respErr('Download failed', { status: 502 });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'content-type': 'video/mp4',
            'content-disposition': `${new URL(request.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename="sintex-ai-${task.id}.mp4"`,
            'cache-control': 'private, no-store',
            ...(upstream.headers.has('content-length')
              ? { 'content-length': upstream.headers.get('content-length')! }
              : {}),
            ...(upstream.headers.has('content-range')
              ? { 'content-range': upstream.headers.get('content-range')! }
              : {}),
            'accept-ranges': 'bytes',
          },
        });
      },
    },
  },
});
