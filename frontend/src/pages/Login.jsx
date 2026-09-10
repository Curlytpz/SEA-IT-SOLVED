import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Presentation, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Btn, Input, FormField } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '../utils/authEmail';

const ROLE_OPTIONS = [
  { key: 'student', label: 'Student', description: 'Access lessons', icon: GraduationCap },
  { key: 'instructor', label: 'Instructor', description: 'Manage classes', icon: Presentation },
  { key: 'admin', label: 'Admin', description: 'System access', icon: ShieldCheck },
];

const ROLE_COPY = {
  student: { title: 'Welcome, Future Engineer.', subtitle: 'Sign in as Student' },
  instructor: { title: 'Welcome, Professor.', subtitle: 'Sign in as Instructor' },
  admin: { title: 'Welcome, Administrator.', subtitle: 'Sign in as Admin' },
};

const ROLE_STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const ROLE_CARD_MOTION = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] } },
};

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reducedMotion = useReducedMotion();
  const requestedRole = searchParams.get('role');
  const selectedRole = ROLE_COPY[requestedRole] ? requestedRole : null;
  const selectedCopy = selectedRole ? ROLE_COPY[selectedRole] : null;
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const set = key => event => {
    setForm(current => ({ ...current, [key]: event.target.value }));
    if (error) setError('');
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedRole) return;
    setError('');
    if (selectedRole === 'student' && !isStudentEmail(form.email)) { setError(STUDENT_EMAIL_HINT); return; }
    try {
      const user = await login(form.email, form.password, selectedRole.toUpperCase());
      if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'INSTRUCTOR') navigate('/instructor', { replace: true });
      else navigate('/student', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  const transition = reducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] };

  return <AuthLayout
    title={selectedCopy?.title || 'Choose how you want to sign in'}
    subtitle={selectedCopy?.subtitle || 'Select your account type to continue.'}
    panelTitle={<span>Engineering meets<br/>technology.<br/>Mathematics<br/>made easier.</span>}
    panelBody="Capture, understand, and learn mathematics through one AI-assisted smart classroom system."
    loginExperience
    backTo={selectedRole ? '/login' : '/'}
    backLabel={selectedRole ? 'Choose another role' : 'Home'}
  >
    <AnimatePresence mode="wait" initial={false}>
      {!selectedRole ? (
        <motion.div
          key="role-picker"
          initial={reducedMotion ? false : 'hidden'}
          animate="visible"
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          variants={reducedMotion ? undefined : ROLE_STAGGER}
          transition={transition}
          className="grid gap-3 mt-7 sm:grid-cols-3"
          aria-label="Choose sign-in role"
        >
          {ROLE_OPTIONS.map(({ key, label, description, icon: Icon }) => (
            <motion.div key={key} variants={reducedMotion ? undefined : ROLE_CARD_MOTION}>
              <Link
                to={`/login?role=${key}`}
                className="flex flex-col items-start justify-between min-w-0 p-4 text-left border auth-role-card group min-h-28 rounded-2xl border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="grid w-10 h-10 rounded-lg auth-role-icon place-items-center bg-primary-subtle text-primary-subtle-foreground">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 mt-4">
                  <strong className="block text-sm font-bold truncate text-foreground">{label}</strong>
                  <span className="block mt-1 text-xs text-muted-foreground">{description}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          key={`login-${selectedRole}`}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={transition}
        >
          {selectedRole === 'student' && location.state?.studentRegistrationSuccess && (
            <Alert type="success">Account created successfully. Please sign in.</Alert>
          )}
          <form onSubmit={handleSubmit} className="public-auth-form">
            <FormField label="Email address" hint={selectedRole === 'student' ? STUDENT_EMAIL_HINT : undefined}><Input type="email" required placeholder={selectedRole === 'student' ? 'you@student.hau.edu.ph' : 'you@hau.edu.ph'} value={form.email} onChange={set('email')} autoComplete="email"/></FormField>
            <FormField label="Password" action={selectedRole !== 'admin' ? <Link to={`/forgot-password?role=${selectedRole}`} className="text-xs font-semibold text-primary hover:text-primary-hover hover:underline">Forgot password?</Link> : null}><Input type="password" required placeholder="Enter your password" value={form.password} onChange={set('password')} autoComplete="current-password"/></FormField>
            {error && <Alert type="error" className="-mt-1">{error}</Alert>}
            <Btn type="submit" variant="primary" disabled={loading} aria-busy={loading || undefined} className="w-full mt-1">{loading ? 'Signing in...' : 'Sign In'}</Btn>
          </form>

          {selectedRole === 'student' && <>
            <div className="auth-choice-divider"><span>New student?</span></div>
            <div className="auth-registration-actions"><Link to="/register/student" className="auth-secondary-action">Create Student Account</Link></div>
          </>}
          {selectedRole === 'instructor' && <>
            <div className="auth-choice-divider"><span>New instructor?</span></div>
            <div className="auth-registration-actions"><Link to="/register/instructor" className="auth-secondary-action">Register as Instructor</Link></div>
          </>}
          {selectedRole === 'admin' && <p className="mt-5 text-sm leading-6 text-center text-muted-foreground">Administrator accounts are managed by the system.</p>}
        </motion.div>
      )}
    </AnimatePresence>
  </AuthLayout>;
}
