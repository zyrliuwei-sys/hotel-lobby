import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const copy = {
  en: {
    preview: (app: string) =>
      `Your account is ready — make your first ${app} duet video`,
    heading: (app: string) => `Welcome to ${app}`,
    greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi there,'),
    intro:
      'Your account is ready. Upload two photos and we turn them into the viral two-person duet in the orange recording booth — scene, moves and audio included.',
    stepsTitle: 'How it works',
    steps: [
      'Upload one clear portrait for each person.',
      'Get a free watermarked preview of you both in the booth.',
      'Happy with it? Animate it — your MP4 with audio is ready in about 3–5 minutes.',
    ],
    credits: (n: number) =>
      `We've added ${n.toLocaleString('en-US')} free credits to your account to get you started.`,
    bonus:
      'First order bonus: your first credit pack comes with 1 extra video free.',
    refund: 'If a generation fails, your credits are refunded automatically.',
    cta: 'Make your first duet',
    videos: 'Your finished videos are always saved in My videos.',
    footer: (app: string) =>
      `You're receiving this email because you created an account on ${app}.`,
  },
  zh: {
    preview: (app: string) => `账号已就绪，来做你的第一个 ${app} 对唱视频`,
    heading: (app: string) => `欢迎来到 ${app}`,
    greeting: (name?: string) => (name ? `${name}，你好：` : '你好：'),
    intro:
      '你的账号已经准备好了。上传两张照片，我们就能为你生成暖橙色录音棚里的双人对唱视频：场景、动作和声音一步到位。',
    stepsTitle: '三步出片',
    steps: [
      '为两个人各上传一张清晰的正脸照。',
      '免费生成一张带水印的预览，看看你们在录音棚里的样子。',
      '满意就点生成视频，约 3–5 分钟拿到带音频的 MP4。',
    ],
    credits: (n: number) =>
      `我们已向你的账号赠送 ${n.toLocaleString('en-US')} 积分，可以直接开始。`,
    bonus: '首单福利：第一次购买积分包，加送 1 个视频。',
    refund: '生成失败会自动退还积分。',
    cta: '做第一个对唱视频',
    videos: '生成好的视频都会保存在「我的视频」里。',
    footer: (app: string) => `你收到这封邮件，是因为你在 ${app} 注册了账号。`,
  },
};

export function WelcomeEmail({
  appName = 'our app',
  logoUrl,
  url,
  videosUrl,
  name,
  credits,
  locale = 'en',
}: {
  appName?: string;
  logoUrl?: string;
  /** Where the main button goes (the create section). */
  url: string;
  /** "My videos" page; the line is omitted when not given. */
  videosUrl?: string;
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

            <Text style={styles.stepsTitle}>{t.stepsTitle}</Text>
            {t.steps.map((step, i) => (
              <Text key={i} style={styles.step}>
                <span style={styles.stepNum}>{i + 1}</span>
                {step}
              </Text>
            ))}

            <Section style={styles.buttonWrap}>
              <Button href={url} style={styles.button}>
                {t.cta}
              </Button>
            </Section>

            <Section style={styles.perks}>
              {credits && credits > 0 ? (
                <Text style={styles.perk}>
                  {'🎁\u00a0\u00a0'}
                  {t.credits(credits)}
                </Text>
              ) : null}
              <Text style={styles.perk}>
                {'🎬\u00a0\u00a0'}
                {t.bonus}
              </Text>
              <Text style={styles.perk}>
                {'↩️\u00a0\u00a0'}
                {t.refund}
              </Text>
            </Section>

            {videosUrl ? (
              <Text style={styles.small}>
                <Link href={videosUrl} style={styles.link}>
                  {t.videos}
                </Link>
              </Text>
            ) : null}

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
    background: 'linear-gradient(90deg, #f97316 0%, #fb923c 55%, #fdba74 100%)',
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
    backgroundColor: '#ea580c',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    padding: '12px 18px',
    display: 'inline-block',
  },
  stepsTitle: {
    margin: '20px 0 8px',
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 700,
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  step: {
    margin: '0 0 8px',
    fontSize: 14,
    lineHeight: '22px',
    color: '#334155',
  },
  stepNum: {
    display: 'inline-block',
    width: 22,
    height: 22,
    marginRight: 10,
    borderRadius: 999,
    backgroundColor: '#f97316',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: '22px',
    textAlign: 'center',
  },
  perks: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: '12px 16px',
    margin: '6px 0 14px',
  },
  perk: {
    margin: '4px 0',
    fontSize: 13,
    lineHeight: '20px',
    color: '#7c2d12',
  },
  small: {
    margin: '0 0 6px',
    fontSize: 12,
    lineHeight: '18px',
    color: '#64748b',
    textAlign: 'center',
  },
  link: {
    color: '#ea580c',
    textDecoration: 'underline',
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
