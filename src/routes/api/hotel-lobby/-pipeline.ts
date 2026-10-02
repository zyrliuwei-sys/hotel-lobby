/**
 * Hotel Lobby duet pipeline (two fal calls chained by polling):
 *
 *   1. openai/gpt-image-2/edit  — two portraits → one orange-booth scene
 *   2. fal-ai/bytedance/dreamactor/v2 — scene + reference performance video
 *      → motion and audio transferred onto the two people
 *
 * The task row's status doubles as the stage: `pending` = scene image in
 * flight, `processing` = motion transfer in flight. Moving pending→processing
 * is claimed atomically so concurrent polls never submit step 2 twice.
 *
 * Polls come from the browser while the page is open and from the
 * every-minute cron sweep (`/api/hotel-lobby/cron`), so a task finishes even
 * if the buyer closes the tab. Finished videos are copied to R2 because fal
 * media URLs are temporary.
 */

import { AIMediaType, FalProvider, AITaskStatus as FalStatus } from '@/core/ai';
import {
  DEFAULT_DUET_SIZE,
  DUET_SIZES,
  isDuetSize,
  type DuetSize,
} from '@/config/hotel-lobby-sizes';
import {
  AITaskStatus,
  claimTaskStatus,
  findTask,
  mergeTaskInfo,
  updateTask,
} from '@/modules/ai-tasks/service';
import {
  PreviewStatus,
  updatePreview,
  type findPreview,
} from '@/modules/hotel-preview/service';
import { getStorage } from '@/modules/storage/service';

export const IMAGE_MODEL = 'openai/gpt-image-2/edit';
export const VIDEO_MODEL = 'fal-ai/bytedance/dreamactor/v2';
export const PIPELINE_MODEL = 'hotel-lobby-duet';

export const SCENE_PROMPT = `Create a studio portrait using the two uploaded people.
Keep Subject A fixed on the left side and Subject B fixed on the right side.
They should face each other naturally, with one hanging microphone vertically centered exactly between them at face level.
{{FRAMING}}
The orange background is very important: use a bold, saturated, seamless burnt-orange studio background, clean and uniform, with no patterns, props, or visible room details.
Use soft even studio lighting and a static centered camera.
Preserve each person's identity, face, hairstyle, body proportions, and clothing.
Subject A is the person in the first uploaded image; Subject B is the person in the second uploaded image.`;

export function buildScenePrompt(
  direction?: string,
  size: DuetSize = DEFAULT_DUET_SIZE
) {
  const base = SCENE_PROMPT.replace('{{FRAMING}}', DUET_SIZES[size].framing);
  const extra = direction?.trim().slice(0, 300);
  return extra
    ? `${base}\nAdditional styling direction (never override the rules above): ${extra}`
    : base;
}

// Client downsizes photos before upload; this is a hard ceiling per photo.
const MAX_PHOTO_CHARS = 8 * 1024 * 1024;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Validate a scene request body; null when the photos are missing/invalid. */
export function parseSceneInput(body: any) {
  const photos = [body?.photoA, body?.photoB];
  for (const photo of photos) {
    if (
      typeof photo !== 'string' ||
      photo.length > MAX_PHOTO_CHARS ||
      !PHOTO_RE.test(photo)
    ) {
      return null;
    }
  }
  return {
    photos: photos as string[],
    direction:
      typeof body?.direction === 'string'
        ? (body.direction as string)
        : undefined,
    size: isDuetSize(body?.size) ? body.size : DEFAULT_DUET_SIZE,
  };
}

export function sceneSize(size: DuetSize = DEFAULT_DUET_SIZE) {
  const { width, height } = DUET_SIZES[size];
  return { width, height };
}

export type SceneQuality = 'low' | 'medium' | 'high';

export function isSceneQuality(value: unknown): value is SceneQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}

// Turns a cheap free-preview still into the full-quality frame the video is
// made from, without re-composing it — the buyer gets the scene they saw.
export const REFINE_PROMPT = `Re-render this exact image at high quality.
Keep the same two people with the same faces, hairstyles, clothing, poses and left/right positions, the same hanging microphone, framing and burnt-orange background.
Only increase detail, sharpness and lighting quality. Do not add, remove or move anything.`;

