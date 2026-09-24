import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();

  // Auth state lives in App.jsx now; no more navigate() + forced reload().
  const handleLogout = () => {
    onLogout?.();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
      <Link to="/dashboard" className="text-xl font-bold text-blue-600">
        LP Builder
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-700 hover:text-blue-600">
          Dashboard
        </Link>
        <Link to="/generate" className="text-gray-700 hover:text-blue-600">
          New Page
        </Link>
        {user?.name && <span className="text-sm text-gray-500">Hi, {user.name}</span>}
        <button
          onClick={handleLogout}
          className="text-sm text-red-600 hover:underline"
          type="button"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
