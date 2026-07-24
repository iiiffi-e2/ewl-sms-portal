import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function readSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;

  if (!host || !port || !from) {
    return null;
  }

  return { host, port, user, pass, from };
}

/**
 * Send a transactional email through SMTP.
 *
 * When SMTP is not configured (e.g. local dev), this degrades gracefully: it
 * logs the message to the server console instead of throwing, so flows like
 * password reset keep working end-to-end without an email provider. Configure
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM to send real
 * mail. Never surface the outcome to the caller — see forgot-password route.
 */
export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const config = readSmtpConfig();

  if (!config) {
    console.warn(
      `[email] SMTP not configured; email to ${to} not sent. Subject: "${subject}"\n${text}`,
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 is implicit TLS; other ports use STARTTLS.
    secure: config.port === 465,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html,
  });
}
