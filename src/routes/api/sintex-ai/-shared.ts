import type { AiTask } from '@/config/db/schema';
import { SINTEX_MODELS, type SintexTask } from '@/config/sintex-ai-models';

export function isSintexTask(task: AiTask) {
  const info = JSON.parse(task.taskInfo || '{}');
  return (
    info.scene === 'sintex-video' &&
    task.provider === 'fal' &&
    Object.values(SINTEX_MODELS).some(
      (m) => m.textEndpoint === task.model || m.imageEndpoint === task.model
    )
  );
}

export function taskView(task: AiTask): SintexTask {
  const info = JSON.parse(task.taskInfo || '{}');
  const result = JSON.parse(task.taskResult || '{}');
  return {
    id: task.id,
    status: task.status as SintexTask['status'],
    model: info.model,
    duration: info.duration,
    aspect: info.aspect,
    imageInput: Boolean(info.imageInput),
    videoUrl: result.video?.url || null,
    error: result.error || null,
  };
}

export function isAllowedVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname.endsWith('.fal.media') ||
        url.hostname === 'storage.googleapis.com')
    );
  } catch {
    return false;
  }
}

export async function readVideoBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_INPUT');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 6_000_000) {
      await reader.cancel();
      throw new Error('IMAGE_TOO_LARGE');
    }
    chunks.push(Uint8Array.from(part.value));
  }
  return new Response(new Blob(chunks)).json();
}
