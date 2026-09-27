import React, { useState } from 'react';
import { usePlatform } from '../../lib/platform';

/**
 * Platform-wide announcements (spec §13), rendered as a strip above the
 * navbar so they are the first thing anyone sees without hijacking a page
 * they are already reading.
 *
 * Dismissing hides an announcement for THIS browser session only -- the
 * message itself is still active on the server, so it reappears next time
 * the tab is opened. That is the point of a temporary notice: dismissable
 * without anybody having to switch it off on the backend.
 */

const TONES = {
  information: { icon: 'ℹ', cls: 'ui-alert--info' },
  update: { icon: '↻', cls: 'ui-alert--info' },
  warning: { icon: '⚠', cls: 'ui-alert--warning' },
  maintenance: { icon: '🔧', cls: 'ui-alert--warning' },
};

const STORE_KEY = 'wc.announcements.dismissed';

function readDismissed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export default function AnnouncementBanner() {
  const { announcements } = usePlatform();
  const [dismissed, setDismissed] = useState(readDismissed);

  const visible = (announcements || []).filter((a) => a.id && !dismissed.has(String(a.id)));
  if (!visible.length) return null;

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(String(id));
    setDismissed(next);
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify([...next]));
    } catch {
      // Private-mode sessionStorage throws on write; the banner just comes
      // back on the next visit, which is the safe direction to fail in.
    }
  };

  return (
    <div className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 py-2.5 sm:px-6">
        {visible.map((a) => {
          const tone = TONES[a.type] || TONES.information;
          return (
            <div key={a.id} className={`ui-alert ${tone.cls}`} role="status">
              <span aria-hidden="true">{tone.icon}</span>
              <div className="min-w-0 flex-1 text-left">
                {a.title && <strong className="mr-1.5 font-semibold">{a.title}</strong>}
                <span>{a.message}</span>
              </div>
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                aria-label="Dismiss this announcement"
                className="shrink-0 rounded-md px-1.5 text-lg leading-none text-ink-500 hover:text-ink-900"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
