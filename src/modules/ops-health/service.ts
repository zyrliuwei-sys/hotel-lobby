/**
 * Operations health check: today's numbers plus a set of problem detectors
 * (stuck or failing generations, credit and order inconsistencies, missing
 * provider config). Read-only — it only reports, the admin decides.
 *
 * "Today" is the Beijing calendar day (UTC+8), matching how the owner reads
 * the numbers.
 */

import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
} from 'drizzle-orm';

import { db } from '@/core/db';
import { aiTask, credit, hotelPreview, order, user } from '@/config/db/schema';

export type CheckLevel = 'ok' | 'warn' | 'error';

export type CheckItem = {
  id: string;
  detail: string;
  at?: string;
};

export type HealthCheck = {
  key: string;
  level: CheckLevel;
  count: number;
  items: CheckItem[];
  /** task_failures only: failure % and finished tasks in the last 24h */
  rate?: number;
  finished?: number;
};

export type MoneyRow = {
  currency: string;
  users: number;
  orders: number;
  amount: number;
};

export type DayStats = {
  signups: number;
  ordersCreated: number;
  paid: MoneyRow[];
  previews: number;
  previewsAnimated: number;
  videos: { total: number; success: number; failed: number; active: number };
};

export type HealthReport = {
  generatedAt: string;
  today: DayStats;
  yesterday: DayStats;
  freePreviews: { last24h: number; cap: number };
  checks: HealthCheck[];
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BEIJING_OFFSET = 8 * HOUR;
const MAX_ITEMS = 10;

const STUCK_TASK_MS = 30 * MIN;
const STUCK_PREVIEW_MS = 15 * MIN;

/** Start of the current Beijing day, as a UTC Date. */
export function beijingDayStart(now = Date.now()) {
  return new Date(
    Math.floor((now + BEIJING_OFFSET) / DAY) * DAY - BEIJING_OFFSET
  );
}

function parseJson(value: unknown): any {
  try {
    return value ? JSON.parse(value as string) : {};
  } catch {
    return {};
  }
}

function join(...parts: unknown[]) {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(' · ');
}

function iso(value: unknown) {
  return value ? new Date(value as any).toISOString() : undefined;
}

function minutesSince(value: unknown, now: number) {
  return Math.round((now - new Date(value as any).getTime()) / MIN);
}

function check(
  key: string,
  items: CheckItem[],
  level: CheckLevel,
  total = items.length
): HealthCheck {
  return {
    key,
    level: total ? level : 'ok',
    count: total,
    items: items.slice(0, MAX_ITEMS),
  };
}

async function dayStats(model: string, from: Date, to: Date) {
  const [[signups], [created], paidRows, [previews], [animated], tasks] =
    await Promise.all([
      db()
        .select({ n: count() })
        .from(user)
        .where(and(gte(user.createdAt, from), lt(user.createdAt, to))),
      db()
        .select({ n: count() })
        .from(order)
        .where(
          and(
            gte(order.createdAt, from),
            lt(order.createdAt, to),
            isNull(order.deletedAt)
          )
        ),
      db()
        .select({
          userId: order.userId,
          currency: order.currency,
          amount: order.amount,
          paymentAmount: order.paymentAmount,
        })
        .from(order)
        .where(
          and(
            eq(order.status, 'paid'),
            gte(order.paidAt, from),
            lt(order.paidAt, to),
            isNull(order.deletedAt)
          )
        ),
      db()
        .select({ n: count() })
        .from(hotelPreview)
        .where(
          and(gte(hotelPreview.createdAt, from), lt(hotelPreview.createdAt, to))
        ),
      db()
        .select({ n: count() })
        .from(hotelPreview)
        .where(
          and(
            gte(hotelPreview.createdAt, from),
            lt(hotelPreview.createdAt, to),
            isNotNull(hotelPreview.taskId)
          )
        ),
      db()
        .select({ status: aiTask.status, n: count() })
        .from(aiTask)
        .where(
          and(
            eq(aiTask.model, model),
            gte(aiTask.createdAt, from),
            lt(aiTask.createdAt, to),
            isNull(aiTask.deletedAt)
          )
        )
        .groupBy(aiTask.status),
    ]);

  const money = new Map<string, MoneyRow & { ids: Set<string> }>();
  for (const row of paidRows) {
    const cur = (row.currency || '').toUpperCase() || '?';
    const entry = money.get(cur) ?? {
      currency: cur,
      users: 0,
      orders: 0,
      amount: 0,
      ids: new Set<string>(),
    };
    entry.orders++;
    entry.ids.add(row.userId);
    entry.amount += Number(row.paymentAmount ?? row.amount ?? 0);
    money.set(cur, entry);
  }

  const videos = { total: 0, success: 0, failed: 0, active: 0 };
  for (const row of tasks) {
    const n = Number(row.n);
    videos.total += n;
    if (row.status === 'success') videos.success += n;
    else if (row.status === 'failed') videos.failed += n;
    else if (row.status === 'pending' || row.status === 'processing')
      videos.active += n;
  }

  return {
    signups: Number(signups?.n ?? 0),
    ordersCreated: Number(created?.n ?? 0),
    paid: [...money.values()].map(({ ids, ...rest }) => ({
      ...rest,
      users: ids.size,
      amount: rest.amount / 100,
    })),
    previews: Number(previews?.n ?? 0),
    previewsAnimated: Number(animated?.n ?? 0),
    videos,
  } satisfies DayStats;
}

/** Duet tasks that should have finished long ago. */
async function stuckTasks(model: string, now: number) {
  const rows = await db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.model, model),
        inArray(aiTask.status, ['pending', 'processing']),
        lt(aiTask.createdAt, new Date(now - STUCK_TASK_MS)),
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(aiTask.createdAt)
    .limit(200);
  const items = rows.map((t: any) => {
    const info = parseJson(t.taskInfo);
    const stage =
      t.status === 'pending'
        ? info.imageRequestId
          ? 'scene'
          : 'scene not submitted'
        : info.videoRequestId
          ? 'motion'
          : 'motion not submitted';
    return {
      id: t.id,
      detail: `${stage} · ${minutesSince(t.createdAt, now)} min`,
      at: iso(t.createdAt),
    };
  });
  // Over an hour means the cron sweep isn't finishing them either.
  const old = rows.some(
    (t: any) => now - new Date(t.createdAt).getTime() > HOUR
  );
  return check('stuck_tasks', items, old ? 'error' : 'warn');
}

