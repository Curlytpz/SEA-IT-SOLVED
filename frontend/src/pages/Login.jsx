import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Presentation, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Btn, Input, FormField } from '../components/ui';
import AuthLayout from '../components/public/AuthLayout';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '../utils/authEmail';
import { INSTRUCTOR_ACCESS_NOTICE_KEY, INSTRUCTOR_ACCESS_NOTICES, isInstructorAccessCode } from '../utils/instructorAccess';
import { authChoiceDividerClassName, authFormClassName, authRegistrationActionsClassName, authSecondaryActionClassName } from '../components/public/authStyles';

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
  const [approvalCode, setApprovalCode] = useState(() => {
    const code = sessionStorage.getItem(INSTRUCTOR_ACCESS_NOTICE_KEY);
    return isInstructorAccessCode(code) ? code : null;
  });
  useEffect(() => {
    sessionStorage.removeItem(INSTRUCTOR_ACCESS_NOTICE_KEY);
  }, []);
  useEffect(() => {
    if (isInstructorAccessCode(location.state?.instructorAccessCode)) {
      setApprovalCode(location.state.instructorAccessCode);
    }
  }, [location.state?.instructorAccessCode]);
  const set = key => event => {
    setForm(current => ({ ...current, [key]: event.target.value }));
    if (error) setError('');
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedRole) return;
    setError('');
    setApprovalCode(null);
    if (selectedRole === 'student' && !isStudentEmail(form.email)) { setError(STUDENT_EMAIL_HINT); return; }
    try {
      const user = await login(form.email, form.password, selectedRole.toUpperCase());
      if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'INSTRUCTOR') navigate('/instructor', { replace: true });
      else navigate('/student', { replace: true });
    } catch (err) {
      if (isInstructorAccessCode(err.code)) setApprovalCode(err.code);
      else setError(err.message);
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
                className="group flex h-full min-h-28 min-w-0 flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(.16,1,.3,1)] active:translate-y-0 active:scale-[.99] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary-subtle/70 hover:shadow-[0_10px_28px_-22px_hsl(var(--primary)/.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none dark:hover:border-primary/70 dark:hover:bg-primary/10"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground transition-colors duration-200">
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
            <Alert type="success">Account created. Check your institutional email and verify it before signing in.</Alert>
          )}
          {selectedRole === 'instructor' && approvalCode && (
            <Alert type={INSTRUCTOR_ACCESS_NOTICES[approvalCode].type} label="Instructor account" title={INSTRUCTOR_ACCESS_NOTICES[approvalCode].title}>
              {INSTRUCTOR_ACCESS_NOTICES[approvalCode].message}
            </Alert>
          )}
          <form onSubmit={handleSubmit} className={authFormClassName}>
            <FormField label="Email address" hint={selectedRole === 'student' ? STUDENT_EMAIL_HINT : undefined}><Input type="email" required placeholder={selectedRole === 'student' ? 'you@student.hau.edu.ph' : 'you@hau.edu.ph'} value={form.email} onChange={set('email')} autoComplete="email"/></FormField>
            <FormField label="Password" action={selectedRole !== 'admin' ? <Link to={`/forgot-password?role=${selectedRole}`} className="text-xs font-semibold text-primary hover:text-primary-hover hover:underline">Forgot password?</Link> : null}><Input type="password" required placeholder="Enter your password" value={form.password} onChange={set('password')} autoComplete="current-password"/></FormField>
            {error && <Alert type="error" className="-mt-1">{error}</Alert>}
            <Btn type="submit" variant="primary" disabled={loading} aria-busy={loading || undefined} className="w-full mt-1">{loading ? 'Signing in...' : 'Sign In'}</Btn>
          </form>

          {selectedRole === 'student' && <>
            <div className={authChoiceDividerClassName}><span>New student?</span></div>
            <div className={authRegistrationActionsClassName}><Link to="/register/student" className={authSecondaryActionClassName}>Create Student Account</Link></div>
          </>}
          {selectedRole === 'instructor' && <>
            <div className={authChoiceDividerClassName}><span>New instructor?</span></div>
            <div className={authRegistrationActionsClassName}><Link to="/register/instructor" className={authSecondaryActionClassName}>Register as Instructor</Link></div>
          </>}
          {selectedRole === 'admin' && <p className="mt-5 text-sm leading-6 text-center text-muted-foreground">Administrator accounts are managed by the system.</p>}
        </motion.div>
      )}
    </AnimatePresence>
  </AuthLayout>;
}
