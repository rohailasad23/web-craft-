import React from 'react';

const EDITABLE_INPUT =
  'w-full bg-transparent text-center transition-all duration-300 rounded-lg px-2 py-1 -mx-2 ' +
  'outline-none hover:bg-white/70 focus:bg-amber-50/80 focus:ring-2 focus:ring-amber-300';

export default function Canvas({ lpData, selectedSection, updateSection }) {
  const sections = lpData?.currentState?.sections || [];

  const handleTextEdit = (section, field, value) => {
    updateSection(section.id, { content: { [field]: value } });
  };

  return (
    <div className="relative flex-1 overflow-y-auto bg-gradient-to-b from-ink-100 via-ink-50 to-ink-100 p-5 sm:p-8">
      {/* soft backdrop dots */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,.10) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative mx-auto max-w-3xl animate-fade-in">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
          {sections.map((section, idx) => {
            const active = selectedSection === section.id;
            return (
              <div
                key={section.id}
                className={`group/section relative border-b border-ink-100 p-7 transition-all duration-300 last:border-b-0 sm:p-9 ${
                  active ? 'ring-2 ring-inset ring-brand-400 bg-brand-50/40' : ''
                }`}
                style={{
                  backgroundColor: section.styling?.backgroundColor
                    ? `${section.styling.backgroundColor}15`
                    : undefined,
                }}
              >
                {/* floating section tag */}
                <span
                  className={`pointer-events-none absolute left-3 top-3 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                    active
                      ? 'bg-brand-600 text-white opacity-100'
                      : 'bg-ink-900/70 text-white opacity-0 group-hover/section:opacity-100'
                  }`}
                >
                  {section.type}
                </span>

                {section.type === 'hero' && (
                  <div className="text-center">
                    <input
                      className={`${EDITABLE_INPUT} text-3xl font-extrabold tracking-tight sm:text-4xl`}
                      value={section.content?.headline || ''}
                      aria-label="Hero headline"
                      onChange={(e) => handleTextEdit(section, 'headline', e.target.value)}
                    />
                    <input
                      className={`${EDITABLE_INPUT} mt-1 text-base text-ink-500 sm:text-lg`}
                      value={section.content?.subheadline || ''}
                      aria-label="Hero subheadline"
                      onChange={(e) => handleTextEdit(section, 'subheadline', e.target.value)}
                    />
                    <button
                      className="mt-4 rounded-full px-7 py-2.5 text-sm font-semibold text-white shadow-soft transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-glow"
                      style={{ backgroundColor: lpData?.colorScheme }}
                      tabIndex={-1}
                    >
                      {section.content?.cta}
                    </button>
                  </div>
                )}

                {section.type === 'features' && (
                  <div>
                    <h3 className={`${EDITABLE_INPUT} mb-5 text-xl font-bold tracking-tight sm:text-2xl`}>
                      {section.content?.title}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {(section.content?.features || []).map((f, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-ink-100 bg-white p-4 text-center shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
                        >
                          <div
                            className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white shadow-soft"
                            style={{ backgroundColor: lpData?.colorScheme || '#3B82F6' }}
                          >
                            {i + 1}
                          </div>
                          <p className="font-semibold tracking-tight">{f.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-ink-500">{f.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {section.type === 'cta' && (
                  <div className="rounded-2xl bg-gradient-to-br from-ink-50 to-brand-50/50 px-6 py-8 text-center">
                    <h3 className={`${EDITABLE_INPUT} text-xl font-bold tracking-tight sm:text-2xl`}>
                      {section.content?.headline}
                    </h3>
                    <p className="mt-1.5 text-sm text-ink-500">{section.content?.description}</p>
                    <button
                      className="mt-5 rounded-full px-7 py-2.5 text-sm font-semibold text-white shadow-soft transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-glow"
                      style={{ backgroundColor: lpData?.colorScheme }}
                      tabIndex={-1}
                    >
                      {section.content?.buttonText}
                    </button>
                  </div>
                )}

                {section.type === 'footer' && (
                  <div className="border-t border-ink-100 pt-5 text-center text-sm text-ink-500">
                    <p className="font-semibold text-ink-700">{section.content?.businessName}</p>
                    <p className="mt-0.5">{section.content?.text}</p>
                  </div>
                )}

                {/* index marker on the right edge */}
                <span className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] text-ink-500 opacity-0 transition-opacity duration-300 group-hover/section:opacity-70">
                  #{idx + 1}
                </span>
              </div>
            );
          })}

          {sections.length === 0 && (
            <div className="px-8 py-20 text-center text-sm text-ink-500">
              This page has no sections yet.
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-500">
          ✏️ Click any text to edit it — changes save automatically.
        </p>
      </div>
    </div>
  );
}
