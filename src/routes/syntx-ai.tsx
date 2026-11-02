import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/syntx-ai')({
  beforeLoad: () => {
    throw redirect({ to: '/sintex-ai', statusCode: 301 });
  },
});
