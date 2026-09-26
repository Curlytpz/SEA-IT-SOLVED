import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Alert, Btn, FormField, Input } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const attempted = useRef(false);
  const [status, setStatus] = useState(token ? 'working' : 'invalid');
  const [message, setMessage] = useState(token ? 'Verifying your institutional email…' : 'This verification link is invalid.');
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    api.post('/auth/verify-email', { token })
      .then(response => {
        setStatus('success');
        setVerifiedRole(response.data?.data?.role || null);
        setMessage(response.data?.data?.message || 'Your institutional email has been verified.');
      })
      .catch(error => {
        setStatus('invalid');
        setMessage(error.response?.data?.error || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  async function resend(event) {
    event.preventDefault();
    setResending(true);
    try {
      const response = await api.post('/auth/verify-email/resend', { email });
      setMessage(response.data?.data?.message || 'If the account is waiting for verification, a new link has been sent.');
      setStatus('resent');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to request another verification email. Try again later.');
      setStatus('invalid');
    } finally {
      setResending(false);
    }
  }

  const loginRole = verifiedRole === 'INSTRUCTOR' ? 'instructor' : verifiedRole === 'STUDENT' ? 'student' : '';
  const loginPath = loginRole ? '/login?role=' + loginRole : '/login';

  return <AuthLayout backTo={loginPath} backLabel="Back to Sign In" title="Verify Institutional Email" subtitle="Confirm ownership of your institutional email before account access is granted." panelTitle="Secure account access" panelBody="Verification protects student and instructor accounts from impersonation.">
    <Alert type={status === 'success' || status === 'resent' ? 'success' : status === 'invalid' ? 'error' : 'info'}>{message}</Alert>
    {status === 'success' ? <Link to={loginPath} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover">Continue to Sign In</Link> : <form onSubmit={resend} className="grid gap-4">
      <FormField label="Institutional Email"><Input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></FormField>
      <Btn type="submit" variant="primary" loading={resending} className="w-full">Resend Verification Email</Btn>
    </form>}
  </AuthLayout>;
}