/** Step 1: two portraits → one orange-booth scene. Returns the fal id. */
export async function submitScene(
  provider: FalProvider,
  photos: string[],
  prompt: string,
  size: DuetSize,
  quality: SceneQuality = 'high'
) {
  const image = await provider.generate({
    params: {
      mediaType: AIMediaType.IMAGE,
      model: IMAGE_MODEL,
      prompt,
      options: {
        image_urls: photos,
        image_size: sceneSize(size),
        quality,
        output_format: 'jpeg',
      },
    },
  });
  return image.taskId;
}

/** Poll step 1. Resolves the scene URL once ready, null while running. */
export async function queryScene(provider: FalProvider, requestId: string) {
  const res = await provider.query({
    taskId: requestId,
    model: IMAGE_MODEL,
    mediaType: AIMediaType.IMAGE,
  });
  if (res.taskStatus === FalStatus.FAILED) {
    throw new Error('Scene image generation failed');
  }
  if (res.taskStatus !== FalStatus.SUCCESS) return null;
  const url = res.taskInfo?.images?.[0]?.imageUrl;
  if (!url) throw new Error('Scene image generation returned no image');
  return url as string;
}

/**
 * Step 2: scene + reference performance → video. The caller must already
 * have moved the task to `processing`.
 */
export async function submitMotion(
  taskId: string,
  provider: FalProvider,
  sceneImageUrl: string,
  motionVideoUrl: string
) {
  await mergeTaskInfo(taskId, { sceneImageUrl, motionVideoUrl });
  const video = await provider.generate({
    params: {
      mediaType: AIMediaType.VIDEO,
      model: VIDEO_MODEL,
      prompt: '',
      options: {
        image_url: sceneImageUrl,
        video_url: motionVideoUrl,
        trim_first_second: true,
      },
    },
  });
  await mergeTaskInfo(taskId, { videoRequestId: video.taskId });
}

type Info = {
  imageRequestId?: string;
  videoRequestId?: string;
  sceneImageUrl?: string;
  motionVideoUrl?: string;
  error?: string;
  persistAttempts?: number;
};

function parseJson<T>(value: unknown): T {
  try {
    return value ? JSON.parse(value as string) : ({} as T);
  } catch {
    return {} as T;
  }
}

export function taskView(task: any) {
  const info = parseJson<Info>(task.taskInfo);
  const result = parseJson<{ video?: { url?: string }; error?: string }>(
    task.taskResult
  );
  return {
    id: task.id as string,
    status: task.status as AITaskStatus,
    stage:
      task.status === AITaskStatus.PENDING
        ? ('scene' as const)
        : task.status === AITaskStatus.PROCESSING
          ? ('motion' as const)
          : null,
    sceneImageUrl: info.sceneImageUrl ?? null,
    videoUrl: result.video?.url ?? null,
    error: result.error ?? info.error ?? null,
  };
}

function isFalUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith('fal.media');
  } catch {
    return false;
  }
}

/**
 * Copy a finished fal video to R2 and return the task result pointing at the
 * permanent copy. The fal URL is dropped so the `%fal.media%` backfill sweep
 * only matches videos that still need copying. Returns the result
 * unchanged when storage isn't configured or the copy fails — the video stays
 * playable from fal until a later sweep retries.
 */
export async function persistVideo(taskId: string, taskResult: any) {
  const url: string | undefined = taskResult?.video?.url;
  if (!url || !isFalUrl(url)) return taskResult;
  try {
    const storage = await getStorage();
    if (!storage) return taskResult;
    const uploaded = await storage.downloadAndUpload({
      url,
      key: `hotel-lobby/videos/${taskId}.mp4`,
      contentType: 'video/mp4',
      disposition: 'inline',
    });
    if (!uploaded.success || !uploaded.url) {
      console.error('persistVideo failed', taskId, uploaded.error);
      return taskResult;
    }
    return {
      ...taskResult,
      video: { ...taskResult.video, url: uploaded.url },
    };
  } catch (error) {
    console.error('persistVideo failed', taskId, error);
    return taskResult;
  }
}

