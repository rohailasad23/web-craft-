import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';

const STATUS_STYLES = {
  published: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-700',
};

export default function Dashboard() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const fetchPages = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      // 401s are handled globally by the shared client.
      const res = await api.get('/api/pages');
      setPages(res.data.pages || []);
      setError('');
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load your landing pages'));
      setLoading(false);
    }
  }, []);

  // Initial load only.
  useEffect(() => {
    // Data fetch on mount: every setState runs after `await`, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    fetchPages();
  }, [fetchPages]);

  const handleDelete = async (page) => {
    const confirmed = window.confirm(`Delete "${page.businessName}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(page._id);
    try {
      await api.delete(`/api/pages/${page._id}`);
      setPages((prev) => prev.filter((p) => p._id !== page._id));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete page'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Your Landing Pages</h1>
        <Link
          to="/generate"
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
        >
          + New Page
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && (
        <div className="mb-6 flex items-center justify-between bg-red-50 text-red-700 px-4 py-3 rounded-lg">
          <span>{error}</span>
          <button onClick={() => fetchPages({ showLoading: true })} className="underline text-sm ml-4">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && pages.length === 0 && (
        <div className="text-center py-20 bg-white rounded-lg shadow">
          <p className="text-gray-500 mb-4">No landing pages yet.</p>
          <Link to="/generate" className="text-blue-600 font-semibold">
            Generate your first one →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pages.map((page) => (
          <div key={page._id} className="bg-white rounded-lg shadow p-5 flex flex-col">
            <h3 className="font-bold text-lg mb-1">{page.businessName}</h3>
            <p className="text-sm text-gray-500 mb-3 capitalize">{page.businessType}</p>

            <div className="flex items-center justify-between text-sm mb-4 gap-2">
              <span
                className={`px-2 py-1 rounded-full text-xs capitalize ${
                  STATUS_STYLES[page.status] || STATUS_STYLES.draft
                }`}
              >
                {page.status}
              </span>
              <span
                className={`px-2 py-1 rounded-full text-xs capitalize ${
                  page.paymentStatus === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {page.paymentStatus}
              </span>
            </div>

            {page.publicUrl && (
              <a
                href={page.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-green-700 text-sm font-semibold mb-2 hover:underline"
              >
                View live page →
              </a>
            )}

            <div className="mt-auto pt-3 flex items-center justify-between">
              <Link to={`/editor/${page._id}`} className="text-blue-600 text-sm font-semibold">
                Open Editor →
              </Link>
              <button
                onClick={() => handleDelete(page)}
                disabled={deletingId === page._id}
                className="text-red-500 text-sm hover:underline disabled:opacity-50"
              >
                {deletingId === page._id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
