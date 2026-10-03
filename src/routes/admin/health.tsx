import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type CheckLevel = 'ok' | 'warn' | 'error';

type HealthCheck = {
  key: string;
  level: CheckLevel;
  count: number;
  items: { id: string; detail: string; at?: string }[];
  rate?: number;
  finished?: number;
};

type MoneyRow = {
  currency: string;
  users: number;
  orders: number;
  amount: number;
};

type DayStats = {
  signups: number;
  ordersCreated: number;
  paid: MoneyRow[];
  previews: number;
  previewsAnimated: number;
  videos: { total: number; success: number; failed: number; active: number };
};

type HealthReport = {
  generatedAt: string;
  today: DayStats;
  yesterday: DayStats;
  freePreviews: { last24h: number; cap: number };
  checks: HealthCheck[];
};

const CHECK_TEXT: Record<string, { title: () => string; hint: () => string }> =
  {
    config: {
      title: () => m['admin.health.check.config.title'](),
      hint: () => m['admin.health.check.config.hint'](),
    },
    stuck_tasks: {
      title: () => m['admin.health.check.stuck_tasks.title'](),
      hint: () => m['admin.health.check.stuck_tasks.hint'](),
    },
    task_failures: {
      title: () => m['admin.health.check.task_failures.title'](),
      hint: () => m['admin.health.check.task_failures.hint'](),
    },
    paid_without_credits: {
      title: () => m['admin.health.check.paid_without_credits.title'](),
      hint: () => m['admin.health.check.paid_without_credits.hint'](),
    },
    duplicate_grants: {
      title: () => m['admin.health.check.duplicate_grants.title'](),
      hint: () => m['admin.health.check.duplicate_grants.hint'](),
    },
    unrefunded_failures: {
      title: () => m['admin.health.check.unrefunded_failures.title'](),
      hint: () => m['admin.health.check.unrefunded_failures.hint'](),
    },
    negative_credits: {
      title: () => m['admin.health.check.negative_credits.title'](),
      hint: () => m['admin.health.check.negative_credits.hint'](),
    },
    unpersisted_videos: {
      title: () => m['admin.health.check.unpersisted_videos.title'](),
      hint: () => m['admin.health.check.unpersisted_videos.hint'](),
    },
    stuck_previews: {
      title: () => m['admin.health.check.stuck_previews.title'](),
      hint: () => m['admin.health.check.stuck_previews.hint'](),
    },
    preview_quota: {
      title: () => m['admin.health.check.preview_quota.title'](),
      hint: () => m['admin.health.check.preview_quota.hint'](),
    },
  };

const LEVEL_ORDER: Record<CheckLevel, number> = { error: 0, warn: 1, ok: 2 };

function money(rows: MoneyRow[]) {
  if (!rows.length) return '0';
  return rows.map((r) => `${r.amount.toFixed(2)} ${r.currency}`).join(' · ');
}

function paidUsers(rows: MoneyRow[]) {
  return rows.reduce((n, r) => n + r.users, 0);
}

function paidOrders(rows: MoneyRow[]) {
  return rows.reduce((n, r) => n + r.orders, 0);
}

function LevelIcon({ level }: { level: CheckLevel }) {
  if (level === 'error') {
    return <XCircle className="size-5 shrink-0 text-red-500" />;
  }
  if (level === 'warn') {
    return <AlertTriangle className="size-5 shrink-0 text-amber-500" />;
  }
  return <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />;
}