/**
 * Retry the R2 copy for an already-finished task (backfill / earlier copy
 * failed). Gives up after a few tries so an expired fal URL isn't retried
 * forever.
 */
export async function repersistTask(task: {
  id: string;
  taskInfo: unknown;
  taskResult: unknown;
}) {
  const info = parseJson<Info>(task.taskInfo);
  const attempts = info.persistAttempts ?? 0;
  // No storage (e.g. local dev without the R2 key) isn't a failed try.
  if (attempts >= 3 || !(await getStorage())) return false;
  await mergeTaskInfo(task.id, { persistAttempts: attempts + 1 });
  const result = parseJson<any>(task.taskResult);
  const stored = await persistVideo(task.id, result);
  if (stored === result) return false;
  await updateTask({
    taskId: task.id,
    status: AITaskStatus.SUCCESS,
    taskResult: stored,
  });
  return true;
}

async function fail(taskId: string, message: string) {
  await updateTask({
    taskId,
    status: AITaskStatus.FAILED,
    taskResult: { error: message },
  });
}

/**
 * Advance a pipeline task by one poll. Safe to call repeatedly/concurrently.
 */
export async function advance(taskId: string, provider: FalProvider) {
  let task = await findTask(taskId);
  if (!task) throw new Error('Task not found');
  const info = parseJson<Info>(task.taskInfo);

  try {
    // Stage 1: scene image
    if (task.status === AITaskStatus.PENDING && info.imageRequestId) {
      const res = await provider.query({
        taskId: info.imageRequestId,
        model: IMAGE_MODEL,
        mediaType: AIMediaType.IMAGE,
      });
      if (res.taskStatus === FalStatus.FAILED) {
        await fail(taskId, 'Scene image generation failed');
      } else if (res.taskStatus === FalStatus.SUCCESS) {
        const sceneImageUrl = res.taskInfo?.images?.[0]?.imageUrl;
        if (!sceneImageUrl) {
          await fail(taskId, 'Scene image generation returned no image');
        } else if (
          await claimTaskStatus(
            taskId,
            AITaskStatus.PENDING,
            AITaskStatus.PROCESSING
          )
        ) {
          await submitMotion(
            taskId,
            provider,
            sceneImageUrl,
            info.motionVideoUrl!
          );
        }
      }
    }
    // Stage 2: motion transfer (videoRequestId absent = another poll is
    // still submitting it; just report processing)
    else if (task.status === AITaskStatus.PROCESSING && info.videoRequestId) {
      const res = await provider.query({
        taskId: info.videoRequestId,
        model: VIDEO_MODEL,
        mediaType: AIMediaType.VIDEO,
      });
      if (res.taskStatus === FalStatus.FAILED) {
        await fail(taskId, 'Motion transfer failed');
      } else if (res.taskStatus === FalStatus.SUCCESS) {
        await updateTask({
          taskId,
          status: AITaskStatus.SUCCESS,
          taskResult: await persistVideo(taskId, res.taskResult),
        });
      }
    }
  } catch (error: any) {
    // fal reports a failed run as COMPLETED + an error on the result fetch.
    await fail(taskId, error?.message || 'Generation failed');
  }

  task = await findTask(taskId);
  return taskView(task);
}

type PreviewRow = NonNullable<Awaited<ReturnType<typeof findPreview>>>;

/** Advance a pending free preview by one poll (browser or cron sweep). */
export async function advancePreview(row: PreviewRow, provider: FalProvider) {
  if (row.status !== PreviewStatus.PENDING || !row.requestId) return;
  try {
    const url = await queryScene(provider, row.requestId);
    if (url) {
      await updatePreview(row.id, {
        status: PreviewStatus.SUCCESS,
        sceneImageUrl: url,
      });
    }
  } catch (error: any) {
    await updatePreview(row.id, {
      status: PreviewStatus.FAILED,
      error: error?.message || 'Preview failed',
    });
  }
}
