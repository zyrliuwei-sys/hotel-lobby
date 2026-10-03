import { createFileRoute } from '@tanstack/react-router';

import { AIMediaType, FalProvider } from '@/core/ai';
import { getAuth } from '@/core/auth';
import {
  DEFAULT_DUET_LENGTH,
  isDuetLength,
  resolveDuetCreditsFor,
} from '@/config/hotel-lobby-pricing';
import {
  AITaskStatus,
  createTask,
  mergeTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { screenPrompt } from '@/modules/content-safety/service';
import { getBalance } from '@/modules/credits/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

import { DIRECTION_BLOCKED, isBlockedDirection } from './-direction-filter';
import {
  buildScenePrompt,
  motionVideoFor,
  parseSceneInput,
  PIPELINE_MODEL,
  submitScene,
  taskView,
  videoSceneQuality,
} from './-pipeline';

async function POST({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const body = await request.json();
    const input = parseSceneInput(body);
    if (!input) return respErr('Two JPG, PNG or WebP photos are required');
    if (isBlockedDirection(input.direction)) {
      return respErr(DIRECTION_BLOCKED);
    }
    const { photos, direction, size } = input;

    const configs = await getAllConfigs();
    if (!(await screenPrompt(direction, configs)).allowed) {
      return respErr(DIRECTION_BLOCKED);
    }

    // Admins generate free; everyone else pays 7× the fal cost in credits.
    // Checked first so an unpaid user always lands on the paywall.
    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    const length = isDuetLength(body?.length)
      ? body.length
      : DEFAULT_DUET_LENGTH;
    const price = resolveDuetCreditsFor(configs, length);
    if (!isAdmin && (await getBalance(session.user.id)) < price) {
      return respErr('Insufficient credits');
    }

    if (!configs.fal_api_key) return respErr('Generation is not configured');
    const motionVideoUrl = motionVideoFor(configs, length);
    if (!motionVideoUrl) return respErr('Reference video is not configured');

    const prompt = buildScenePrompt(direction, size);
    const task = await createTask({
      userId: session.user.id,
      mediaType: AIMediaType.VIDEO,
      provider: 'fal',
      model: PIPELINE_MODEL,
      prompt,
      costCredits: isAdmin ? 0 : price,
    });

    try {
      const provider = new FalProvider({ apiKey: configs.fal_api_key });
      const imageRequestId = await submitScene(
        provider,
        photos,
        prompt,
        size,
        videoSceneQuality(configs)
      );
      await mergeTaskInfo(task.id, { imageRequestId, motionVideoUrl });
    } catch (error: any) {
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskResult: { error: error?.message },
      });
      throw error;
    }

    return respData(taskView({ ...task, status: AITaskStatus.PENDING }));
  } catch (error: any) {
    return respErr(error?.message || 'Generate failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/generate')({
  server: { handlers: { POST } },
});