function Metric({
  label,
  value,
  yesterday,
}: {
  label: string;
  value: string | number;
  yesterday: string | number;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-xl font-semibold break-words">{value}</div>
        <div className="text-muted-foreground text-xs">
          {m['admin.health.vs_yesterday']({ value: String(yesterday) })}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckCard({ check }: { check: HealthCheck }) {
  const text = CHECK_TEXT[check.key];
  const extra =
    check.key === 'task_failures' && check.finished
      ? ` · ${check.rate}% (${check.count}/${check.finished})`
      : check.count
        ? ` · ${check.count}`
        : '';
  return (
    <Card
      size="sm"
      className={cn(
        check.level === 'error' && 'ring-red-500/40',
        check.level === 'warn' && 'ring-amber-500/40'
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <LevelIcon level={check.level} />
          <span>
            {text?.title() ?? check.key}
            {extra}
          </span>
        </CardTitle>
      </CardHeader>
      {check.level !== 'ok' && (
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{text?.hint()}</p>
          {check.items.length > 0 && (
            <ul className="space-y-1">
              {check.items.map((item) => (
                <li
                  key={item.id}
                  className="bg-muted/50 rounded-md px-2 py-1 font-mono text-xs break-all"
                >
                  {item.id}
                  {item.detail ? ` · ${item.detail}` : ''}
                  {item.at ? ` · ${new Date(item.at).toLocaleString()}` : ''}
                </li>
              ))}
            </ul>
          )}
          {check.count > check.items.length && (
            <p className="text-muted-foreground text-xs">
              {m['admin.health.more']({
                count: String(check.count - check.items.length),
              })}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function HealthPage() {
  const query = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => apiGet<HealthReport>('/api/admin/health'),
    refetchInterval: 60_000,
  });
  const report = query.data;
  const checks = [...(report?.checks ?? [])].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
  );
  const problems = checks.filter((c) => c.level !== 'ok').length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{m['admin.health.title']()}</h1>
          <p className="text-muted-foreground text-sm">
            {m['admin.health.description']()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={cn('size-4', query.isFetching && 'animate-spin')}
          />
          {m['admin.health.refresh']()}
        </Button>
      </div>

      {query.error && (
        <p className="text-sm text-red-500">{(query.error as Error).message}</p>
      )}

      {report && (
        <>
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium',
              problems
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-emerald-500/40 bg-emerald-500/5'
            )}
          >
            <LevelIcon level={problems ? 'error' : 'ok'} />
            <span>
              {problems
                ? m['admin.health.problems']({ count: String(problems) })
                : m['admin.health.all_ok']()}
            </span>
            <span className="text-muted-foreground ml-auto text-xs font-normal">
              {m['admin.health.updated_at']({
                time: new Date(report.generatedAt).toLocaleTimeString(),
              })}
            </span>
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold">{m['admin.health.today']()}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label={m['admin.health.metric.signups']()}
                value={report.today.signups}
                yesterday={report.yesterday.signups}
              />
              <Metric
                label={m['admin.health.metric.paid_users']()}
                value={paidUsers(report.today.paid)}
                yesterday={paidUsers(report.yesterday.paid)}
              />
              <Metric
                label={m['admin.health.metric.revenue']()}
                value={money(report.today.paid)}
                yesterday={money(report.yesterday.paid)}
              />
              <Metric
                label={m['admin.health.metric.orders']()}
                value={`${report.today.ordersCreated} / ${paidOrders(report.today.paid)}`}
                yesterday={`${report.yesterday.ordersCreated} / ${paidOrders(report.yesterday.paid)}`}
              />
              <Metric
                label={m['admin.health.metric.previews']()}
                value={report.today.previews}
                yesterday={report.yesterday.previews}
              />
              <Metric
                label={m['admin.health.metric.previews_animated']()}
                value={report.today.previewsAnimated}
                yesterday={report.yesterday.previewsAnimated}
              />
              <Metric
                label={m['admin.health.metric.videos']()}
                value={`${report.today.videos.success} / ${report.today.videos.failed}`}
                yesterday={`${report.yesterday.videos.success} / ${report.yesterday.videos.failed}`}
              />
              <Card size="sm">
                <CardContent className="space-y-1">
                  <div className="text-muted-foreground text-xs">
                    {m['admin.health.metric.free_quota']()}
                  </div>
                  <div className="text-xl font-semibold">
                    {report.freePreviews.last24h} / {report.freePreviews.cap}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">{m['admin.health.checks']()}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {checks.map((check) => (
                <CheckCard key={check.key} check={check} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute('/admin/health')({
  component: HealthPage,
});
