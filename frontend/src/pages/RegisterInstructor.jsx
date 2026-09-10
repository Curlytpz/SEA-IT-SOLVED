import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Btn, Alert, Input, FormField } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';

export default function RegisterInstructor() {
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', confirm:'' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault(); setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register/instructor', { firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password });
      setSuccess(true);
    } catch (err) { setError(err.response?.data?.error || 'Registration failed.'); }
    finally { setLoading(false); }
  }

  if (success) return <AuthLayout backTo="/login?role=instructor" backLabel="Back to Sign In" title="Registration submitted" subtitle="Your instructor account is awaiting administrator approval." panelTitle="Keep academic judgment at the center of AI-assisted learning." panelBody="Review recognized lesson context, edit mathematical content, and approve what students receive.">
    <div className="auth-success-state"><CheckCircle2 size={30}/><p>Access becomes available after an administrator approves your account. You can return to sign in and check your status.</p><Link to="/login?role=instructor"><Btn className="w-full">Back to Sign In</Btn></Link></div>
  </AuthLayout>;

  return <AuthLayout backTo="/login?role=instructor" backLabel="Back to Sign In" title="Create Instructor Account" subtitle="Create your account. Access becomes available after administrator approval." panelTitle="A structured workspace for every mathematics lesson." panelBody="Capture lesson evidence, verify the academic context, and prepare approved materials and quizzes for your sections.">
    <Alert type="info">Instructor accounts require administrator approval before access is granted.</Alert>
    {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
    <form onSubmit={handleSubmit} className="public-auth-form">
      <div className="auth-name-grid"><FormField label="First name"><Input required value={form.firstName} onChange={set('firstName')} placeholder="Maria" autoComplete="given-name"/></FormField><FormField label="Last name"><Input required value={form.lastName} onChange={set('lastName')} placeholder="Santos" autoComplete="family-name"/></FormField></div>
      <FormField label="Faculty Email"><Input type="email" required value={form.email} onChange={set('email')} placeholder="santos@hau.edu.ph" autoComplete="email"/></FormField>
      <FormField label="Password"><Input type="password" required value={form.password} onChange={set('password')} placeholder="Minimum 8 characters" autoComplete="new-password"/></FormField>
      <FormField label="Confirm Password"><Input type="password" required value={form.confirm} onChange={set('confirm')} placeholder="Re-enter password" autoComplete="new-password"/></FormField>
      <Btn type="submit" variant="primary" loading={loading} className="mt-1 w-full">Submit Registration</Btn>
    </form>
    <p className="auth-signin-copy">Already approved? <Link to="/login?role=instructor">Sign In</Link></p>
  </AuthLayout>;
}
