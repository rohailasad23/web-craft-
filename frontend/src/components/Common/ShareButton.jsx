import React, { useState } from 'react';
import { useToast } from './Toast';

/**
 * Share / copy link (spec §16, §30).
 *
 * One control with two honest behaviours: where the platform offers a native
 * share sheet it opens one, and everywhere else the URL is copied to the
 * clipboard and the toast says so -- the label never promises something the
 * click did not do.
 *
 * The `execCommand` path only runs when the Clipboard API is unavailable
 * (a non-secure context), where `navigator.clipboard` is simply undefined.
 */
export default function ShareButton({
  url,
  title,
  children = 'Share',
  className = 'ui-btn ui-btn--soft ui-btn--block',
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const value = () => url || (typeof window !== 'undefined' ? window.location.href : '');

  const copyWithTextarea = () => {
    const text = value();
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(field);

    if (copied) toast.success('Link copied to clipboard');
    else toast.error('Copy the link from your address bar instead');
  };

  const handleShare = async () => {
    if (busy) return;
    const text = value();
    if (!text) return;

    // The native sheet is the better answer wherever it exists.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setBusy(true);
      try {
        await navigator.share({
          title: title ? `${title} · web craft` : 'web craft',
          url: text,
        });
      } catch (err) {
        // AbortError just means the person closed the sheet -- not a failure.
        if (err?.name !== 'AbortError') copyWithTextarea();
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      toast.success('Link copied to clipboard');
    } catch {
      copyWithTextarea();
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      className={className}
      aria-label={title ? `Share ${title}` : 'Share this page'}
    >
      <span aria-hidden>🔗</span>
      <span key={busy} className="animate-fade-quick">
        {busy ? 'Sharing…' : children}
      </span>
    </button>
  );
}
