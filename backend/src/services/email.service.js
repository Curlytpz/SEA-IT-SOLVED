const { ConfidentialClientApplication } = require('@azure/msal-node');
const crypto = require('crypto');
const { google } = require('googleapis');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const config = require('../config/env');

const RESET_SUBJECT = 'Reset your SEA-IT-SOLVED password';
const VERIFICATION_SUBJECT = 'Verify your SEA-IT-SOLVED email';
const INSTRUCTOR_VERIFICATION_SUBJECT = VERIFICATION_SUBJECT;
const DEVELOPMENT_PROVIDER = 'development';
const MICROSOFT_GRAPH_PROVIDER = 'microsoft_graph';
const RESEND_PROVIDER = 'resend';
const GMAIL_SMTP_PROVIDER = 'gmail_smtp';
const GMAIL_API_PROVIDER = 'gmail_api';
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

function gmailApiSettings() {
  return {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN,
    user: config.GMAIL_API_USER,
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

function validateGmailApiSettings(settings = gmailApiSettings()) {
  const required = [
    ['GOOGLE_CLIENT_ID', settings.clientId],
    ['GOOGLE_CLIENT_SECRET', settings.clientSecret],
    ['GOOGLE_REFRESH_TOKEN', settings.refreshToken],
    ['GMAIL_API_USER', settings.user],
    ['MAIL_FROM', settings.from],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) throw new Error(`MAIL_PROVIDER=gmail_api requires: ${missing.join(', ')}.`);
  return settings;
}

function validateEmailConfiguration(provider = resolveMailProvider()) {
  if (provider === MICROSOFT_GRAPH_PROVIDER) validateMicrosoftGraphSettings();
  else if (provider === RESEND_PROVIDER) validateResendSettings();
  else if (provider === GMAIL_SMTP_PROVIDER) validateGmailSmtpSettings();
  else if (provider === GMAIL_API_PROVIDER) validateGmailApiSettings();
  else if (provider === DEVELOPMENT_PROVIDER && config.NODE_ENV !== 'development') {
    throw new Error('MAIL_PROVIDER=development is only allowed when NODE_ENV=development.');
  } else if (![DEVELOPMENT_PROVIDER, MICROSOFT_GRAPH_PROVIDER, RESEND_PROVIDER, GMAIL_SMTP_PROVIDER, GMAIL_API_PROVIDER].includes(provider)) {
    throw new Error('MAIL_PROVIDER must be development, resend, gmail_smtp, gmail_api, or microsoft_graph.');
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verificationEmail({ verificationCode, expiresInMinutes, role = 'STUDENT', accountStatus }) {
  if (!/^\d{8}$/.test(String(verificationCode || ''))) {
    throw new Error('A valid email verification code is required.');
  }
  const instructor = role === 'INSTRUCTOR';
  const instructorPending = instructor && accountStatus !== 'ACTIVE';
  const expiry = Number(expiresInMinutes) === 60 ? '1 hour' : `${Number(expiresInMinutes)} minutes`;
  const text = [
    'SEA-IT-SOLVED', '',
    'Your email verification code is:', '',
    verificationCode, '',
    'Return to SEA-IT-SOLVED and enter this code to verify your email.', '',
    `This code expires in ${expiry}.`, '',
    'If you did not create this account, you can ignore this email.',
    ...(instructorPending ? ['', 'After verification, your instructor account will remain pending until administrator approval.'] : []),
  ].join('\n');
  const safeVerificationCode = escapeHtml(verificationCode);
  const safeExpiry = escapeHtml(expiry);
  const html = [
    '<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f8;color:#111827;font-family:Arial,Helvetica,sans-serif;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7f8;"><tr><td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;"><tr><td style="padding:40px 36px;text-align:center;">',
    '<h1 style="margin:0;color:#111827;font-size:28px;line-height:1.25;font-weight:700;">SEA-IT-SOLVED</h1>',
    '<p style="margin:6px 0 30px;color:#6b7280;font-size:13px;line-height:1.5;">Automated Lecture Capturing &amp; Documentation System</p>',
    '<h2 style="margin:0 0 14px;color:#111827;font-size:23px;line-height:1.3;font-weight:700;">Verify your email</h2>',
    '<p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.65;">Enter the verification code below to complete your<br>SEA-IT-SOLVED account verification.</p>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">',
    `<div style="display:inline-block;min-width:250px;padding:18px 22px;background:#e8f7f5;border:1px solid #0f9d94;border-radius:10px;color:#0f766e;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:8px;text-align:center;">${safeVerificationCode}</div>`,
    '</td></tr></table>',
    '<p style="margin:24px 0 22px;color:#111827;font-size:14px;line-height:1.6;">Return to SEA-IT-SOLVED and enter this code to verify your email.</p>',
    `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;line-height:1.6;">This verification code expires in ${safeExpiry}.</p>`,
    '<p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">If you did not create a SEA-IT-SOLVED account, you can safely ignore this email.</p>',
    ...(instructorPending ? ['<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">After verification, your instructor account will remain pending until administrator approval.</p>'] : []),
    '</td></tr><tr><td style="padding:20px 24px;border-top:1px solid #e5e7eb;text-align:center;">',
    '<p style="margin:0;color:#111827;font-size:13px;font-weight:700;">SEA-IT-SOLVED</p>',
    '<p style="margin:4px 0 0;color:#6b7280;font-size:11px;line-height:1.5;">Automated Lecture Capturing &amp; Documentation System</p>',
    '</td></tr></table>',
    '</td></tr></table></body></html>',
  ].join('');
  return { text, html };
}

function messageContent(payload) {
  if (payload.verificationCode) {
    return {
      subject: payload.role === 'INSTRUCTOR' ? INSTRUCTOR_VERIFICATION_SUBJECT : VERIFICATION_SUBJECT,
      content: verificationEmail(payload),
    };
  }
  return { subject: RESET_SUBJECT, content: resetEmail(payload) };
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
  payload,
  { settings = microsoftGraphSettings(), confidentialClient, fetchImpl = fetch } = {}
) {
  const { email } = payload;
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

  const { subject, content } = messageContent(payload);
  let response;
  try {
    response = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(validated.senderEmail)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authentication.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
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
  payload,
  { settings = resendSettings(), resendClient } = {}
) {
  const { email } = payload;
  const validated = validateResendSettings(settings);
  const client = resendClient || createResendClient(validated.apiKey);
  const { subject, content } = messageContent(payload);
  let response;
  console.info('[Mail] Calling Resend API');
  try {
    response = await client.emails.send({
      from: validated.from,
      to: email,
      subject,
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
  payload,
  { settings = gmailSmtpSettings(), transporter } = {}
) {
  const { email } = payload;
  const validated = validateGmailSmtpSettings(settings);
  const mailer = transporter || createGmailSmtpTransport(validated);
  const { subject, content } = messageContent(payload);
  let result;
  console.info('[Mail] Gmail SMTP send started');
  try {
    result = await mailer.sendMail({
      from: gmailFromHeader(validated),
      to: email,
      subject,
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

function sanitizeMailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeMailHeader(value) {
  const safe = sanitizeMailHeader(value);
  return /^[\x20-\x7e]*$/.test(safe)
    ? safe
    : `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`;
}

function encodeMimeBody(value) {
  const normalized = String(value || '').replace(/\r?\n/g, '\r\n');
  return Buffer.from(normalized, 'utf8')
    .toString('base64')
    .match(/.{1,76}/g)
    ?.join('\r\n') || '';
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildGmailApiRawMessage({ from, to, subject, text, html }) {
  const boundary = `sea-it-solved-${crypto.randomBytes(16).toString('hex')}`;
  const message = [
    `From: ${sanitizeMailHeader(from)}`,
    `To: ${sanitizeMailHeader(to)}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBody(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return encodeBase64Url(message);
}

function sevenBitMimeBody(value) {
  const normalized = String(value || '').replace(/\r?\n/g, '\r\n');
  if (!/^[\x00-\x7f]*$/.test(normalized)) {
    throw new Error('Gmail API verification MIME parts must contain 7-bit content.');
  }
  return normalized;
}

function validateGmailApiVerificationMessage(message, { verificationCode }) {
  if (message.replace(/\r\n/g, '').includes('\n') || message.replace(/\r\n/g, '').includes('\r')) {
    throw new Error('Gmail API verification message must use CRLF line endings.');
  }
  const separator = '\r\n\r\n';
  const headerEnd = message.indexOf(separator);
  if (headerEnd <= 0) throw new Error('Gmail API verification message requires one header section.');
  const headers = message.slice(0, headerEnd).split('\r\n');
  for (const name of ['From', 'To', 'Subject']) {
    if (headers.filter(line => line.startsWith(`${name}:`)).length !== 1) {
      throw new Error(`Gmail API verification message requires exactly one ${name} header.`);
    }
  }
  if (!headers.includes('MIME-Version: 1.0')
      || !headers.some(line => /^Content-Type: multipart\/alternative; boundary="[^"]+"$/.test(line))) {
    throw new Error('Gmail API verification message requires multipart/alternative MIME headers.');
  }
  if (!message.includes(verificationCode)) {
    throw new Error('Gmail API verification message is missing required content.');
  }
  if (/href\s*=|https?:\/\/|\/verify-email/i.test(message)) {
    throw new Error('Gmail API verification message must not contain links.');
  }
  if (!/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit/i.test(message)
      || !/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit/i.test(message)
      || /Content-Transfer-Encoding:\s*(?:base64|quoted-printable)/i.test(message)) {
    throw new Error('Gmail API verification message requires readable plain-text and HTML alternatives.');
  }
}

function buildGmailApiVerificationRawMessage({
  from, to, subject, text, html, verificationCode,
}) {
  const boundary = `sea-it-solved-verification-${crypto.randomBytes(16).toString('hex')}`;
  const message = [
    `From: ${sanitizeMailHeader(from)}`,
    `To: ${sanitizeMailHeader(to)}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    sevenBitMimeBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    sevenBitMimeBody(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  validateGmailApiVerificationMessage(message, { verificationCode });
  return encodeBase64Url(message);
}

function recipientDomain(email) {
  const domain = String(email || '').trim().toLowerCase().split('@').pop();
  return /^[a-z0-9.-]+$/.test(domain || '') ? domain : 'UNKNOWN';
}

function logVerificationSendResult(email, accepted, messageIdPresent) {
  console.info(`[Mail] Provider accepted message: ${accepted ? 'YES' : 'NO'}`);
  console.info(`[Mail] Message ID present: ${messageIdPresent ? 'YES' : 'NO'}`);
  console.info(`[Mail] Recipient domain: ${recipientDomain(email)}`);
}

function createGmailApiClient(settings = gmailApiSettings(), googleApi = google) {
  const validated = validateGmailApiSettings(settings);
  const auth = new googleApi.auth.OAuth2(validated.clientId, validated.clientSecret);
  auth.setCredentials({ refresh_token: validated.refreshToken });
  return googleApi.gmail({ version: 'v1', auth });
}

async function sendWithGmailApi(
  payload,
  { settings = gmailApiSettings(), gmailClient, googleApi = google } = {}
) {
  const validated = validateGmailApiSettings(settings);
  const client = gmailClient || createGmailApiClient(validated, googleApi);
  const { subject, content } = messageContent(payload);
  const verification = Boolean(payload.verificationCode);
  const raw = verification
    ? buildGmailApiVerificationRawMessage({
      from: gmailFromHeader(validated),
      to: payload.email,
      subject,
      text: content.text,
      html: content.html,
      verificationCode: payload.verificationCode,
    })
    : buildGmailApiRawMessage({
      from: gmailFromHeader(validated),
      to: payload.email,
      subject,
      text: content.text,
      html: content.html,
    });

  let response;
  console.info(verification ? '[Mail] Verification send started' : '[Mail] Gmail API send started');
  try {
    response = await client.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  } catch (error) {
    const rawCode = String(error?.code || '').toUpperCase();
    const safeCode = /^\d{3}$/.test(rawCode)
      ? rawCode
      : ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(rawCode) ? rawCode : 'UNKNOWN';
    const safeName = ['Error', 'GaxiosError'].includes(String(error?.name)) ? String(error.name) : 'Error';
    const status = Number(error?.response?.status ?? error?.statusCode ?? error?.status);
    if (verification) {
      logVerificationSendResult(payload.email, false, false);
    } else {
      console.info('[Mail] Gmail API accepted: NO');
      console.info('[Mail] Gmail API message ID present: NO');
      console.error(`[Mail] Gmail API error code: ${safeCode}`);
      console.error(`[Mail] Gmail API error name: ${safeName}`);
      console.error(`[Mail] Gmail API error status: ${Number.isInteger(status) ? status : 'UNKNOWN'}`);
    }
    const safeError = new Error('Gmail API email request failed.');
    safeError.name = 'GmailApiError';
    safeError.statusCode = Number.isInteger(status) ? status : undefined;
    throw safeError;
  }

  const accepted = Boolean(response?.data?.id);
  if (verification) logVerificationSendResult(payload.email, accepted, accepted);
  else {
    console.info(`[Mail] Gmail API accepted: ${accepted ? 'YES' : 'NO'}`);
    console.info(`[Mail] Gmail API message ID present: ${accepted ? 'YES' : 'NO'}`);
  }
  if (!accepted) throw new Error('Gmail API did not accept the email.');
  return { provider: GMAIL_API_PROVIDER, accepted: true, messageIdPresent: true };
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

async function sendPasswordResetEmail({ email, resetUrl, expiresInMinutes }, options = {}) {
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
  if (provider === GMAIL_API_PROVIDER) {
    return sendWithGmailApi({ email, resetUrl, expiresInMinutes }, options);
  }
  if (provider === DEVELOPMENT_PROVIDER) {
    sendWithDevelopmentTransport({ email, resetUrl, expiresInMinutes });
    return { provider: DEVELOPMENT_PROVIDER };
  }
}

async function sendStudentVerificationEmail({ email, verificationCode, expiresInMinutes, role = 'STUDENT', accountStatus }, options = {}) {
  const provider = validateEmailConfiguration();
  if (provider === DEVELOPMENT_PROVIDER) {
    // Verification codes establish account ownership and must never be written to logs.
    throw new Error('Email verification requires a configured email provider.');
  }
  const payload = { email, verificationCode, expiresInMinutes, role, accountStatus };
  if (provider === MICROSOFT_GRAPH_PROVIDER) return sendWithMicrosoftGraph(payload);
  if (provider === RESEND_PROVIDER) return sendWithResend(payload);
  if (provider === GMAIL_SMTP_PROVIDER) return sendWithGmailSmtp(payload);
  if (provider === GMAIL_API_PROVIDER) return sendWithGmailApi(payload, options);
}

validateEmailConfiguration();

module.exports = {
  sendPasswordResetEmail,
  sendStudentVerificationEmail,
  sendWithDevelopmentTransport,
  sendWithMicrosoftGraph,
  sendWithResend,
  sendWithGmailSmtp,
  sendWithGmailApi,
  createGmailSmtpTransport,
  createGmailApiClient,
  buildGmailApiRawMessage,
  buildGmailApiVerificationRawMessage,
  validateGmailApiVerificationMessage,
  gmailFromHeader,
  smtpResponseCategory,
  validateEmailConfiguration,
  validateMicrosoftGraphSettings,
  validateResendSettings,
  validateGmailSmtpSettings,
  validateGmailApiSettings,
  RESET_SUBJECT,
  VERIFICATION_SUBJECT,
  INSTRUCTOR_VERIFICATION_SUBJECT,
};
