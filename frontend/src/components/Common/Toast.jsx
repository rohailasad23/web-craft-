import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TONE = {
  success: { icon: '✓', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', iconCls: 'bg-emerald-500' },
  error: { icon: '!', cls: 'border-red-200 bg-red-50 text-red-800', iconCls: 'bg-red-500' },
  info: { icon: 'i', cls: 'border-brand-200 bg-brand-50 text-brand-800', iconCls: 'bg-brand-600' },
};

/**
 * Toast notifications (spec §15).
 *
 * Mounted once in App.jsx. Components call `const toast = useToast()` and then
 * `toast.success('Saved')` / `toast.error('Something went wrong')`.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const leaving = useRef(new Set());

  const remove = useCallback((id) => {
    leaving.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /**
   * Animate the toast out before it disappears (anim guide §20: exit is
   * a fade + slight slide, not an instant vanish). Guarded by a Set so
   * an auto-dismiss and a manual click on the same toast never race.
   */
  const dismiss = useCallback(
    (id) => {
      if (leaving.current.has(id)) return;
      leaving.current.add(id);
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(() => remove(id), 220);
    },
    [remove]
  );

  const show = useCallback(
    (message, type = 'success') => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-3), { id, message: String(message || ''), type }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const tone = TONE[t.type] || TONE.info;
          return (
            <div
              key={t.id}
              className={`ui-card pointer-events-auto flex items-start gap-3 border p-3.5 text-sm shadow-lift ${tone.cls} ${
                t.leaving ? 'animate-toast-out' : 'animate-toast-in'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${tone.iconCls}`}
              >
                {tone.icon}
              </span>
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 -mt-1 grid h-6 w-6 place-items-center rounded-md text-base leading-none opacity-50 transition hover:bg-white/70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
  return ctx;
}
