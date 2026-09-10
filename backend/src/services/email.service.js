const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const config = require('../config/env');

const RESET_SUBJECT = 'Reset your SEA-IT-SOLVED password';
const DEVELOPMENT_PROVIDER = 'development';
const MICROSOFT_GRAPH_PROVIDER = 'microsoft_graph';
const RESEND_PROVIDER = 'resend';
const GMAIL_SMTP_PROVIDER = 'gmail_smtp';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

function resolveMailProvider() {
  const configured = String(config.MAIL_PROVIDER || '').trim().toLowerCase();
  return configured || (config.NODE_ENV === 'development' ? DEVELOPMENT_PROVIDER : '');
}

function microsoftGraphSettings() {
  return {
    tenantId: config.MICROSOFT_TENANT_ID,
    clientId: config.MICROSOFT_CLIENT_ID,
    clientSecret: config.MICROSOFT_CLIENT_SECRET,
    senderEmail: config.MICROSOFT_SENDER_EMAIL,
  };
}

function resendSettings() {
  return {
    apiKey: config.RESEND_API_KEY,
    from: config.MAIL_FROM,
  };
}

function gmailSmtpSettings() {
  return {
    user: config.GMAIL_SMTP_USER,
    appPassword: config.GMAIL_SMTP_APP_PASSWORD,
    from: config.MAIL_FROM,
  };
}

function mailboxAddress(value) {
  const source = String(value || '').trim();
  const bracketed = source.match(/<([^<>]+)>$/);
  return String(bracketed ? bracketed[1] : source).trim().toLowerCase();
}

function gmailFromHeader(settings = gmailSmtpSettings()) {
  return `SEA-IT-SOLVED <${mailboxAddress(settings.user)}>`;
}

function validateMicrosoftGraphSettings(settings = microsoftGraphSettings()) {
  const required = [
    ['MICROSOFT_TENANT_ID', settings.tenantId],
    ['MICROSOFT_CLIENT_ID', settings.clientId],
    ['MICROSOFT_CLIENT_SECRET', settings.clientSecret],
    ['MICROSOFT_SENDER_EMAIL', settings.senderEmail],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) {
    throw new Error(`MAIL_PROVIDER=microsoft_graph requires: ${missing.join(', ')}.`);
  }
  return settings;
}

function validateResendSettings(settings = resendSettings()) {
  const required = [
    ['RESEND_API_KEY', settings.apiKey],
    ['MAIL_FROM', settings.from],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) throw new Error(`MAIL_PROVIDER=resend requires: ${missing.join(', ')}.`);
  return settings;
}

function validateGmailSmtpSettings(settings = gmailSmtpSettings()) {
  const required = [
    ['GMAIL_SMTP_USER', settings.user],
    ['GMAIL_SMTP_APP_PASSWORD', settings.appPassword],
    ['MAIL_FROM', settings.from],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) throw new Error(`MAIL_PROVIDER=gmail_smtp requires: ${missing.join(', ')}.`);
  return settings;
}

function validateEmailConfiguration(provider = resolveMailProvider()) {
  if (provider === MICROSOFT_GRAPH_PROVIDER) validateMicrosoftGraphSettings();
  else if (provider === RESEND_PROVIDER) validateResendSettings();
  else if (provider === GMAIL_SMTP_PROVIDER) validateGmailSmtpSettings();
  else if (provider === DEVELOPMENT_PROVIDER && config.NODE_ENV !== 'development') {
    throw new Error('MAIL_PROVIDER=development is only allowed when NODE_ENV=development.');
  } else if (![DEVELOPMENT_PROVIDER, MICROSOFT_GRAPH_PROVIDER, RESEND_PROVIDER, GMAIL_SMTP_PROVIDER].includes(provider)) {
    throw new Error('MAIL_PROVIDER must be development, resend, gmail_smtp, or microsoft_graph.');
  }
  return provider;
}

function resetEmail({ resetUrl, expiresInMinutes }) {
  const text = [
    'SEA-IT-SOLVED Password Reset',
    '',
    'We received a request to reset your password.',
    '',
    'Open the following link to continue:',
    resetUrl,
    '',
    `This link expires in ${expiresInMinutes} minutes.`,
    '',
    'If you did not request this reset, ignore this email.',
  ].join('\n');
  const html = `<!doctype html><html><body><p>SEA-IT-SOLVED</p><h1>Reset your password</h1><p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link expires in ${expiresInMinutes} minutes.</p><p>If you did not request this reset, ignore this email.</p></body></html>`;
  return { text, html };
}

