import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  notLike,
  or,
} from 'drizzle-orm';

import { db } from '@/core/db';
import { aiTask, type AiTask } from '@/config/db/schema';
import { consume, revoke } from '@/modules/credits/service';
import { getUuid } from '@/lib/hash';

export enum AITaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Create an AI task with optional credit consumption.
 */
export async function createTask(params: {
  userId: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  costCredits?: number;
  options?: any;
}): Promise<any> {
  const { userId, mediaType, provider, model, prompt, costCredits, options } =
    params;

  return db().transaction(async (tx: any) => {
    // 1. Insert task
    const taskData: any = {
      id: getUuid(),
      userId,
      mediaType,
      provider,
      model,
      prompt,
      status: AITaskStatus.PENDING,
      costCredits: costCredits || 0,
    };

    const [task] = await tx.insert(aiTask).values(taskData).returning();

    // 2. Consume credits if cost > 0
    if (costCredits && costCredits > 0) {
      const result = await consume({
        userId,
        credits: costCredits,
        scene: 'ai_task',
        description: `AI ${mediaType} generation`,
        metadata: JSON.stringify({ taskId: task.id }),
        tx,
      });

      if (!result.success) {
        throw new Error('Insufficient credits');
      }

      // Store consumed credit ID for potential revocation
      if (result.consumedCredit) {
        await tx
          .update(aiTask)
          .set({
            taskInfo: JSON.stringify({ creditId: result.consumedCredit.id }),
          })
          .where(eq(aiTask.id, task.id));
      }
    }

    return task;
  });
}

/**
 * Update task status. Revokes credits on failure.
 */
export async function updateTask(params: {
  taskId: string;
  status: AITaskStatus;
  taskResult?: any;
}) {
  const { taskId, status, taskResult } = params;

  const [task] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);

  if (!task) throw new Error('Task not found');

  // Update task
  const updateData: any = { status };
  if (taskResult) {
    updateData.taskResult = JSON.stringify(taskResult);
  }

  await db().update(aiTask).set(updateData).where(eq(aiTask.id, taskId));

  // Revoke credits on failure
  if (status === AITaskStatus.FAILED && task.taskInfo) {
    try {
      const info = JSON.parse(task.taskInfo as string);
      if (info.creditId) {
        await revoke(info.creditId);
      }
    } catch {
      // Ignore parse errors
    }
  }
}

/**
 * Record the provider-side task id (e.g. fal request_id) for later polling.
 */
export async function setProviderTaskId(
  taskId: string,
  providerTaskId: string
) {
  await db()
    .update(aiTask)
    .set({ taskId: providerTaskId })
    .where(eq(aiTask.id, taskId));
}

/**
 * Merge fields into a task's taskInfo JSON (keeps creditId for revocation).
 */
export async function mergeTaskInfo(
  taskId: string,
  patch: Record<string, unknown>
) {
  const task = await findTask(taskId);
  if (!task) throw new Error('Task not found');
  let info: Record<string, unknown> = {};
  try {
    info = task.taskInfo ? JSON.parse(task.taskInfo as string) : {};
  } catch {
    // Ignore parse errors
  }
  await db()
    .update(aiTask)
    .set({ taskInfo: JSON.stringify({ ...info, ...patch }) })
    .where(eq(aiTask.id, taskId));
}

/**
 * Atomically move a task from one status to another. Returns false if another
 * caller already moved it — use it to make multi-step pipelines idempotent.
 */
export async function claimTaskStatus(
  taskId: string,
  from: AITaskStatus,
  to: AITaskStatus
): Promise<boolean> {
  const rows = await db()
    .update(aiTask)
    .set({ status: to })
    .where(and(eq(aiTask.id, taskId), eq(aiTask.status, from)))
    .returning({ id: aiTask.id });
  return rows.length > 0;
}

/**
 * Get tasks for a user.
 */
export async function getTasks(params: {
  userId: string;
  mediaType?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { userId, mediaType, status, page = 1, limit = 20 } = params;

  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        status ? eq(aiTask.status, status) : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}

/**
 * Find task by ID.
 */
export async function findTask(taskId: string) {
  const [result] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);
  return result;
}

/**
 * Tasks of one model in the given statuses, oldest first — for background
 * sweeps that advance or clean up unfinished work.
 */
export async function listTasksByStatus(params: {
  model: string;
  statuses: string[];
  createdBefore?: Date;
  resultLike?: string;
  infoNotLike?: string;
  limit?: number;
}) {
  const {
    model,
    statuses,
    createdBefore,
    resultLike,
    infoNotLike,
    limit = 20,
  } = params;
  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.model, model),
        inArray(aiTask.status, statuses),
        createdBefore ? lt(aiTask.createdAt, createdBefore) : undefined,
        resultLike ? like(aiTask.taskResult, resultLike) : undefined,
        infoNotLike
          ? or(isNull(aiTask.taskInfo), notLike(aiTask.taskInfo, infoNotLike))
          : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(aiTask.createdAt)
    .limit(limit);
}

/**
 * One page of a user's tasks for a model, newest first, with the total.
 */
export async function getUserTasksPage(params: {
  userId: string;
  model: string;
  page?: number;
  pageSize?: number;
}) {
  const { userId, model, page = 1, pageSize = 12 } = params;
  const where = and(
    eq(aiTask.userId, userId),
    eq(aiTask.model, model),
    isNull(aiTask.deletedAt)
  );
  const [items, totals] = await Promise.all([
    db()
      .select()
      .from(aiTask)
      .where(where)
      .orderBy(desc(aiTask.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db().select({ n: count() }).from(aiTask).where(where),
  ]);
  return { items: items as AiTask[], total: Number(totals[0]?.n ?? 0) };
}
