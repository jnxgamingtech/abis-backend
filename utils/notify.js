const nodemailer = require('nodemailer');

const EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter = null;
if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT || 587,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    }
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    console.warn('Email transporter not configured, skipping email to', to);
    return;
  }
  const from = EMAIL_FROM || SMTP_USER;
  await transporter.sendMail({ from, to, subject, text, html });
}

// SMS placeholder: if TWILIO envs present, send using Twilio, otherwise log
async function sendSMS({ to, body }) {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const from = process.env.TWILIO_FROM;
    return client.messages.create({ to, from, body });
  }
  console.log('SMS not configured. Would send to', to, 'body:', body);
}

module.exports = { sendEmail, sendSMS };
