import { createFileRoute } from '@tanstack/react-router';

import { AIMediaType, FalProvider } from '@/core/ai';
import { getAuth } from '@/core/auth';
import { resolveDuetCredits } from '@/config/hotel-lobby-pricing';
import { DEFAULT_DUET_SIZE, isDuetSize } from '@/config/hotel-lobby-sizes';
import {
  AITaskStatus,
  claimTaskStatus,
  createTask,
  findTask,
  mergeTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { getBalance } from '@/modules/credits/service';
import {
  claimPreview,
  findPreview,
  PreviewStatus,
} from '@/modules/hotel-preview/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

import {
  PIPELINE_MODEL,
  REFINE_PROMPT,
  submitMotion,
  submitScene,
  taskView,
} from './-pipeline';

// Paid step for a free preview: re-render its still at high quality (skipped
// if the preview already was high), then run the motion transfer. Same price
// as a full run — that price already covers a high-quality scene.
async function POST({ request }: { request: Request }) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized');
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const previewId = typeof body?.previewId === 'string' ? body.previewId : '';
    const preview = previewId ? await findPreview(previewId) : undefined;
    if (
      !preview ||
      preview.status !== PreviewStatus.SUCCESS ||
      !preview.sceneImageUrl
    ) {
      return respErr('Preview not found');
    }

    // Already animated (double click, or back after a reload): hand back
    // that task instead of charging again.
    if (preview.taskId) {
      const existing = await findTask(preview.taskId);
      if (existing && existing.userId === userId) {
        return respData(taskView(existing));
      }
      return respErr('Preview already used');
    }

    const configs = await getAllConfigs();
    const isAdmin = await hasPermission(userId, 'admin.*');
    const price = resolveDuetCredits(configs);
    if (!isAdmin && (await getBalance(userId)) < price) {
      return respErr('Insufficient credits');
    }
    if (!configs.fal_api_key) return respErr('Generation is not configured');
    const motionVideoUrl = configs.hotel_lobby_motion_video_url;
    if (!motionVideoUrl) return respErr('Reference video is not configured');

    const task = await createTask({
      userId,
      mediaType: AIMediaType.VIDEO,
      provider: 'fal',
      model: PIPELINE_MODEL,
      prompt: `Animate free preview ${preview.id}`,
      costCredits: isAdmin ? 0 : price,
    });

    if (!(await claimPreview(preview.id, userId, task.id))) {
      // Lost a race with a concurrent click: refund this task.
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskResult: { error: 'Preview already used' },
      });
      return respErr('Preview already used');
    }

    try {
      const provider = new FalProvider({ apiKey: configs.fal_api_key });
      if (preview.quality === 'high') {
        await claimTaskStatus(
          task.id,
          AITaskStatus.PENDING,
          AITaskStatus.PROCESSING
        );
        await submitMotion(
          task.id,
          provider,
          preview.sceneImageUrl,
          motionVideoUrl
        );
      } else {
        // Cheap preview still → re-render at high quality, then the regular
        // pipeline (task polling) runs the motion transfer on that frame.
        const size = isDuetSize(preview.size)
          ? preview.size
          : DEFAULT_DUET_SIZE;
        const imageRequestId = await submitScene(
          provider,
          [preview.sceneImageUrl],
          REFINE_PROMPT,
          size,
          'high'
        );
        await mergeTaskInfo(task.id, { imageRequestId, motionVideoUrl });
      }
    } catch (error: any) {
      await updateTask({
        taskId: task.id,
        status: AITaskStatus.FAILED,
        taskResult: { error: error?.message },
      });
      throw error;
    }

    return respData(taskView((await findTask(task.id))!));
  } catch (error: any) {
    return respErr(error?.message || 'Animate failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/animate')({
  server: { handlers: { POST } },
});
