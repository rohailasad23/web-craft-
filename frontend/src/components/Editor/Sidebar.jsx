import React from 'react';

const SECTION_META = {
  hero: { icon: '🎯', hint: 'Headline, subheadline, CTA' },
  features: { icon: '🧩', hint: 'Up to three feature cards' },
  cta: { icon: '📣', hint: 'Closing call to action' },
  footer: { icon: '📎', hint: 'Name and fine print' },
};

export default function Sidebar({ lpData, selectedSection, setSelectedSection }) {
  const sections = lpData?.currentState?.sections || [];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-100 bg-white">
      <div className="border-b border-ink-100 px-4 py-3.5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">Sections</h2>
        <p className="mt-1 text-[11px] text-ink-500">
          {sections.length} block{sections.length === 1 ? '' : 's'} · click to edit
        </p>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {sections.map((section, idx) => {
          const active = selectedSection === section.id;
          const meta = SECTION_META[section.type] || { icon: '📄', hint: '' };

          return (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id)}
              aria-current={active ? 'true' : undefined}
              className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all duration-300 ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-soft'
                  : 'text-ink-700 hover:bg-ink-50 hover:pl-4'
              }`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white/70" />
              )}
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm transition-transform duration-300 ${
                  active ? 'bg-white/20' : 'bg-ink-100 group-hover:scale-110'
                }`}
              >
                {meta.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold capitalize">{section.type}</span>
                <span
                  className={`block truncate text-[11px] ${
                    active ? 'text-white/70' : 'text-ink-500'
                  }`}
                >
                  {meta.hint}
                </span>
              </span>
            </button>
          );
        })}

        {sections.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-500">
            No sections yet.
          </div>
        )}
      </nav>

      <div className="border-t border-ink-100 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        Edits save automatically as you type.
      </div>
    </aside>
  );
}
