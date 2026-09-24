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

const COLOR_PRESETS = [
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#0EA5E9',
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
    <div className="relative mx-auto max-w-3xl px-5 py-9 sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <div className="absolute left-1/4 h-56 w-56 -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl animate-float" />
      </div>

      {/* ---------- Header ---------- */}
      <div className="animate-fade-up relative">
        <span className="ui-eyebrow">Step 1 of 1</span>
        <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Generate your landing page</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
          Fill this in and the builder drafts the sections, copy and layout. You can change
          everything afterwards in the editor.
        </p>
      </div>

      {aiConfigured === false && (
        <div className="ui-alert ui-alert--warning mt-6">
          <span aria-hidden>🤖</span>
          <span>
            <strong>Heads up:</strong> no AI provider is configured, so pages will use pre-written
            template copy instead of generated copy. Set{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">CLAUDE_API_KEY</code>{' '}
            in <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">backend/.env</code>{' '}
            to enable generation.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="ui-alert ui-alert--error mt-6">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ---------- Form ---------- */}
      <form onSubmit={handleSubmit} className="ui-card animate-pop-in mt-6 p-6 sm:p-8">
        <div className="stagger space-y-6">
          {/* Section 1 */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-500">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-100 text-xs text-brand-700">
                1
              </span>
              About the business
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="businessName" className="ui-label">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="businessName"
                  type="text"
                  required
                  placeholder="E.g., TechNova Solutions"
                  className="ui-input"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="businessType" className="ui-label">
                  Business Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="businessType"
                  required
                  className="ui-input ui-select"
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                >
                  {BUSINESS_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="ui-label">
                  Business Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  required
                  placeholder="Describe the business in 50-200 words…"
                  className="ui-input h-28"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
                <p className="mt-1.5 text-xs text-ink-500">
                  The more detail you give, the better the generated copy.
                </p>
              </div>

              <div>
                <label htmlFor="targetAudience" className="ui-label">
                  Target Audience
                </label>
                <input
                  id="targetAudience"
                  type="text"
                  placeholder="E.g., Entrepreneurs, Small Business Owners"
                  className="ui-input"
                  value={formData.targetAudience}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                />
              </div>
            </div>
          </section>

          <hr className="border-ink-100" />

          {/* Section 2 */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-500">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-100 text-xs text-brand-700">
                2
              </span>
              Highlights &amp; style
            </h2>

            <div className="space-y-5">
              <fieldset>
                <legend className="ui-label">Key Features (Top 3)</legend>
                <div className="space-y-2">
                  {formData.features.map((feature, idx) => (
                    <div key={idx} className="group flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-xs font-bold text-ink-500 transition-colors duration-300 group-focus-within:bg-brand-100 group-focus-within:text-brand-700">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder={`Feature ${idx + 1}`}
                        aria-label={`Feature ${idx + 1}`}
                        className="ui-input"
                        value={feature}
                        onChange={(e) => {
                          const next = [...formData.features];
                          next[idx] = e.target.value;
                          setFormData({ ...formData, features: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="colorScheme" className="ui-label">
                  Primary Color
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="colorScheme"
                    className="relative h-11 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-ink-200 shadow-soft transition-transform duration-300 hover:scale-105"
                    style={{ backgroundColor: formData.colorScheme }}
                    title="Open color picker"
                  >
                    <input
                      id="colorScheme"
                      type="color"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      value={formData.colorScheme}
                      onChange={(e) => setFormData({ ...formData, colorScheme: e.target.value })}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Set primary color to ${c}`}
                        onClick={() => setFormData({ ...formData, colorScheme: c })}
                        className={`h-8 w-8 rounded-full transition-all duration-300 hover:scale-110 hover:-translate-y-0.5 ${
                          formData.colorScheme.toLowerCase() === c.toLowerCase()
                            ? 'ring-2 ring-offset-2 ring-ink-900 scale-110'
                            : 'ring-1 ring-black/10'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>

                  <span className="ml-auto rounded-lg bg-ink-100 px-2.5 py-1 font-mono text-xs uppercase text-ink-700">
                    {formData.colorScheme}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <button type="submit" disabled={loading} className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg group mt-8">
          {loading ? (
            <>
              <span className="ui-spinner" aria-hidden />
              Generating your page…
            </>
          ) : (
            <>
              Generate landing page
              <span className="transition-transform duration-300 group-hover:translate-x-1 group-hover:scale-125">
                ✨
              </span>
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-ink-500">
          This usually takes a few seconds. You&apos;ll land straight in the editor.
        </p>
      </form>
    </div>
  );
}
