import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Btn, Alert, Input, FormField } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '../utils/authEmail';

export default function RegisterStudent() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', studentNumber:'', password:'', confirm:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault(); setError('');
    if (!isStudentEmail(form.email)) { setError(STUDENT_EMAIL_HINT); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register/student', { firstName: form.firstName, lastName: form.lastName, email: form.email, studentNumber: form.studentNumber, password: form.password });
      navigate('/login?role=student', {
        replace: true,
        state: { studentRegistrationSuccess: true },
      });
    } catch (err) { setError(err.response?.data?.error || 'Registration failed.'); }
    finally { setLoading(false); }
  }

  return <AuthLayout backTo="/login?role=student" backLabel="Back to Sign In" title="Create Student Account" subtitle="Join your classes and access instructor-approved lessons, quizzes, and results." panelTitle="Your mathematics lessons, organized for learning." panelBody="Study clean lesson materials, complete classroom quizzes, and return to your results from any modern browser.">
    {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
    <form onSubmit={handleSubmit} className="public-auth-form">
      <div className="auth-name-grid"><FormField label="First name"><Input required value={form.firstName} onChange={set('firstName')} placeholder="Juan" autoComplete="given-name"/></FormField><FormField label="Last name"><Input required value={form.lastName} onChange={set('lastName')} placeholder="dela Cruz" autoComplete="family-name"/></FormField></div>
      <FormField label="HAU Student Email" hint={STUDENT_EMAIL_HINT}><Input type="email" required value={form.email} onChange={set('email')} placeholder="20210001@student.hau.edu.ph" autoComplete="email"/></FormField>
      <FormField label="Student Number"><Input required value={form.studentNumber} onChange={set('studentNumber')} placeholder="20123456"/></FormField>
      <FormField label="Password"><Input type="password" required value={form.password} onChange={set('password')} placeholder="Minimum 8 characters" autoComplete="new-password"/></FormField>
      <FormField label="Confirm Password"><Input type="password" required value={form.confirm} onChange={set('confirm')} placeholder="Re-enter password" autoComplete="new-password"/></FormField>
      <Btn type="submit" variant="primary" loading={loading} className="w-full mt-1">Create Account</Btn>
    </form>  
    <p className="auth-signin-copy">Already have an account? <Link to="/login?role=student">Sign In</Link></p>
  </AuthLayout>;
}