function logSafeResendError(error) {
  const safeName = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error';
  const status = Number(error?.statusCode ?? error?.status);
  console.error(`[Mail] Resend error name: ${safeName}`);
  console.error(`[Mail] Resend error status: ${Number.isInteger(status) ? status : 'UNKNOWN'}`);
  console.error('[Mail] Resend error message: Provider request failed.');
}

function createResendClient(apiKey) {
  const client = new Resend(apiKey);
  // The SDK logs its complete provider error object outside production.
  // Replace that development logger so only our redacted diagnostics are emitted.
  if (typeof client.logError === 'function') client.logError = () => {};
  return client;
}

async function sendWithMicrosoftGraph(
  { email, resetUrl, expiresInMinutes },
  { settings = microsoftGraphSettings(), confidentialClient, fetchImpl = fetch } = {}
) {
  const validated = validateMicrosoftGraphSettings(settings);
  const client = confidentialClient || new ConfidentialClientApplication({
    auth: {
      clientId: validated.clientId,
      authority: `https://login.microsoftonline.com/${encodeURIComponent(validated.tenantId)}`,
      clientSecret: validated.clientSecret,
    },
  });

  let authentication;
  try {
    authentication = await client.acquireTokenByClientCredential({ scopes: [GRAPH_SCOPE] });
  } catch {
    throw new Error('Microsoft Graph authentication failed.');
  }
  if (!authentication?.accessToken) throw new Error('Microsoft Graph authentication did not return an access token.');

  const content = resetEmail({ resetUrl, expiresInMinutes });
  let response;
  try {
    response = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(validated.senderEmail)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authentication.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: RESET_SUBJECT,
          body: { contentType: 'HTML', content: content.html },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        saveToSentItems: false,
      }),
    });
  } catch {
    throw new Error('Microsoft Graph sendMail request failed.');
  }
  if (!response.ok) throw new Error(`Microsoft Graph sendMail was rejected with status ${response.status}.`);
  return { provider: MICROSOFT_GRAPH_PROVIDER, accepted: true, status: response.status };
}

async function sendWithResend(
  { email, resetUrl, expiresInMinutes },
  { settings = resendSettings(), resendClient } = {}
) {
  const validated = validateResendSettings(settings);
  const client = resendClient || createResendClient(validated.apiKey);
  const content = resetEmail({ resetUrl, expiresInMinutes });
  let response;
  console.info('[Mail] Calling Resend API');
  try {
    response = await client.emails.send({
      from: validated.from,
      to: email,
      subject: RESET_SUBJECT,
      html: content.html,
      text: content.text,
    });
  } catch (error) {
    console.info('[Mail] Resend accepted request: NO');
    console.info('[Mail] Resend message ID present: NO');
    logSafeResendError(error);
    const safeError = new Error('Resend password reset email request failed.');
    safeError.statusCode = Number(error?.statusCode ?? error?.status) || undefined;
    throw safeError;
  }
  const accepted = !response?.error && Boolean(response?.data?.id);
  console.info(`[Mail] Resend accepted request: ${accepted ? 'YES' : 'NO'}`);
  console.info(`[Mail] Resend message ID present: ${response?.data?.id ? 'YES' : 'NO'}`);
  if (!accepted) {
    logSafeResendError(response?.error);
    const safeError = new Error('Resend did not accept the password reset email.');
    safeError.statusCode = Number(response?.error?.statusCode ?? response?.error?.status) || undefined;
    throw safeError;
  }
  return { provider: RESEND_PROVIDER, accepted: true, id: response.data.id };
}

function createGmailSmtpTransport(settings = gmailSmtpSettings(), createTransport = nodemailer.createTransport) {
  const validated = validateGmailSmtpSettings(settings);
  return createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: validated.user,
      pass: validated.appPassword,
    },
    tls: { minVersion: 'TLSv1.2' },
  });
}

function safeDiagnosticToken(value, fallback = 'UNKNOWN') {
  return String(value || fallback).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || fallback;
}

function gmailSmtpSafeMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'EAUTH') return 'Authentication failed. Verify the Gmail account and Google App Password.';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED'].includes(code)) {
    return 'Connection to Gmail SMTP failed.';
  }
  if (code === 'EENVELOPE') return 'Gmail SMTP rejected the message envelope.';
  return 'Gmail SMTP request failed.';
}

function smtpResponseCategory(value) {
  const source = String(value?.response || value?.responseCode || '');
  const status = source.match(/\b([245]\d{2})\b/);
  return status ? status[1] : 'UNKNOWN';
}

