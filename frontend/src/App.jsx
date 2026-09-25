import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Home from './pages/Home';
import Templates from './pages/Templates';
import TemplateDetails from './pages/TemplateDetails';
import Developers from './pages/Developers';
import DeveloperProfile from './pages/DeveloperProfile';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import Profile from './pages/Profile';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Navbar from './components/Common/Navbar';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { ToastProvider } from './components/Common/Toast';
import { SessionContext } from './lib/session';
import { loadCatalog } from './lib/catalog';

import DeveloperDashboard from './pages/developer/Dashboard';
import MyTemplates from './pages/developer/MyTemplates';
import UploadTemplate from './pages/developer/Upload';

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

/** Roles allowed on each guarded area (spec §4). */
const DEVELOPER_ROLES = ['developer', 'admin'];

/**
 * Everything that needs router context. It must live *inside* <Router> --
 * calling useLocation() in the parent would throw and blank the page.
 */
function AppShell({ session, onLogin, onLogout, onRefresh }) {
  const location = useLocation();

  // Fired by the shared axios client when the API rejects the token.
  useEffect(() => {
    const handleExpired = () => onLogout();
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [onLogout]);

  // Fetch the taxonomy once for the whole session.
  useEffect(() => {
    loadCatalog();
  }, []);

  // Scroll to the top on navigation; otherwise a detail page opens mid-scroll.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const contextValue = {
    ...session,
    login: onLogin,
    logout: onLogout,
    refresh: onRefresh,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {/* `min-h-dvh` rather than `min-h-screen`: on mobile 100vh covers the
          area hidden behind the browser chrome, so a viewport-fit page such as
          login would sit below the fold and force a scrollbar.
          `overflow-clip` (not `hidden`) keeps the route-reveal transform from
          adding a few pixels of scrollable overflow for the ~300ms it runs --
          on the auth pages, which are exactly one screen tall, that would flash
          a scrollbar and shove the centred card sideways. It is not a scroll
          container, so the sticky navbar and sticky page rails still work. */}
      <div className="flex min-h-dvh flex-col overflow-clip bg-ink-50 font-sans text-ink-900 antialiased">
        <Navbar />
        {/* Keyed on the path so every navigation replays a single, fast
            reveal (anim guide §11). Query-only changes -- filters,
            pagination -- deliberately do NOT remount, so the grid updates
            in place instead of flashing the whole page (§12). */}
        <div key={location.pathname} className="flex-1 animate-page-in">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/:slug" element={<TemplateDetails />} />
            <Route path="/developers" element={<Developers />} />
            <Route path="/developers/:id" element={<DeveloperProfile />} />

            <Route path="/login" element={<Login onAuth={onLogin} />} />
            <Route path="/register" element={<Register onAuth={onLogin} />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/downloads"
              element={
                <ProtectedRoute>
                  <MyDownloads />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Developer-only (spec §16) */}
            <Route
              path="/developer"
              element={
                <ProtectedRoute roles={DEVELOPER_ROLES}>
                  <DeveloperDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/developer/templates"
              element={
                <ProtectedRoute roles={DEVELOPER_ROLES}>
                  <MyTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/developer/upload"
              element={
                <ProtectedRoute roles={DEVELOPER_ROLES}>
                  <UploadTemplate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/developer/upload/:id"
              element={
                <ProtectedRoute roles={DEVELOPER_ROLES}>
                  <UploadTemplate />
                </ProtectedRoute>
              }
            />

            {/* Anything unknown: home, so a stale bookmark never dead-ends. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);

  const onLogin = useCallback((user, token) => {
    if (token) localStorage.setItem('token', token);
    if (user) localStorage.setItem('user', JSON.stringify(user));
    setSession({ isAuthenticated: true, user: user || readSession().user });
  }, []);

  const onLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSession({ isAuthenticated: false, user: null });
  }, []);

  // Re-read /api/auth/me so a role change or profile edit is reflected
  // everywhere without forcing a reload.
  const onRefresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const { default: api } = await import('./lib/api');
      const res = await api.get('/api/auth/me');
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setSession({ isAuthenticated: true, user: res.data.user });
      return res.data.user;
    } catch {
      return null;
    }
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <ToastProvider>
          <AppShell session={session} onLogin={onLogin} onLogout={onLogout} onRefresh={onRefresh} />
        </ToastProvider>
      </Router>
    </ErrorBoundary>
  );
}
