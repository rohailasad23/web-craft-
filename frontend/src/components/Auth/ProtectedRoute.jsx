import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../lib/session';

/**
 * Gate for authenticated pages.
 *
 * `roles` optionally narrows it further, so a normal user who types
 * /developer/upload into the address bar is bounced instead of seeing a screen
 * they cannot use (spec §4). The redirect carries `from`, so after signing in
 * the visitor lands where they were heading.
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, user } = useSession();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace state={{ blockedByRole: true }} />;
  }

  return children;
}
