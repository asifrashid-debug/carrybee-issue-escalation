// Gmail SMTP sender for the daily report. Uses a Google app password (not the account password).
import nodemailer from 'nodemailer';

export function mailerConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function transport() {
  if (!mailerConfigured()) throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

// Sends one message per recipient, one at a time, so a failure for one person does not stop the others.
export async function sendAll(messages) {
  const tx = transport();
  const from = `"CarryBee Issue Tracker" <${process.env.GMAIL_USER}>`;
  const results = [];
  for (const m of messages) {
    try {
      const info = await tx.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
      results.push({ to: m.to, ok: true, id: info.messageId });
    } catch (err) {
      results.push({ to: m.to, ok: false, error: String(err?.message || err) });
    }
    await new Promise((r) => setTimeout(r, 1000)); // gentle pacing for Gmail limits
  }
  return results;
}
