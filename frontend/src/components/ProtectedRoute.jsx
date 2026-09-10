import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute
 *
 * Two layers of frontend protection (backend enforcement is primary):
 *
 * 1. Authentication — redirects to /login if no user in context.
 *
 * 2. Role guard — if `roles` is provided, the user's role must be included.
 *    Wrong-role users are sent to their own dashboard root.
 *
 * 3. Active-status guard for INSTRUCTOR — if `requireActive` is true (the
 *    default for instructor sub-routes), a PENDING instructor is redirected
 *    to /instructor where InstructorDashboard shows the awaiting-approval
 *    screen. This prevents manually navigating to /instructor/sections or
 *    /instructor/sections/:id while pending.
 *
 * NOTE: This is a UX convenience only. The backend independently enforces
 * status=ACTIVE on all instructor resource endpoints via authorizeActive().
 * A user who bypasses this component still gets HTTP 403 from the API.
 */
export default function ProtectedRoute({ children, roles, requireActive = false }) {
  const { user } = useAuth();

  // Not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'ADMIN')      return <Navigate to="/admin"      replace />;
    if (user.role === 'INSTRUCTOR') return <Navigate to="/instructor" replace />;
    if (user.role === 'STUDENT')    return <Navigate to="/student"    replace />;
    return <Navigate to="/login" replace />;
  }

  // PENDING instructor trying to reach an active-only instructor route
  if (requireActive && user.role === 'INSTRUCTOR' && user.status !== 'ACTIVE') {
    // Redirect to the dashboard root, which renders the awaiting-approval banner
    return <Navigate to="/instructor" replace />;
  }

  return children;
}
