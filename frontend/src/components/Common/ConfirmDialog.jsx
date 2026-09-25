import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from './Modal';

const ConfirmContext = createContext(null);

const BASE = {
  title: 'Are you sure?',
  body: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'default', // 'default' | 'danger'
};

/**
 * Confirmation dialog (spec §19).
 *
 * Mounted once in App.jsx. Call it and await the answer:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete “Aurora Store”?', body: '...', tone: 'danger' })) { ... }
 *
 * The spec is explicit that dangerous actions must confirm through a real
 * dialog and NOT `window.alert()` / `window.confirm()` -- those block the
 * event loop, cannot be styled, and cannot be reached by a screen reader's
 * virtual cursor on some browsers.
 *
 * All of the overlay mechanics (Escape, backdrop, focus trap and restore,
 * scroll lock) live in <Modal>; this file is only the promise-shaped API and
 * the two buttons. Initial focus lands on CANCEL -- destructive dialogs that
 * open focused on "Delete" turn one stray Enter keypress into an irreversible
 * action.
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const cancelRef = useRef(null);

  const settle = useCallback((answer) => {
    const resolve = resolver.current;
    resolver.current = null;
    setDialog(null);
    if (resolve) resolve(answer);
  }, []);

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        // Replacing an open dialog rather than stacking: settle the first one
        // as "no" so its caller is never left awaiting forever.
        if (resolver.current) {
          const previous = resolver.current;
          resolver.current = null;
          previous(false);
        }
        resolver.current = resolve;
        setDialog({ ...BASE, ...options });
      }),
    []
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={!!dialog}
        onClose={() => settle(false)}
        role="alertdialog"
        title={dialog?.title}
        description={dialog?.body || undefined}
        initialFocusRef={cancelRef}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" ref={cancelRef} onClick={() => settle(false)} className="ui-btn ui-btn--soft">
              {dialog?.cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`ui-btn ${dialog?.tone === 'danger' ? 'ui-btn--danger' : 'ui-btn--primary'}`}
            >
              {dialog?.confirmLabel}
            </button>
          </div>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() must be used inside <ConfirmProvider>');
  return ctx.confirm;
}
