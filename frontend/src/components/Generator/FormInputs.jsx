import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

const BUSINESS_TYPES = [
  ['ecommerce', 'E-Commerce'],
  ['service', 'Service Provider'],
  ['saas', 'SaaS'],
  ['portfolio', 'Portfolio'],
  ['agency', 'Digital Agency'],
  ['nonprofit', 'Non-Profit'],
];

const INITIAL = {
  businessName: '',
  businessType: 'ecommerce',
  description: '',
  targetAudience: '',
  features: ['', '', ''],
  colorScheme: '#3B82F6',
};

export default function FormInputs() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // null = still checking; true/false = whether an AI provider is configured.
  const [aiConfigured, setAiConfigured] = useState(null);

  // Tell the user up front if copy will be template-generated rather than
  // silently handing them generic text after a long wait.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/generator/status')
      .then((res) => {
        if (!cancelled) setAiConfigured(Boolean(res.data.aiConfigured));
      })
      .catch(() => {
        if (!cancelled) setAiConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const payload = { ...formData, features: formData.features.filter((f) => f.trim()) };
      const res = await api.post('/api/generator/generate', payload);
      navigate(`/editor/${res.data.pageId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to generate landing page'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Generate Your Landing Page</h1>

      {aiConfigured === false && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          <strong>Heads up:</strong> no AI provider is configured, so pages will use
          pre-written template copy instead of generated copy. Set{' '}
          <code className="bg-amber-100 px-1 rounded">CLAUDE_API_KEY</code> in{' '}
          <code className="bg-amber-100 px-1 rounded">backend/.env</code> to enable generation.
        </div>
      )}

      {error && (
        <p role="alert" className="text-red-600 mb-4 bg-red-50 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="businessName" className="block text-sm font-medium mb-2">
            Business Name *
          </label>
          <input
            id="businessName" type="text" required placeholder="E.g., TechNova Solutions"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })} />
        </div>

        <div>
          <label htmlFor="businessType" className="block text-sm font-medium mb-2">
            Business Type *
          </label>
          <select
            id="businessType" required
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.businessType}
            onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}>
            {BUSINESS_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-2">
            Business Description *
          </label>
          <textarea
            id="description" required placeholder="Describe the business in 50-200 words..."
            className="w-full px-4 py-2 border rounded-lg h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>

        <div>
          <label htmlFor="targetAudience" className="block text-sm font-medium mb-2">
            Target Audience
          </label>
          <input
            id="targetAudience" type="text" placeholder="E.g., Entrepreneurs, Small Business Owners"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.targetAudience}
            onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })} />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium mb-2">Key Features (Top 3)</legend>
          {formData.features.map((feature, idx) => (
            <input
              key={idx} type="text" placeholder={`Feature ${idx + 1}`}
              aria-label={`Feature ${idx + 1}`}
              className="w-full px-4 py-2 border rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={feature}
              onChange={(e) => {
                const next = [...formData.features];
                next[idx] = e.target.value;
                setFormData({ ...formData, features: next });
              }} />
          ))}
        </fieldset>

        <div>
          <label htmlFor="colorScheme" className="block text-sm font-medium mb-2">
            Primary Color
          </label>
          <div className="flex items-center gap-4">
            <input
              id="colorScheme" type="color" className="w-20 h-10 border rounded-lg cursor-pointer"
              value={formData.colorScheme}
              onChange={(e) => setFormData({ ...formData, colorScheme: e.target.value })} />
            <span className="text-gray-600">{formData.colorScheme}</span>
          </div>
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition">
          {loading ? 'Generating... 🤖' : 'Generate Landing Page ✨'}
        </button>
      </form>
    </div>
  );
}
