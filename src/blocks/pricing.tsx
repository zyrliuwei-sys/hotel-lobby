'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Film,
  Infinity as InfinityIcon,
  MonitorPlay,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { duetCredits } from '@/config/hotel-lobby-pricing';
import { pricingCatalog } from '@/config/pricing';
import { apiGet, apiPost } from '@/lib/api-client';
import { currentPathWithQuery } from '@/lib/redirect';
import { track } from '@/lib/track';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import {
  PaymentProviderModal,
  type PaymentProvider,
} from '@/components/payment-provider-modal';
import {
  PricingTable,
  type PricingFeature,
  type PricingGroup,
  type PricingPlan,
} from '@/components/pricing-table';

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const ALL_PROVIDERS: PaymentProvider[] = [
  'stripe',
  'creem',
  'waffo',
  'paypal',
  'alipay',
  'wechat',
];

export function Pricing({
  title,
  variant = 'section',
}: {
  title?: string;
  /** `dialog` drops the page-section chrome for use inside a modal. */
  variant?: 'section' | 'dialog';
} = {}) {
  const router = useRouter();
  const { data: session } = useSession();

  const { data: configsData, refetch: refetchConfigs } = usePublicConfig();
  const configs = configsData ?? {};
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);
  const [loadingProvider, setLoadingProvider] =
    useState<PaymentProvider | null>(null);

  const enabledProviders = useMemo<PaymentProvider[]>(
    () => ALL_PROVIDERS.filter((p) => configs[`${p}_enabled`] === 'true'),
    [configs]
  );

  // Live per-video price so "≈ N videos" matches what generation charges.
  const { data: priceData } = useQuery({
    queryKey: ['hotel-lobby-price'],
    queryFn: () => apiGet<{ credits: number }>('/api/hotel-lobby/price'),
    staleTime: 10 * 60_000,
  });
  const perVideo = priceData?.credits ?? duetCredits();

  function features(credits: number, extra: PricingFeature[]) {
    return [
      {
        icon: Sparkles,
        label: m['landing.pricing.feature_credits']({
          credits: credits.toLocaleString('en-US'),
        }),
      },
      {
        icon: Film,
        label: m['landing.pricing.feature_videos']({
          count: Math.floor(credits / perVideo),
        }),
      },
      { icon: MonitorPlay, label: m['landing.pricing.feature_hd']() },
      ...extra,
    ];
  }

  // Display data comes from the same catalog the checkout API trusts.
  function plan(
    productId: string,
    opts: {
      name: string;
      description: string;
      featured?: boolean;
      badge?: string;
      highlight?: string;
      extra?: PricingFeature[];
      originalPrice?: string;
    }
  ): PricingPlan {
    const product = pricingCatalog[productId];
    const interval = product.plan?.interval;
    // Yearly plans are shown as their monthly equivalent, billed yearly.
    const yearly = interval === 'year';
    return {
      id: productId,
      name: opts.name,
      description: yearly
        ? `${opts.description} · ${m['landing.pricing.billed_yearly']({ price: usd(product.priceInCents) })}`
        : opts.description,
      price: usd(
        yearly ? Math.round(product.priceInCents / 12) : product.priceInCents
      ),
      originalPrice: opts.originalPrice,
      interval: interval ? m['landing.pricing.per_month']() : undefined,
      featured: opts.featured,
      badge: opts.badge,
      highlight: opts.highlight,
      features: features(product.credits, opts.extra ?? []),
      productId,
      priceInCents: product.priceInCents,
      currency: product.currency,
      credits: product.credits,
      plan: product.plan,
      buttonText: product.plan ? undefined : m['landing.pricing.buy_now'](),
    };
  }

  const packExtra = [
    {
      icon: InfinityIcon,
      label: m['landing.pricing.feature_no_subscription'](),
    },
  ];
  const monthlyExtra = [
    {
      icon: CalendarClock,
      label: m['landing.pricing.feature_monthly_refill'](),
    },
    { icon: XCircle, label: m['landing.pricing.feature_cancel']() },
  ];
  const tiers = [
    ['basic', m['landing.pricing.basic'](), m['landing.pricing.basic_desc']()],
    ['pro', m['landing.pricing.pro'](), m['landing.pricing.pro_desc']()],
    [
      'studio',
      m['landing.pricing.studio'](),
      m['landing.pricing.studio_desc'](),
    ],
  ] as const;

  const groups: PricingGroup[] = [
    // Monthly first — it's the tab shown by default.
    {
      key: 'monthly',
      label: m['landing.pricing.monthly'](),
      plans: tiers.map(([tier, name, description]) =>
        plan(`${tier}_monthly`, {
          name,
          description,
          featured: tier === 'pro',
          badge: tier === 'pro' ? m['landing.pricing.popular']() : undefined,
          extra: monthlyExtra,
        })
      ),
    },
    {
      key: 'one-time',
      label: m['landing.pricing.one_time'](),
      badge: m['landing.pricing.first_order_tab'](),
      plans: [
        plan('pack_starter', {
          name: m['landing.pricing.pack_starter'](),
          description: m['landing.pricing.pack_desc'](),
          badge: m['landing.pricing.first_order_badge'](),
          highlight: m['landing.pricing.first_order_bonus'](),
          extra: packExtra,
        }),
        plan('pack_standard', {
          name: m['landing.pricing.pack_standard'](),
          description: m['landing.pricing.pack_desc'](),
          featured: true,
          badge: m['landing.pricing.popular'](),
          extra: packExtra,
        }),
        plan('pack_pro', {
          name: m['landing.pricing.pack_pro'](),
          description: m['landing.pricing.pack_desc'](),
          extra: packExtra,
        }),
      ],
    },
  ];

  const checkoutMutation = useMutation({
    mutationFn: ({
      plan,
      provider,
    }: {
      plan: PricingPlan;
      provider?: PaymentProvider;
    }) =>
      apiPost<{ checkout_url?: string }>('/api/payment/checkout', {
        product_id: plan.productId,
        product_name: plan.productName || plan.name,
        plan_name: plan.plan?.name || plan.name,
        price: plan.priceInCents,
        currency: plan.currency || 'usd',
        type: plan.plan ? 'subscription' : 'one-time',
        description: plan.name,
        plan: plan.plan,
        credits: plan.credits,
        credits_valid_days: plan.creditsValidDays,
        payment_provider: provider,
        // Come back to the page the user paid from.
        redirect: currentPathWithQuery('/settings/billing'),
      }),
    onSuccess: (data) => {
      if (!data?.checkout_url) {
        toast.error('Checkout failed');
        setLoadingProvider(null);
        return;
      }
      window.location.href = data.checkout_url;
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Checkout failed');
      setLoadingProvider(null);
    },
  });

  function startCheckout(plan: PricingPlan, provider?: PaymentProvider) {
    track('begin_checkout', {
      plan: plan.productId ?? '',
      value: (plan.priceInCents ?? 0) / 100,
    });
    setLoadingProvider(provider ?? null);
    checkoutMutation.mutate({ plan, provider });
  }

  async function handleCheckout(plan: PricingPlan) {
    if (!session?.user) {
      const callbackUrl = encodeURIComponent(currentPathWithQuery('/pricing'));
      router.push(`/sign-in?callbackUrl=${callbackUrl}`);
      return;
    }

    // A click can land before public config has loaded — fetch it first
    // instead of guessing a provider that may not be configured.
    const cfg = configsData ?? (await refetchConfigs()).data ?? {};
    const enabled = ALL_PROVIDERS.filter((p) => cfg[`${p}_enabled`] === 'true');
    const selectEnabled = cfg.select_payment_enabled === 'true';
    // Unknown → omit it; the server falls back to the admin default provider.
    const defaultProvider = (cfg.default_payment_provider || enabled[0]) as
      | PaymentProvider
      | undefined;

    if (selectEnabled && enabled.length > 1) {
      setPendingPlan(plan);
      setModalOpen(true);
      return;
    }

    await startCheckout(plan, defaultProvider);
  }

  function handleProviderSelect(provider: PaymentProvider) {
    if (!pendingPlan) return;
    startCheckout(pendingPlan, provider);
  }

  const dialog = variant === 'dialog';
  const Wrapper = dialog ? 'div' : 'section';

  return (
    <Wrapper
      id={dialog ? undefined : 'pricing'}
      className={
        dialog ? undefined : 'border-border border-t px-4 py-24 sm:py-32'
      }
    >
      <div className="mx-auto max-w-5xl">
        <div className={dialog ? 'mb-8 pr-8 text-center' : 'mb-20 text-center'}>
          <h2
            className={
              dialog
                ? 'font-serif text-2xl font-normal tracking-tight sm:text-3xl'
                : 'font-serif text-4xl font-normal tracking-tight sm:text-5xl'
            }
          >
            {title ?? m['landing.pricing.title']()}
          </h2>
          <p className="text-muted-foreground mt-5">
            {m['landing.pricing.description']()}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {m['landing.pricing.per_video']({
              credits: perVideo.toLocaleString('en-US'),
            })}
          </p>
        </div>
        <PricingTable groups={groups} onCheckout={handleCheckout} />
      </div>

      <PaymentProviderModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingPlan(null);
            setLoadingProvider(null);
          }
        }}
        providers={enabledProviders.length ? enabledProviders : ['stripe']}
        loadingProvider={loadingProvider}
        onSelect={handleProviderSelect}
        planName={pendingPlan?.name}
        price={pendingPlan?.price}
      />
    </Wrapper>
  );
}
