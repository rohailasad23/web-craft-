// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Generate from './pages/Generate';
import Editor from './pages/Editor';
import Dashboard from './pages/Dashboard';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Navbar from './components/Common/Navbar';
import ErrorBoundary from './components/Common/ErrorBoundary';

/** Read persisted session state; never trust that localStorage is valid. */
function readSession() {
  const token = localStorage.getItem('token');
  if (!token) return { isAuthenticated: false, user: null };

  try {
    const raw = localStorage.getItem('user');
    return { isAuthenticated: true, user: raw ? JSON.parse(raw) : null };
  } catch {
    // Corrupted entry used to crash the app with a white screen on boot.
    console.warn('Discarding invalid saved session');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return { isAuthenticated: false, user: null };
  }
}

/**
 * Everything that needs router context. It must live *inside* <Router> --
 * calling useLocation() in the parent would throw and blank the page.
 */
function AppShell({ session, onLogin, onLogout }) {
  const location = useLocation();

  // Fired by the shared axios client when the API rejects the token.
  useEffect(() => {
    const handleExpired = () => onLogout();
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [onLogout]);

  // Routes are not scroll-restored by default: landing on /login while the
  // long Home page was scrolled to the bottom opened the form mid-screen.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const { isAuthenticated, user } = session;

  // The editor is a full-screen, app-like surface with its own toolbar (and a
  // back button), so the global navbar would only add a second scroll bar.
  const isEditor = location.pathname.startsWith('/editor/');

  return (
    <div className="min-h-screen bg-ink-50">
      {isAuthenticated && !isEditor && <Navbar user={user} onLogout={onLogout} />}

      {/* Keyed wrapper gives each route a soft entrance transition. */}
      <div key={location.pathname} className="animate-fade-in">
        <Routes location={location}>
          {/* Public Routes */}
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Home />}
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onAuth={onLogin} />
              )
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Register onAuth={onLogin} />
              )
            }
          />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/generate"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Generate />
              </ProtectedRoute>
            }
          />
          <Route
            path="/editor/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <Editor />
              </ProtectedRoute>
            }
          />

          {/* Catch All */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(readSession);

  const handleLogin = useCallback((user) => {
    setSession({ isAuthenticated: true, user });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSession({ isAuthenticated: false, user: null });
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <AppShell session={session} onLogin={handleLogin} onLogout={handleLogout} />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
