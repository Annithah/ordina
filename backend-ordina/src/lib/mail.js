/**
 * Sends email. Uses Resend's HTTPS API (RESEND_API_KEY + MAIL_FROM), which works on Render's
 * free plan where outgoing SMTP ports are blocked. SMTP_* is still supported elsewhere.
 * Returns { sent: false } when no email service is configured.
 */
async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'ORDINA <onboarding@resend.dev>', to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Log the status only: never the address or the message body.
    const error = new Error(`Email provider answered ${response.status}`);
    error.status = 502;
    throw error;
  }
  return { sent: true };
}

async function sendWithSmtp({ to, subject, text, html }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { sent: true };
}

function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

async function sendMail(message) {
  if (process.env.RESEND_API_KEY) return sendWithResend(message);
  if (process.env.SMTP_HOST) return sendWithSmtp(message);
  return { sent: false };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** The password reset email (English, French and Kinyarwanda in one message). */
function resetEmail(code) {
  const text = [
    `Your ORDINA password reset code is ${code}. It works for 15 minutes.`,
    `Votre code de réinitialisation ORDINA est ${code}. Il est valable 15 minutes.`,
    `Kode yawe yo guhindura ijambobanga rya ORDINA ni ${code}. Ikora iminota 15.`,
    '',
    "If you didn't ask for this, you can ignore this email.",
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;color:#0F172A">
<p>Your ORDINA password reset code / Votre code / Kode yawe:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#5C4DF2">${escapeHtml(code)}</p>
<p>It works for 15 minutes. · Valable 15 minutes. · Ikora iminota 15.</p>
<p style="color:#64748B">If you didn't ask for this, you can ignore this email.</p></div>`;
  return { subject: 'ORDINA password reset code', text, html };
}

module.exports = { sendMail, mailConfigured, resetEmail };
