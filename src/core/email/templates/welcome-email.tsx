import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const copy = {
  en: {
    preview: (app: string) => `Welcome to ${app}`,
    heading: (app: string) => `Welcome to ${app}`,
    greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi there,'),
    intro: 'Thanks for signing up — your account is ready.',
    credits: (n: number) =>
      `We've added ${n.toLocaleString('en-US')} free credits to your account so you can try it right away.`,
    cta: 'Get started',
    footer: (app: string) =>
      `You're receiving this email because you created an account on ${app}.`,
  },
  zh: {
    preview: (app: string) => `欢迎来到 ${app}`,
    heading: (app: string) => `欢迎来到 ${app}`,
    greeting: (name?: string) => (name ? `${name}，你好：` : '你好：'),
    intro: '感谢注册，你的账号已经准备好了。',
    credits: (n: number) =>
      `我们已向你的账号赠送 ${n.toLocaleString('en-US')} 积分，现在就可以开始体验。`,
    cta: '开始使用',
    footer: (app: string) => `你收到这封邮件，是因为你在 ${app} 注册了账号。`,
  },
};

export function WelcomeEmail({
  appName = 'our app',
  logoUrl,
  url,
  name,
  credits,
  locale = 'en',
}: {
  appName?: string;
  logoUrl?: string;
  url: string;
  name?: string;
  /** Signup credits granted, if any — omitted from the copy when 0. */
  credits?: number;
  locale?: string;
}) {
  const t = locale.startsWith('zh') ? copy.zh : copy.en;
  return (
    <Html>
      <Head />
      <Preview>{t.preview(appName)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.accentBar} />
            <Section style={styles.brandRow}>
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  width="40"
                  height="40"
                  alt={appName}
                  style={styles.cardLogo}
                />
              ) : null}
              <Text style={styles.cardBrand}>{appName}</Text>
            </Section>
            <Heading style={styles.h1}>{t.heading(appName)}</Heading>
            <Text style={styles.p}>{t.greeting(name)}</Text>
            <Text style={styles.p}>{t.intro}</Text>
            {credits && credits > 0 ? (
              <Text style={styles.p}>{t.credits(credits)}</Text>
            ) : null}

            <Section style={styles.buttonWrap}>
              <Button href={url} style={styles.button}>
                {t.cta}
              </Button>
            </Section>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>{t.footer(appName)}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#f6f9fc',
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif',
    color: '#0f172a',
  },
  container: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '32px 16px 40px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: '28px 24px',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    boxShadow:
      '0 20px 50px rgba(2, 6, 23, 0.10), 0 2px 8px rgba(2, 6, 23, 0.05)',
  },
  accentBar: {
    height: 6,
    borderRadius: 999,
    marginBottom: 18,
    background:
      'linear-gradient(90deg, rgba(99,102,241,1) 0%, rgba(236,72,153,1) 55%, rgba(14,165,233,1) 100%)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardLogo: {
    borderRadius: 10,
    border: '1px solid rgba(15, 23, 42, 0.10)',
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  cardBrand: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: '18px',
    fontWeight: 600,
    color: '#0f172a',
    letterSpacing: '-0.01em',
  },
  h1: {
    margin: '0 0 14px',
    fontSize: 24,
    lineHeight: '30px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  p: {
    margin: '0 0 12px',
    fontSize: 14,
    lineHeight: '22px',
    color: '#334155',
  },
  buttonWrap: {
    textAlign: 'center',
    margin: '20px 0 14px',
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    padding: '12px 18px',
    display: 'inline-block',
  },
  hr: {
    borderColor: 'rgba(15, 23, 42, 0.08)',
    margin: '18px 0',
  },
  footer: {
    margin: 0,
    fontSize: 12,
    lineHeight: '18px',
    color: '#94a3b8',
  },
};
