import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { instructorAccessCodeForStatus } from '../utils/instructorAccess';

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
 * 3. Active-status guard for INSTRUCTOR — every instructor route requires
 *    server-approved status; a stale local account is signed out before
 *    any instructor page can render.
 *
 * NOTE: This is a UX convenience only. The backend independently enforces
 * status=ACTIVE on all instructor resource endpoints via authorizeActive().
 * A user who bypasses this component still gets HTTP 403 from the API.
 */
export default function ProtectedRoute({ children, roles, requireActive = false }) {
  const { user, logout } = useAuth();
  const unapprovedInstructor = requireActive && user?.role === 'INSTRUCTOR' && user.status !== 'ACTIVE';

  useEffect(() => {
    if (unapprovedInstructor) logout();
  }, [unapprovedInstructor, logout]);

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

  if (unapprovedInstructor) {
    return <Navigate to="/login?role=instructor" state={{ instructorAccessCode: instructorAccessCodeForStatus(user.status) }} replace />;
  }

  return children;
}
