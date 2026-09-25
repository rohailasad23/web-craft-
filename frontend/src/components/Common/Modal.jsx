import React, { useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one overlay primitive (spec §19: dialogs, never `window.confirm`).
 *
 * Shared by ConfirmDialog and ReportDialog so the fiddly parts -- Escape,
 * backdrop click, focus trap, focus restore, scroll lock, ARIA wiring -- exist
 * exactly once instead of twice with a subtle divergence between them.
 *
 * - `role` is configurable because an alert that asks a question wants
 *   `alertdialog`, while a form wants plain `dialog`.
 * - `initialFocusRef` lets the caller choose what starts focused. Confirms
 *   deliberately focus Cancel; a form focuses its first field.
 * - Focus returns to whatever opened the modal, so a keyboard user is not
 *   dumped back at the top of the document on close.
 *
 *   <Modal open={open} onClose={close} title="Report this template">…</Modal>
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  labelledBy,
  initialFocusRef,
  panelClassName = 'max-w-md',
}) {
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const titleTargetId = labelledBy || titleId;

  // Open/close side effects: remember who opened us, lock the page behind,
  // take the initial focus, and put everything back afterwards.
  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target = initialFocusRef?.current || panelRef.current;
    target?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open, initialFocusRef]);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // `m-auto` rather than `items-center`: flexbox centring + overflow means
      // the top of an over-tall panel becomes unreachable in every browser.
      // `m-auto` centres when it fits and scrolls cleanly when it does not.
      className="fixed inset-0 z-[60] flex animate-fade-in bg-ink-900/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleTargetId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-card m-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col !p-0 shadow-lift animate-fade-up ${panelClassName}`}
      >
        <div className="shrink-0 px-6 pb-2 pt-6">
          <h2 id={titleId} className="text-base font-bold text-ink-900">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-2 text-sm leading-relaxed text-ink-500">
              {description}
            </p>
          ) : null}
        </div>

        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        ) : (
          <div className="h-2" />
        )}

        {footer ? (
          <div className="shrink-0 border-t border-ink-100 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
