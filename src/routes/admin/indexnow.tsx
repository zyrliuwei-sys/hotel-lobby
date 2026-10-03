import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { TextField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type Status = {
  key: string | null;
  keyFileUrl: string | null;
  keyFile: { url: string; ok: boolean; status: number; error?: string } | null;
};

type SubmitResult = {
  submitted: number;
  results: { status: number; ok: boolean; meaning: string; count: number }[];
};

const QUERY_KEY = ['admin-indexnow'];

const keySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9-]{8,128}$/, m['admin.indexnow.key_invalid']()),
});

function IndexNowPage() {
  const queryClient = useQueryClient();
  const [urls, setUrls] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);

  const statusQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<Status>('/api/admin/indexnow'),
  });
  const status = statusQuery.data;

  const saveKey = useMutation({
    mutationFn: (key: string) => apiPut<Status>('/api/admin/indexnow', { key }),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      toast.success(m['admin.indexnow.saved']());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: (body: { mode: 'sitemap' } | { urls: string[] }) =>
      apiPost<SubmitResult>('/api/admin/indexnow', body),
    onSuccess: (data) => {
      setResult(data);
      if (data.results.every((r) => r.ok)) {
        toast.success(m['admin.indexnow.submitted']({ count: data.submitted }));
      } else {
        toast.error(data.results.find((r) => !r.ok)?.meaning);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const form = useForm({
    defaultValues: { key: '' },
    validators: { onSubmit: keySchema },
    onSubmit: async ({ value }) => {
      await saveKey.mutateAsync(value.key.trim());
    },
  });

  // Prefill the saved key once it loads.
  useEffect(() => {
    if (status?.key && !form.state.values.key) {
      form.setFieldValue('key', status.key);
    }
  }, [status?.key]);

  const keyFile = status?.keyFile;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.indexnow.title']()}</h1>
        <p className="text-muted-foreground">
          {m['admin.indexnow.description']()}
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{m['admin.indexnow.step_key']()}</CardTitle>
          <CardDescription>
            {m['admin.indexnow.step_key_desc']()}{' '}
            <a
              className="underline"
              href="https://www.bing.com/indexnow/getstarted"
              target="_blank"
              rel="noopener noreferrer"
            >
              bing.com/indexnow/getstarted
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className="flex-1">
              <form.Field name="key">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.indexnow.key_label']()}
                    placeholder="804998589fe84f6f800c71a2e1005e57"
                    autoComplete="off"
                  />
                )}
              </form.Field>
            </div>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {m['admin.indexnow.save']()}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{m['admin.indexnow.step_verify']()}</CardTitle>
          <CardDescription>
            {m['admin.indexnow.step_verify_desc']()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQuery.isPending ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : !keyFile ? (
            <p className="text-muted-foreground text-sm">
              {m['admin.indexnow.no_key']()}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {keyFile.ok ? (
                <CheckCircle2 className="size-4 text-green-600" />
              ) : (
                <XCircle className="text-destructive size-4" />
              )}
              <a
                className="inline-flex items-center gap-1 font-mono break-all underline"
                href={keyFile.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {keyFile.url}
                <ExternalLink className="size-3" />
              </a>
              <span
                className={keyFile.ok ? 'text-green-600' : 'text-destructive'}
              >
                {keyFile.ok
                  ? m['admin.indexnow.key_file_ok']()
                  : m['admin.indexnow.key_file_bad']({
                      status: String(keyFile.status),
                    })}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            {statusQuery.isFetching && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {m['admin.indexnow.recheck']()}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{m['admin.indexnow.step_submit']()}</CardTitle>
          <CardDescription>
            {m['admin.indexnow.step_submit_desc']()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => submit.mutate({ mode: 'sitemap' })}
            disabled={!status?.key || submit.isPending}
          >
            {submit.isPending && <Loader2 className="size-4 animate-spin" />}
            {m['admin.indexnow.submit_sitemap']()}
          </Button>
          <div className="space-y-2">
            <Textarea
              rows={4}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={m['admin.indexnow.urls_placeholder']()}
            />
            <Button
              variant="outline"
              onClick={() =>
                submit.mutate({
                  urls: urls
                    .split(/\s+/)
                    .map((u) => u.trim())
                    .filter(Boolean),
                })
              }
              disabled={!status?.key || !urls.trim() || submit.isPending}
            >
              {m['admin.indexnow.submit_urls']()}
            </Button>
          </div>
          {result && (
            <div className="bg-muted space-y-1 rounded-md p-3 text-sm">
              <p className="font-medium">
                {m['admin.indexnow.result_count']({ count: result.submitted })}
              </p>
              {result.results.map((r, i) => (
                <p
                  key={i}
                  className={r.ok ? 'text-green-600' : 'text-destructive'}
                >
                  HTTP {r.status} · {r.meaning} ({r.count})
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/admin/indexnow')({
  component: IndexNowPage,
});
