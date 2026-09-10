import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/public/AuthLayout';
import { Alert, Btn, FormField, Input, LoadingState } from '../components/ui';
import { resetPassword, validatePasswordResetToken } from '../services/passwordResetApi';

function PasswordInput({ id, value, onChange, placeholder, autoComplete, 'aria-describedby': describedBy }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input id={id} type={visible ? 'text' : 'password'} required minLength={8} maxLength={128} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} aria-describedby={describedBy} className="pr-11"/>
    <button type="button" onClick={() => setVisible(current => !current)} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
  </div>;
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [validation, setValidation] = useState(token ? 'checking' : 'invalid');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setValidation('invalid'); return undefined; }
    let active = true;
    setValidation('checking');
    validatePasswordResetToken(token)
      .then(() => { if (active) setValidation('valid'); })
      .catch(error => {
        if (!active) return;
        setValidation(error.response?.status === 400 ? 'invalid' : 'unavailable');
      });
    return () => { active = false; };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPassword(token, form.password);
      setSuccess(true);
    } catch (nextError) {
      if (nextError.response?.status === 400 && /invalid|expired/i.test(nextError.response?.data?.error || '')) setValidation('invalid');
      else setError(nextError.response?.data?.error || 'Unable to update your password right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const content = success ? <div className="auth-success-state mt-7" role="status">
    <CheckCircle2 size={30}/><h2>Password updated</h2><p>Your password has been changed successfully.</p><Link to="/login"><Btn className="w-full">Back to sign in</Btn></Link>
  </div> : validation === 'checking' ? <div className="mt-7"><LoadingState text="Checking reset link…"/></div>
    : validation === 'invalid' ? <div className="auth-success-state mt-7"><Alert type="error">This password reset link is invalid or has expired.</Alert><Link to="/forgot-password"><Btn className="w-full">Request a new reset link</Btn></Link></div>
      : validation === 'unavailable' ? <div className="auth-success-state mt-7"><Alert type="error">Unable to validate this reset link right now. Please try again.</Alert><Btn className="w-full" onClick={() => window.location.reload()}>Try again</Btn></div>
        : <>
          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
          <form onSubmit={submit} className="public-auth-form">
            <FormField label="New password" hint="Use at least 8 characters."><PasswordInput value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} placeholder="Enter a new password" autoComplete="new-password"/></FormField>
            <FormField label="Confirm new password"><PasswordInput value={form.confirm} onChange={event => setForm(current => ({ ...current, confirm: event.target.value }))} placeholder="Re-enter your new password" autoComplete="new-password"/></FormField>
            <Btn type="submit" variant="primary" loading={loading} disabled={loading} className="mt-1 w-full">Update password</Btn>
          </form>
        </>;

  return <AuthLayout
    title="Reset your password"
    subtitle="Choose a new password for your SEA-IT-SOLVED account."
    panelTitle={<span>Secure access<br/>to your<br/>learning<br/>workspace.</span>}
    panelBody="Your sections, lessons, quizzes, and approved academic materials remain unchanged."
    loginExperience
    backTo="/login"
    backLabel="Back to sign in"
  >{content}</AuthLayout>;
}
