import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { Alert, Btn, FormField, Input } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';
import { normalizeVerificationCode } from '../utils/emailVerification';

export default function VerifyEmail() {
  const location = useLocation();
  const prefilledEmail = typeof location.state?.email === 'string' ? location.state.email : '';
  const [email, setEmail] = useState(prefilledEmail);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(event) {
    event.preventDefault();
    setVerifying(true);
    setMessage('');
    try {
      const response = await api.post('/auth/verify-email', { email, code });
      setStatus('success');
      setVerifiedRole(response.data?.data?.role || null);
      setMessage(response.data?.data?.message || 'Your institutional email has been verified.');
    } catch (error) {
      setStatus('error');
      setMessage(error.response?.data?.error || 'The verification code is invalid or has expired.');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    setMessage('');
    try {
      const response = await api.post('/auth/verify-email/resend', { email });
      setCode('');
      setStatus('resent');
      setMessage(response.data?.data?.message || 'If the account is waiting for verification, a new code has been sent.');
    } catch (error) {
      setStatus('error');
      setMessage(error.response?.data?.error || 'Unable to request another verification code. Try again later.');
    } finally {
      setResending(false);
    }
  }

  const loginRole = verifiedRole === 'INSTRUCTOR' ? 'instructor' : verifiedRole === 'STUDENT' ? 'student' : '';
  const loginPath = loginRole ? '/login?role=' + loginRole : '/login';

  return <AuthLayout backTo={loginPath} backLabel="Back to Sign In" title="Verify your email" subtitle="Enter the 8-digit code sent to your institutional email." panelTitle="Secure account access" panelBody="Verification protects student and instructor accounts from impersonation.">
    {message && <Alert type={status === 'success' || status === 'resent' ? 'success' : 'error'}>{message}</Alert>}
    {status === 'success' ? <Link to={loginPath} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover">Continue to Sign In</Link> : <form onSubmit={verify} className="grid gap-4">
      <FormField label="Email address"><Input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></FormField>
      <FormField label="Verification code"><Input type="text" required value={code} onChange={event => setCode(normalizeVerificationCode(event.target.value))} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} autoComplete="one-time-code" placeholder="12345678" /></FormField>
      <Btn type="submit" variant="primary" loading={verifying} disabled={code.length !== 8} className="w-full">Verify Email</Btn>
      <button type="button" onClick={resend} disabled={!email || resending} className="text-sm font-semibold text-primary hover:text-primary-hover hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
        {resending ? 'Sending...' : 'Resend code'}
      </button>
    </form>}
  </AuthLayout>;
}
