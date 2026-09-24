import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

export default function Register({ onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/api/auth/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onAuth?.(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 px-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        {error && (
          <p role="alert" className="text-red-600 text-sm mb-4">
            {error}
          </p>
        )}
        <input
          type="text" placeholder="Name" required autoComplete="name"
          className="w-full px-4 py-2 border rounded mb-4"
          value={form.name} onChange={update('name')} />
        <input
          type="email" placeholder="Email" required autoComplete="email"
          className="w-full px-4 py-2 border rounded mb-4"
          value={form.email} onChange={update('email')} />
        <input
          type="password" placeholder="Password (min 6 chars)" required autoComplete="new-password"
          className="w-full px-4 py-2 border rounded mb-4"
          value={form.password} onChange={update('password')} />
        <input
          type="password" placeholder="Confirm Password" required autoComplete="new-password"
          className="w-full px-4 py-2 border rounded mb-6"
          value={form.confirmPassword} onChange={update('confirmPassword')} />
        <button
          type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400">
          {loading ? 'Creating account...' : 'Register'}
        </button>
        <p className="text-sm text-center mt-4">
          Already have an account? <Link to="/login" className="text-blue-600">Login</Link>
        </p>
      </form>
    </div>
  );
}
