import { createFileRoute } from '@tanstack/react-router';

import { AIMediaType, FalProvider } from '@/core/ai';
import { getAuth } from '@/core/auth';
import { AITaskStatus, findTask, updateTask } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { respData, respErr } from '@/lib/resp';

import { isAllowedVideoUrl, isSintexTask, taskView } from './-shared';

async function GET({ request }: { request: Request }) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    const task = id ? await findTask(id) : null;
    if (!task || task.userId !== session.user.id || !isSintexTask(task))
      return respErr('Task not found', { status: 404 });
    if (
      ['failed', 'canceled'].includes(task.status) ||
      (task.status === 'success' && taskView(task).videoUrl)
    )
      return respData(taskView(task));
    if (!task.taskId) return respData(taskView(task));
    const configs = await getAllConfigs();
    if (!configs.fal_api_key)
      return respErr('GENERATION_UNAVAILABLE', { status: 503 });
    const provider = new FalProvider({ apiKey: configs.fal_api_key });
    let result;
    try {
      result = await provider.query({
        taskId: task.taskId,
        model: task.model,
        mediaType: AIMediaType.VIDEO,
      });
    } catch (error) {
      // A network/429/5xx poll failure must not refund an in-flight paid job.
      const message = error instanceof Error ? error.message : '';
      if (!/status: (400|404|410|422)\b/.test(message))
        return respErr('POLL_RETRY', { status: 503 });
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        expectedStatus: task.status,
        taskResult: { error: 'GENERATION_FAILED' },
      });
      return respData(taskView((await findTask(task.id))!));
    }
    const status = result.taskStatus as unknown as AITaskStatus;
    const terminal = ['success', 'failed', 'canceled'].includes(status);
    const payload = result.taskResult as
      | { video?: { url?: string }; error?: unknown }
      | undefined;
    const failed =
      status === AITaskStatus.FAILED ||
      (status === AITaskStatus.SUCCESS &&
        (!payload?.video?.url || !isAllowedVideoUrl(payload.video.url)));
    const nextStatus = failed ? AITaskStatus.FAILED : status;
    // A queued response may arrive after another poll has observed progress.
    if (
      !terminal &&
      (nextStatus === task.status || nextStatus === AITaskStatus.PENDING)
    )
      return respData(taskView(task));
    await updateTask({
      taskId: task.id,
      status: nextStatus,
      expectedStatus: task.status,
      taskResult: failed
        ? { error: 'GENERATION_FAILED' }
        : terminal
          ? result.taskResult
          : undefined,
    });
    return respData(taskView((await findTask(task.id))!));
  } catch (error) {
    return respErr(error instanceof Error ? error.message : 'POLL_RETRY');
  }
}

export const Route = createFileRoute('/api/sintex-ai/task')({
  server: { handlers: { GET } },
});