async function sendWithGmailSmtp(
  { email, resetUrl, expiresInMinutes },
  { settings = gmailSmtpSettings(), transporter } = {}
) {
  const validated = validateGmailSmtpSettings(settings);
  const mailer = transporter || createGmailSmtpTransport(validated);
  const content = resetEmail({ resetUrl, expiresInMinutes });
  let result;
  console.info('[Mail] Gmail SMTP send started');
  try {
    result = await mailer.sendMail({
      from: gmailFromHeader(validated),
      to: email,
      subject: RESET_SUBJECT,
      html: content.html,
      text: content.text,
    });
  } catch (error) {
    const rejectedCount = Array.isArray(error?.rejected) ? error.rejected.length : 0;
    const safeCode = safeDiagnosticToken(error?.code);
    const safeName = safeDiagnosticToken(error?.name, 'Error');
    console.info('[Mail] Gmail SMTP accepted: NO');
    console.info(`[Mail] Gmail SMTP rejected recipients count: ${rejectedCount}`);
    console.info('[Mail] Gmail SMTP message ID present: NO');
    console.info(`[Mail] Gmail SMTP response category: ${smtpResponseCategory(error)}`);
    console.error(`[Mail] Gmail SMTP error code: ${safeCode}`);
    console.error(`[Mail] Gmail SMTP error name: ${safeName}`);
    console.error(`[Mail] Gmail SMTP safe message: ${gmailSmtpSafeMessage(error)}`);
    const safeError = new Error('Gmail SMTP password reset email request failed.');
    safeError.name = safeCode;
    safeError.statusCode = Number(error?.responseCode ?? error?.statusCode ?? error?.status) || undefined;
    throw safeError;
  }
  const accepted = Array.isArray(result?.accepted) && result.accepted.length > 0;
  const acceptedCount = Array.isArray(result?.accepted) ? result.accepted.length : 0;
  const rejectedCount = Array.isArray(result?.rejected) ? result.rejected.length : 0;
  console.info(`[Mail] Gmail SMTP accepted: ${accepted ? 'YES' : 'NO'}`);
  console.info(`[Mail] Gmail SMTP accepted count: ${acceptedCount}`);
  console.info(`[Mail] Gmail SMTP rejected recipients count: ${rejectedCount}`);
  console.info(`[Mail] Gmail SMTP message ID present: ${result?.messageId ? 'YES' : 'NO'}`);
  console.info(`[Mail] Gmail SMTP response category: ${smtpResponseCategory(result)}`);
  if (!accepted) throw new Error('Gmail SMTP did not accept the password reset email.');
  return { provider: GMAIL_SMTP_PROVIDER, accepted: true, messageIdPresent: Boolean(result?.messageId) };
}

function sendWithDevelopmentTransport({ email, resetUrl, expiresInMinutes }) {
  if (config.NODE_ENV !== 'development') {
    throw new Error('The development email transport is disabled outside development.');
  }

  console.info([
    '========================================',
    'SEA-IT-SOLVED PASSWORD RESET',
    `Recipient: ${email}`,
    'Reset URL:',
    resetUrl,
    `Expires: ${expiresInMinutes} minutes`,
    '========================================',
  ].join('\n'));
}

async function sendPasswordResetEmail({ email, resetUrl, expiresInMinutes }) {
  const provider = validateEmailConfiguration();
  console.info(`[Mail] Provider selected: ${provider}`);
  if (provider === MICROSOFT_GRAPH_PROVIDER) {
    return sendWithMicrosoftGraph({ email, resetUrl, expiresInMinutes });
  }
  if (provider === RESEND_PROVIDER) {
    return sendWithResend({ email, resetUrl, expiresInMinutes });
  }
  if (provider === GMAIL_SMTP_PROVIDER) {
    return sendWithGmailSmtp({ email, resetUrl, expiresInMinutes });
  }
  if (provider === DEVELOPMENT_PROVIDER) {
    sendWithDevelopmentTransport({ email, resetUrl, expiresInMinutes });
    return { provider: DEVELOPMENT_PROVIDER };
  }
}

validateEmailConfiguration();

module.exports = {
  sendPasswordResetEmail,
  sendWithDevelopmentTransport,
  sendWithMicrosoftGraph,
  sendWithResend,
  sendWithGmailSmtp,
  createGmailSmtpTransport,
  gmailFromHeader,
  smtpResponseCategory,
  validateEmailConfiguration,
  validateMicrosoftGraphSettings,
  validateResendSettings,
  validateGmailSmtpSettings,
  RESET_SUBJECT,
};
