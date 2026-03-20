import nodemailer from 'nodemailer';

function createTransporter() {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpService = process.env.SMTP_SERVICE?.trim();
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpSecure = process.env.SMTP_SECURE?.trim() === 'true'; // true for 465, false for other ports
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  if (!smtpHost && !smtpService) return null;

  if (!smtpUser || !smtpPass) {
    const message =
      'SMTP_USER/SMTP_PASS missing; check that the backend is loading `backe/.env` and that both are set.';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`[email] ${message} Skipping email delivery in non-production.`);
    return null;
  }

  return nodemailer.createTransport(
    smtpService
      ? { service: smtpService, auth: { user: smtpUser, pass: smtpPass } }
      : {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
        }
  );
}

let cachedTransporter: nodemailer.Transporter | null | undefined;
let didVerify = false;

function getTransporter() {
  if (cachedTransporter === undefined) {
    cachedTransporter = createTransporter();
  }
  if (cachedTransporter && !didVerify) {
    didVerify = true;
    cachedTransporter.verify().catch((err) => {
      if (process.env.NODE_ENV === 'production') {
        console.error('SMTP transporter verification failed', err);
      }
    });
  }
  return cachedTransporter;
}

// generic OTP email helper; `purpose` should be a short phrase like "reset your password" or "delete your account".
export async function sendPasswordResetEmail(
  to: string,
  otp: string,
  purpose: string = 'reset your password'
) {
  const from =
    process.env.SMTP_FROM ||
    `"No Reply" <${process.env.SMTP_USER?.trim() || `no-reply@${process.env.SMTP_HOST || 'localhost'}`}>`;
  const subject = `Your ${purpose} code`;
  const text = `You requested to ${purpose}. Use the following code to continue:\n\n${otp}\n\n`;
  const html = `<p>You requested to ${purpose}. Use the following code to continue:</p><p><b>${otp}</b></p>`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[email] OTP for ${to}: ${otp}`);
  }

  const transporter = getTransporter();
  if (!transporter) return null;

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] message sent:', info.messageId);
    }
    return info;
  } catch (err) {
    console.error('[email] failed to send mail', err);
    throw err;
  }
}
