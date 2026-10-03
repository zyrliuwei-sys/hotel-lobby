import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import { getHealthReport } from '@/modules/ops-health/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

import { PIPELINE_MODEL } from '../hotel-lobby/-pipeline';
import { previewLimits } from '../hotel-lobby/-preview';

// Operations health check for /admin/health: today's numbers + problems.
async function GET({ request }: { request: Request }) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized');
    if (!(await hasPermission(session.user.id, 'admin.*'))) {
      return respErr('Forbidden');
    }

    const configs = await getAllConfigs();
    const report = await getHealthReport({
      model: PIPELINE_MODEL,
      configs,
      hasCronSecret: Boolean(envConfigs.auth_secret),
      previewCap: previewLimits(configs).dailyCap,
    });
    return respData(report);
  } catch (error: any) {
    return respErr(error?.message || 'Health check failed');
  }
}

export const Route = createFileRoute('/api/admin/health')({
  server: { handlers: { GET } },
});
