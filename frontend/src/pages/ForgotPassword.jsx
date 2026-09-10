import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/public/AuthLayout';
import { Alert, Btn, FormField, Input } from '../components/ui';
import { requestPasswordReset } from '../services/passwordResetApi';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '../utils/authEmail';

const GENERIC_SUCCESS = 'If an account exists for that email, password reset instructions have been sent.';

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const requestedRole = searchParams.get('role');
  const role = requestedRole === 'instructor' ? 'instructor' : 'student';
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (role === 'student' && !isStudentEmail(email)) { setError(STUDENT_EMAIL_HINT); return; }
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(email, role.toUpperCase());
      setSuccess(true);
    } catch {
      setError('Unable to send reset instructions right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout
    title="Forgot your password?"
    subtitle="Enter your registered HAU Microsoft 365 email and we’ll send you instructions to reset your password."
    panelTitle={<span>Secure access<br/>to your<br/>learning<br/>workspace.</span>}
    panelBody="Recover access without changing your classes, approved lesson materials, quizzes, or academic records."
    loginExperience
    backTo={`/login?role=${role}`}
    backLabel="Back to sign in"
  >
    {success ? <div className="auth-success-state mt-7" role="status">
      <CheckCircle2 size={30}/>
      <p>{GENERIC_SUCCESS}</p>
      <Link to="/login"><Btn className="w-full">Back to sign in</Btn></Link>
    </div> : <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      <form onSubmit={submit} className="public-auth-form">
        <FormField label={role === 'student' ? 'HAU Student Email' : 'Faculty Email'} hint={role === 'student' ? STUDENT_EMAIL_HINT : undefined}><Input type="email" required placeholder={role === 'student' ? 'you@student.hau.edu.ph' : 'you@hau.edu.ph'} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email"/></FormField>
        <Btn type="submit" variant="primary" loading={loading} disabled={loading} className="mt-1 w-full">{loading ? 'Sending...' : 'Send reset link'}</Btn>
      </form>
      <p className="auth-signin-copy"><Link to={`/login?role=${role}`}>← Back to sign in</Link></p>
    </>}
  </AuthLayout>;
}
