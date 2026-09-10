import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { PageTransition } from './components/PageTransition';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Landing from './pages/Landing';

const Login = lazy(() => import('./pages/Login'));
const RegisterStudent = lazy(() => import('./pages/RegisterStudent'));
const RegisterInstructor = lazy(() => import('./pages/RegisterInstructor'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const InstructorRequests = lazy(() => import('./pages/admin/InstructorRequests'));
const AllUsers = lazy(() => import('./pages/admin/AllUsers'));
const SystemEvaluation = lazy(() => import('./pages/admin/SystemEvaluation'));
const InstructorDashboard = lazy(() => import('./pages/instructor/InstructorDashboard'));
const InstructorSections = lazy(() => import('./pages/instructor/InstructorSections'));
const InstructorSectionDetail = lazy(() => import('./pages/instructor/InstructorSectionDetail'));
const LessonActiveView = lazy(() => import('./pages/instructor/LessonActiveView'));
const InstructorSettings = lazy(() => import('./pages/instructor/InstructorSettings'));
const LessonRecognitionProcessing = lazy(() => import('./pages/instructor/LessonRecognitionProcessing'));
const LessonContextReview = lazy(() => import('./pages/instructor/LessonContextReview'));
const InstructorQuizAttempts = lazy(() => import('./pages/instructor/InstructorQuizAttempts'));
const InstructorQuizAnalytics = lazy(() => import('./pages/instructor/InstructorQuizAnalytics'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentJoinSection = lazy(() => import('./pages/student/StudentJoinSection'));
const StudentClasses = lazy(() => import('./pages/student/StudentClasses'));
const StudentLesson = lazy(() => import('./pages/student/StudentLesson'));
const StudentQuizAttempt = lazy(() => import('./pages/student/StudentQuizAttempt'));
const StudentQuizHistory = lazy(() => import('./pages/student/StudentQuizHistory'));

function TokenValidator({ children }) {
  const { refreshUser } = useAuth();
  useEffect(() => { refreshUser(); }, [refreshUser]);
  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (!user) return children;
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (user.role === 'INSTRUCTOR') return <Navigate to="/instructor" replace />;
  return <Navigate to="/student" replace />;
}

function RouteLoadingFallback() {
  return <main className="min-h-screen bg-background px-6 py-12 text-foreground" aria-busy="true" aria-label="Loading page">
    <div className="mx-auto grid w-full max-w-4xl gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="h-3 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" aria-hidden="true" />
      <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden="true" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-subtle motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading page…</p>
    </div>
  </main>;
}

function AppRoutes() {
  return <TokenValidator>
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<PublicRoute><PageTransition><Landing /></PageTransition></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><PageTransition><Login /></PageTransition></PublicRoute>} />
        <Route path="/register/student" element={<PublicRoute><PageTransition><RegisterStudent /></PageTransition></PublicRoute>} />
        <Route path="/register/instructor" element={<PublicRoute><PageTransition><RegisterInstructor /></PageTransition></PublicRoute>} />
        <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
        <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />

        <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/instructor-requests" element={<ProtectedRoute roles={['ADMIN']}><InstructorRequests /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><AllUsers /></ProtectedRoute>} />
        <Route path="/admin/system-evaluation" element={<ProtectedRoute roles={['ADMIN']}><SystemEvaluation /></ProtectedRoute>} />

        <Route path="/instructor" element={<ProtectedRoute roles={['INSTRUCTOR']}><InstructorDashboard /></ProtectedRoute>} />
        <Route path="/instructor/sections" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><InstructorSections /></ProtectedRoute>} />
        <Route path="/instructor/sections/:id" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><InstructorSectionDetail /></ProtectedRoute>} />
        <Route path="/instructor/lessons/:lessonId/active" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><LessonActiveView /></ProtectedRoute>} />
        <Route path="/instructor/lessons/:lessonId/processing" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><LessonRecognitionProcessing /></ProtectedRoute>} />
        <Route path="/instructor/lessons/:lessonId/review" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><LessonContextReview /></ProtectedRoute>} />
        <Route path="/instructor/settings" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><InstructorSettings /></ProtectedRoute>} />
        <Route path="/instructor/quizzes/:quizId/attempts" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><InstructorQuizAttempts /></ProtectedRoute>} />
        <Route path="/instructor/quizzes/:quizId/analytics" element={<ProtectedRoute roles={['INSTRUCTOR']} requireActive><InstructorQuizAnalytics /></ProtectedRoute>} />

        <Route path="/student" element={<ProtectedRoute roles={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/join-section" element={<ProtectedRoute roles={['STUDENT']}><StudentJoinSection /></ProtectedRoute>} />
        <Route path="/student/classes" element={<ProtectedRoute roles={['STUDENT']}><StudentClasses /></ProtectedRoute>} />
        <Route path="/student/lessons/:lessonId" element={<ProtectedRoute roles={['STUDENT']}><StudentLesson /></ProtectedRoute>} />
        <Route path="/student/attempts/:attemptId" element={<ProtectedRoute roles={['STUDENT']}><StudentQuizAttempt /></ProtectedRoute>} />
        <Route path="/student/results" element={<ProtectedRoute roles={['STUDENT']}><StudentQuizHistory /></ProtectedRoute>} />

        <Route path="*" element={<PageTransition className="flex min-h-screen flex-col items-center justify-center gap-3">
          <div className="text-5xl font-black text-slate-300">404</div>
          <p className="text-muted-foreground">Page not found.</p>
          <a href="/" className="text-sm font-medium text-primary hover:text-primary-hover hover:underline">Go home</a>
        </PageTransition>} />
      </Routes>
    </Suspense>
  </TokenValidator>;
}

export default function App() {
  return <ThemeProvider><BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter></ThemeProvider>;
}
