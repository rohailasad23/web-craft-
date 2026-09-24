// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  const [session, setSession] = useState(readSession);

  // Fired by the shared axios client when the API rejects the token.
  useEffect(() => {
    const handleExpired = () => setSession({ isAuthenticated: false, user: null });
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const handleLogin = useCallback((user) => {
    setSession({ isAuthenticated: true, user });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSession({ isAuthenticated: false, user: null });
  }, []);

  const { isAuthenticated, user } = session;

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-gray-50">
          {isAuthenticated && <Navbar user={user} onLogout={handleLogout} />}

          <Routes>
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
                  <Login onAuth={handleLogin} />
                )
              }
            />
            <Route
              path="/register"
              element={
                isAuthenticated ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Register onAuth={handleLogin} />
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
      </Router>
    </ErrorBoundary>
  );
}

export default App;