/** Failure rate of duet tasks finished in the last 24h, grouped by error. */
async function failureRate(model: string, now: number) {
  const rows = await db()
    .select({
      id: aiTask.id,
      status: aiTask.status,
      taskResult: aiTask.taskResult,
      createdAt: aiTask.createdAt,
    })
    .from(aiTask)
    .where(
      and(
        eq(aiTask.model, model),
        inArray(aiTask.status, ['success', 'failed']),
        gte(aiTask.createdAt, new Date(now - DAY)),
        isNull(aiTask.deletedAt)
      )
    )
    .limit(5000);
  const failed = rows.filter((r: any) => r.status === 'failed');
  const byError = new Map<string, number>();
  for (const r of failed) {
    const msg = String(parseJson(r.taskResult).error || 'unknown').slice(
      0,
      120
    );
    byError.set(msg, (byError.get(msg) ?? 0) + 1);
  }
  const items = [...byError.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([msg, n]) => ({ id: msg, detail: `× ${n}` }));
  const rate = rows.length ? failed.length / rows.length : 0;
  // A couple of failures on a quiet day isn't an incident.
  const level: CheckLevel =
    failed.length >= 3 && rate >= 0.4
      ? 'error'
      : failed.length >= 3 && rate >= 0.15
        ? 'warn'
        : 'ok';
  return {
    key: 'task_failures',
    level,
    count: failed.length,
    items: items.slice(0, MAX_ITEMS),
    rate: Math.round(rate * 100),
    finished: rows.length,
  };
}

