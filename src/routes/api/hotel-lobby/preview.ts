import { createFileRoute } from '@tanstack/react-router';

import { FalProvider } from '@/core/ai';
import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import { screenPrompt } from '@/modules/content-safety/service';
import {
  countAllPreviews,
  countVisitorPreviews,
  createPreview,
  findPreview,
  PreviewStatus,
  updatePreview,
} from '@/modules/hotel-preview/service';
import { hasPermission } from '@/modules/rbac/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

import { DIRECTION_BLOCKED, isBlockedDirection } from './-direction-filter';
import {
  advancePreview,
  buildScenePrompt,
  isSceneQuality,
  parseSceneInput,
  submitScene,
} from './-pipeline';
import {
  deviceCookie,
  FREE_PREVIEW_PAUSED,
  FREE_PREVIEW_USED,
  previewLimits,
  visitor,
} from './-preview';

type PreviewRow = NonNullable<Awaited<ReturnType<typeof findPreview>>>;

// The fal URL never reaches the browser: the still is served through
// /api/hotel-lobby/preview-image so the client can only show it watermarked.
function previewView(row: PreviewRow) {
  return {
    id: row.id,
    status: row.status as 'pending' | 'success' | 'failed',
    size: row.size,
    imageUrl:
      row.status === PreviewStatus.SUCCESS
        ? `/api/hotel-lobby/preview-image?id=${row.id}`
        : null,
    animatedTaskId: row.taskId,
    error: row.error,
  };
}

async function isAdmin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  return {
    userId,
    admin: userId ? await hasPermission(userId, 'admin.*') : false,
  };
}

async function freeLeft(
  request: Request,
  configs: Record<string, string>,
  ids: { ipHash: string; deviceId: string },
  admin: boolean
) {
  if (admin) return { left: 1, reason: null };
  const { dailyCap, perVisitor } = previewLimits(configs);
  if (!dailyCap || !perVisitor || !configs.fal_api_key) {
    return { left: 0, reason: FREE_PREVIEW_PAUSED };
  }
  if ((await countAllPreviews()) >= dailyCap) {
    return { left: 0, reason: FREE_PREVIEW_PAUSED };
  }
  const used = await countVisitorPreviews(ids.ipHash, ids.deviceId);
  const left = Math.max(0, perVisitor - used);
  return { left, reason: left ? null : FREE_PREVIEW_USED };
}

function withDevice(
  response: Response,
  ids: { deviceId: string; isNewDevice: boolean },
  request: Request
) {
  if (ids.isNewDevice) {
    response.headers.append('Set-Cookie', deviceCookie(ids.deviceId, request));
  }
  return response;
}

// GET ?id=… polls a preview; without an id it reports today's free quota.
async function GET({ request }: { request: Request }) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    const configs = await getAllConfigs();

    if (!id) {
      const ids = visitor(request);
      const { admin } = await isAdmin(request);
      const quota = await freeLeft(request, configs, ids, admin);
      return withDevice(respData(quota), ids, request);
    }

    let row = await findPreview(id);
    if (!row) return respErr('Preview not found');

    if (row.status === PreviewStatus.PENDING && row.requestId) {
      const provider = new FalProvider({ apiKey: configs.fal_api_key });
      await advancePreview(row, provider);
      row = (await findPreview(id))!;
    }

    return respData(previewView(row));
  } catch (error: any) {
    return respErr(error?.message || 'Query failed');
  }
}

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 10_000,
    keyPrefix: 'hotel-preview',
  });
  if (limited) return limited;

  try {
    const input = parseSceneInput(await request.json());
    if (!input) return respErr('Two JPG, PNG or WebP photos are required');
    if (isBlockedDirection(input.direction)) {
      return respErr(DIRECTION_BLOCKED);
    }

    const configs = await getAllConfigs();
    if (!(await screenPrompt(input.direction, configs)).allowed) {
      return respErr(DIRECTION_BLOCKED);
    }
    const ids = visitor(request);
    const { userId, admin } = await isAdmin(request);
    const quota = await freeLeft(request, configs, ids, admin);
    if (!quota.left) {
      return withDevice(respErr(quota.reason!), ids, request);
    }

    // Free stills default to the cheapest tier (~10× under high); the paid
    // animate step re-renders them at high quality first.
    const quality = isSceneQuality(configs.hotel_lobby_preview_quality)
      ? configs.hotel_lobby_preview_quality
      : 'low';
    const row = await createPreview({
      ipHash: ids.ipHash,
      deviceId: ids.deviceId,
      userId,
      size: input.size,
      quality,
    });

    try {
      const provider = new FalProvider({ apiKey: configs.fal_api_key });
      const requestId = await submitScene(
        provider,
        input.photos,
        buildScenePrompt(input.direction, input.size),
        input.size,
        quality
      );
      await updatePreview(row.id, { requestId });
    } catch (error: any) {
      await updatePreview(row.id, {
        status: PreviewStatus.FAILED,
        error: error?.message || 'Preview failed',
      });
      throw error;
    }

    return withDevice(
      respData(previewView({ ...row, status: PreviewStatus.PENDING })),
      ids,
      request
    );
  } catch (error: any) {
    return respErr(error?.message || 'Preview failed');
  }
}

export const Route = createFileRoute('/api/hotel-lobby/preview')({
  server: { handlers: { GET, POST } },
});
