import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

import Home from './pages/Home';
import Templates from './pages/Templates';
import TemplateDetails from './pages/TemplateDetails';
import Developers from './pages/Developers';
import DeveloperProfile from './pages/DeveloperProfile';
import Dashboard from './pages/Dashboard';
import MyDownloads from './pages/MyDownloads';
import SavedTemplates from './pages/SavedTemplates';
import Profile from './pages/Profile';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Navbar from './components/Common/Navbar';
import ErrorBoundary from './components/Common/ErrorBoundary';
import SuspendedBanner from './components/Common/SuspendedBanner';
import { ToastProvider } from './components/Common/Toast';
import { ConfirmProvider } from './components/Common/ConfirmDialog';
import { SessionContext } from './lib/session';
import { loadCatalog } from './lib/catalog';
import api, { setSuspendedSession } from './lib/api';

import DeveloperDashboard from './pages/developer/Dashboard';
import MyTemplates from './pages/developer/MyTemplates';
import UploadTemplate from './pages/developer/Upload';
import AdminLayout from './pages/admin/AdminLayout';
import AdminOverview from './pages/admin/Overview';
import AdminTemplates from './pages/admin/Templates';
import AdminUsers from './pages/admin/Users';
import AdminReports from './pages/admin/Reports';
import AdminAudit from './pages/admin/Audit';
import { NotFound, Forbidden, Unauthorized } from './pages/StatusPages';

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

/** Spec §8: admin only, and the API re-verifies role on every request. */
const ADMIN_ROLES = ['admin'];

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

  // Re-read /me once at boot. Role and account status both live on the server
  // and localStorage can be days stale (a promotion, or a suspension, while
  // the tab was closed) -- this is one indexed lookup, not a polling loop.
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  // Fetch the taxonomy once for the whole session.
  useEffect(() => {
    loadCatalog();
  }, []);

  // Fired by the shared axios client the first time an action is refused
  // because the account was suspended (spec §9). Re-reading /me is what puts
  // `status` into the stored session, which is what makes the banner below
  // appear -- no reload, no polling, and only once however many clicks fail
  // in the same second.
  const suspendedHandled = useRef(false);

  useEffect(() => {
    suspendedHandled.current = !session.isAuthenticated;
  }, [session.isAuthenticated]);

  useEffect(() => {
    const handleSuspended = () => {
      if (suspendedHandled.current) return;
      suspendedHandled.current = true;
      onRefresh();
    };
    window.addEventListener('account:suspended', handleSuspended);
    return () => window.removeEventListener('account:suspended', handleSuspended);
  }, [onRefresh]);

  // Tell the shared client what the stored session claims about account
  // status. It needs this to spot a stale one: once an admin lifts a
  // suspension, the next write the server *allows* proves the banner is lying.
  const suspended = session.user?.status === 'suspended';
  const recheckHandled = useRef(false);

  useEffect(() => {
    setSuspendedSession(suspended);
  }, [suspended]);

  // Re-read /me on that proof so the banner clears itself -- guarded so a
  // burst of clicks in the same tick still produces exactly one request, and
  // only while there is actually something to clear (§36: no pointless
  // refetching for sessions that were never suspended).
  useEffect(() => {
    if (!suspended) return undefined;
    const handleRecheck = () => {
      if (recheckHandled.current) return;
      recheckHandled.current = true;
      Promise.resolve(onRefresh()).finally(() => {
        recheckHandled.current = false;
      });
    };
    window.addEventListener('account:recheck', handleRecheck);
    return () => window.removeEventListener('account:recheck', handleRecheck);
  }, [suspended, onRefresh]);

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
        {session.user?.status === 'suspended' && <SuspendedBanner />}
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
              path="/saved"
              element={
                <ProtectedRoute>
                  <SavedTemplates />
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

            {/* Admin only (spec §8). One layout route so the tab row and
                breadcrumb are written once; ProtectedRoute rejects the whole
                subtree for anyone who is not an admin, and every API behind
                it re-checks role === admin server-side. */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={ADMIN_ROLES}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="templates" element={<AdminTemplates />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="audit" element={<AdminAudit />} />
            </Route>

            {/* Spec §17: real failure pages instead of a silent bounce home.
                Specific paths are declared first so they never fall through
                to the catch-all below. */}
            <Route path="/401" element={<Unauthorized />} />
            <Route path="/403" element={<Forbidden />} />
            <Route path="*" element={<NotFound />} />
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
          <ConfirmProvider>
            <AppShell session={session} onLogin={onLogin} onLogout={onLogout} onRefresh={onRefresh} />
          </ConfirmProvider>
        </ToastProvider>
      </Router>
    </ErrorBoundary>
  );
}