/** Finished videos still only on fal's temporary URLs (R2 copy failed). */
async function unpersistedVideos(model: string) {
  const rows = await db()
    .select({ id: aiTask.id, createdAt: aiTask.createdAt })
    .from(aiTask)
    .where(
      and(
        eq(aiTask.model, model),
        eq(aiTask.status, 'success'),
        like(aiTask.taskResult, '%fal.media%'),
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(aiTask.createdAt)
    .limit(200);
  return check(
    'unpersisted_videos',
    rows.map((r: any) => ({
      id: r.id,
      detail: 'fal.media',
      at: iso(r.createdAt),
    })),
    'warn'
  );
}

/** Purchase grants (not bonuses) issued more than once for the same order. */
async function duplicateGrants(now: number) {
  const rows = await db()
    .select({
      orderNo: credit.orderNo,
      userEmail: credit.userEmail,
      credits: credit.credits,
      createdAt: credit.createdAt,
    })
    .from(credit)
    .where(
      and(
        eq(credit.transactionType, 'grant'),
        inArray(credit.transactionScene, ['payment', 'subscription']),
        gte(credit.createdAt, new Date(now - 90 * DAY)),
        isNull(credit.deletedAt)
      )
    )
    .limit(20000);
  const byOrder = new Map<
    string,
    { n: number; email: string; credits: number }
  >();
  for (const r of rows) {
    if (!r.orderNo) continue;
    const e = byOrder.get(r.orderNo) ?? {
      n: 0,
      email: r.userEmail || '',
      credits: r.credits,
    };
    e.n++;
    byOrder.set(r.orderNo, e);
  }
  // Subscription renewals reuse the order number, so only one-time orders
  // are expected to have exactly one grant.
  const oneTime = new Set(
    (
      await db()
        .select({ orderNo: order.orderNo })
        .from(order)
        .where(
          and(
            inArray(
              order.orderNo,
              [...byOrder.entries()]
                .filter(([, e]) => e.n > 1)
                .map(([k]) => k)
                .concat('__none__')
            ),
            eq(order.paymentType, 'one-time')
          )
        )
    ).map((r: { orderNo: string }) => r.orderNo)
  );
  const items = [...byOrder.entries()]
    .filter(([no, e]) => e.n > 1 && oneTime.has(no))
    .map(([no, e]) => ({
      id: no,
      detail: join(e.email, `${e.n} × ${e.credits}`),
    }));
  return check('duplicate_grants', items, 'error');
}

/** Paid orders that should have granted credits but didn't. */
async function paidWithoutCredits(now: number) {
  const paid = await db()
    .select({
      orderNo: order.orderNo,
      userEmail: order.userEmail,
      creditsAmount: order.creditsAmount,
      paidAt: order.paidAt,
    })
    .from(order)
    .where(
      and(
        eq(order.status, 'paid'),
        gte(order.paidAt, new Date(now - 30 * DAY)),
        isNull(order.deletedAt)
      )
    )
    .limit(5000);
  const want = paid.filter((o: any) => Number(o.creditsAmount) > 0);
  if (!want.length) return check('paid_without_credits', [], 'error');
  const granted = new Set<string>();
  // Chunked to stay under the D1 bound-parameter limit.
  for (let i = 0; i < want.length; i += 90) {
    const chunk = want.slice(i, i + 90).map((o: any) => o.orderNo);
    const rows = await db()
      .select({ orderNo: credit.orderNo })
      .from(credit)
      .where(
        and(
          inArray(credit.orderNo, chunk),
          eq(credit.transactionType, 'grant'),
          inArray(credit.transactionScene, ['payment', 'subscription'])
        )
      );
    for (const r of rows) if (r.orderNo) granted.add(r.orderNo);
  }
  const items = want
    .filter((o: any) => !granted.has(o.orderNo))
    .map((o: any) => ({
      id: o.orderNo,
      detail: join(o.userEmail, o.creditsAmount),
      at: iso(o.paidAt),
    }));
  return check('paid_without_credits', items, 'error');
}

/** Failed paid tasks whose credits were never given back. */
async function unrefundedFailures(model: string, now: number) {
  const failed = await db()
    .select({
      id: aiTask.id,
      taskInfo: aiTask.taskInfo,
      costCredits: aiTask.costCredits,
      createdAt: aiTask.createdAt,
    })
    .from(aiTask)
    .where(
      and(
        eq(aiTask.model, model),
        eq(aiTask.status, 'failed'),
        gte(aiTask.createdAt, new Date(now - 7 * DAY))
      )
    )
    .limit(2000);
  const byCredit = new Map<string, any>();
  for (const t of failed) {
    if (!(Number(t.costCredits) > 0)) continue;
    const creditId = parseJson(t.taskInfo).creditId;
    if (creditId) byCredit.set(creditId, t);
  }
  const ids = [...byCredit.keys()];
  const stillCharged: string[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await db()
      .select({ id: credit.id })
      .from(credit)
      .where(
        and(
          inArray(credit.id, ids.slice(i, i + 90)),
          eq(credit.transactionType, 'consume'),
          eq(credit.status, 'active')
        )
      );
    stillCharged.push(...rows.map((r: { id: string }) => r.id));
  }
  const items = stillCharged.map((cid) => {
    const t = byCredit.get(cid);
    return { id: t.id, detail: `${t.costCredits}`, at: iso(t.createdAt) };
  });
  return check('unrefunded_failures', items, 'error');
}

/** Grant rows driven below zero (a broken consume). */
async function negativeCredits() {
  const rows = await db()
    .select({
      id: credit.id,
      userEmail: credit.userEmail,
      remaining: credit.remainingCredits,
    })
    .from(credit)
    .where(lt(credit.remainingCredits, 0))
    .limit(200);
  return check(
    'negative_credits',
    rows.map((r: any) => ({
      id: r.id,
      detail: join(r.userEmail, r.remaining),
    })),
    'error'
  );
}

/** Free previews that never came back. */
async function stuckPreviews(now: number) {
  const rows = await db()
    .select({ id: hotelPreview.id, createdAt: hotelPreview.createdAt })
    .from(hotelPreview)
    .where(
      and(
        eq(hotelPreview.status, 'pending'),
        lt(hotelPreview.createdAt, new Date(now - STUCK_PREVIEW_MS))
      )
    )
    .orderBy(hotelPreview.createdAt)
    .limit(200);
  return check(
    'stuck_previews',
    rows.map((r: any) => ({
      id: r.id,
      detail: `${minutesSince(r.createdAt, now)} min`,
      at: iso(r.createdAt),
    })),
    'warn'
  );
}

/** Settings the money path can't run without. */
function configCheck(configs: Record<string, string>, hasCronSecret: boolean) {
  const on = (v?: string) => v === 'true';
  const missing: CheckItem[] = [];
  if (!configs.fal_api_key) missing.push({ id: 'fal_api_key', detail: 'AI' });
  if (
    !(configs.r2_access_key && configs.r2_secret_key && configs.r2_bucket_name)
  ) {
    missing.push({ id: 'r2', detail: 'Storage' });
  }
  if (
    !on(configs.stripe_enabled) &&
    !on(configs.paypal_enabled) &&
    !on(configs.creem_enabled)
  ) {
    missing.push({ id: 'payment', detail: 'Payment' });
  }
  if (!hasCronSecret) missing.push({ id: 'AUTH_SECRET', detail: 'Cron' });
  return check('config', missing, 'error');
}

export async function getHealthReport(params: {
  model: string;
  configs: Record<string, string>;
  hasCronSecret: boolean;
  previewCap: number;
}): Promise<HealthReport> {
  const { model, configs, hasCronSecret, previewCap } = params;
  const now = Date.now();
  const todayStart = beijingDayStart(now);
  const tomorrow = new Date(todayStart.getTime() + DAY);
  const yesterdayStart = new Date(todayStart.getTime() - DAY);

  const [today, yesterday, [last24h]] = await Promise.all([
    dayStats(model, todayStart, tomorrow),
    dayStats(model, yesterdayStart, todayStart),
    db()
      .select({ n: count() })
      .from(hotelPreview)
      .where(gte(hotelPreview.createdAt, new Date(now - DAY))),
  ]);

  const checks = await Promise.all([
    Promise.resolve(configCheck(configs, hasCronSecret)),
    stuckTasks(model, now),
    failureRate(model, now),
    paidWithoutCredits(now),
    duplicateGrants(now),
    unrefundedFailures(model, now),
    negativeCredits(),
    unpersistedVideos(model),
    stuckPreviews(now),
  ]);

  // Free previews near the site-wide daily cap: new visitors get "paused".
  const cap = previewCap;
  const used = Number(last24h?.n ?? 0);
  checks.push(
    check(
      'preview_quota',
      cap && used >= cap * 0.8 ? [{ id: `${used} / ${cap}`, detail: '' }] : [],
      used >= cap ? 'error' : 'warn'
    )
  );

  return {
    generatedAt: new Date(now).toISOString(),
    today,
    yesterday,
    freePreviews: { last24h: used, cap },
    checks,
  };
}
