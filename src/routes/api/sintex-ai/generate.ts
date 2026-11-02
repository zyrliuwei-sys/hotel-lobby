import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { sintexCredits } from '@/config/sintex-ai-models';
import {
  AITaskStatus,
  createTask,
  findTask,
  mergeTaskInfo,
  setProviderTaskId,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { screenPrompt } from '@/modules/content-safety/service';
import { hasPermission } from '@/modules/rbac/service';
import {
  providerEndpoint,
  submitVideo,
  videoInputSchema,
} from '@/modules/sintex-video/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

import { readVideoBody, taskView } from './-shared';

async function POST({ request }: { request: Request }) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });
    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 5000,
      keyPrefix: 'sintex-generate',
      extraKey: session.user.id,
    });
    if (limited) return limited;
    const parsed = videoInputSchema.safeParse(await readVideoBody(request));
    if (!parsed.success) return respErr('INVALID_INPUT', { status: 400 });
    const input = parsed.data;
    const configs = await getAllConfigs();
    if (!configs.fal_api_key)
      return respErr('GENERATION_UNAVAILABLE', { status: 503 });
    if (!(await screenPrompt(input.prompt, configs)).allowed)
      return respErr('PROMPT_BLOCKED', { status: 400 });
    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    const task = await createTask({
      userId: session.user.id,
      mediaType: 'video',
      provider: 'fal',
      model: providerEndpoint(input),
      prompt: input.prompt,
      costCredits: isAdmin ? 0 : sintexCredits(input.model, input.duration),
    });
    try {
      await mergeTaskInfo(task.id, {
        scene: 'sintex-video',
        model: input.model,
        duration: input.duration,
        aspect: input.aspect,
        imageInput: Boolean(input.imageData),
      });
      const result = await submitVideo(configs.fal_api_key, input);
      await setProviderTaskId(task.id, result.taskId);
      return respData(taskView((await findTask(task.id))!));
    } catch (error) {
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskResult: { error: 'GENERATION_FAILED' },
      });
      console.error(
        '[sintex] submit failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return respErr('GENERATION_FAILED', { status: 502 });
    }
  } catch (error) {
    return respErr(
      error instanceof Error ? error.message : 'GENERATION_FAILED'
    );
  }
}

export const Route = createFileRoute('/api/sintex-ai/generate')({
  server: { handlers: { POST } },
});
