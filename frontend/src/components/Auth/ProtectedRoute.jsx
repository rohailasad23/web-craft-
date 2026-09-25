import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../lib/session';
import { Forbidden } from '../../pages/StatusPages';

/**
 * Gate for authenticated pages.
 *
 * `roles` optionally narrows it further, so a normal user who types
 * /developer/upload into the address bar is told why they cannot use it
 * instead of being silently relocated (spec §17 wants a real 403 page, and a
 * surprise jump to the dashboard leaves people wondering what they clicked).
 * The redirect to /login carries `from`, so after signing in the visitor
 * lands where they were heading.
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, user } = useSession();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(user?.role)) {
    return <Forbidden />;
  }

  return children;
}
