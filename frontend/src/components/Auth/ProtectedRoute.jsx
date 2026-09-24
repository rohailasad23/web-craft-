import React from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ isAuthenticated, children }) {
  // `replace` keeps history clean, otherwise Back re-enters the protected route
  // and immediately bounces again.
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
