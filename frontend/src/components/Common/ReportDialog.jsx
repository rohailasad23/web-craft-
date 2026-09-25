import React, { useEffect, useRef, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import Modal from './Modal';
import { useToast } from './Toast';

/** Spec §7's list -- kept next to the form that has to match it. */
const REASONS = [
  'Broken download',
  'Broken demo',
  'Copyright issue',
  'Malicious/suspicious content',
  'Incorrect information',
  'Other',
];

/**
 * Report dialog (spec §7).
 *
 * A `<fieldset>` of radios rather than a dropdown: six options is exactly the
 * count a dropdown hides behind a click, and radios put the whole choice on
 * screen with the group named by `<legend>` for assistive tech.
 *
 * "Other" reveals a textarea and the server requires a sentence there, so the
 * client validates the same rule instead of letting a 400 be the first
 * feedback. 409 (you already have one open) is handled separately because it
 * is not a failure of the form -- it is the answer to a question the user
 * already asked.
 */
export default function ReportDialog({ open, onClose, template }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRadioRef = useRef(null);
  const toast = useToast();

  // A fresh form every time it opens, so a previous attempt cannot be
  // resubmitted by accident and stale text cannot leak into the next report.
  useEffect(() => {
    if (open) {
      setReason('');
      setDetails('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setError('Choose a reason so a moderator knows what to look at.');
      return;
    }
    if (reason === 'Other' && details.trim().length < 5) {
      setError('Please describe the problem so we can look into it.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.post(`/api/templates/${template._id}/report`, {
        reason,
        description: details.trim(),
      });
      toast.success('Thanks -- your report has been sent for review.');
      onClose();
    } catch (err) {
      const status = err.response?.status;
      setError(
        status === 409
          ? 'You already have an open report for this template. A moderator is still looking at it.'
          : getErrorMessage(err, 'Could not send your report')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report this template"
      description={`Tell us what is wrong with “${template?.title || ''}”. Reports go straight to a moderator, not to the developer.`}
      initialFocusRef={firstRadioRef}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="ui-btn ui-btn--soft">
            Cancel
          </button>
          <button
            type="submit"
            form="report-form"
            disabled={busy}
            className="ui-btn ui-btn--danger"
          >
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </div>
      }
    >
      <form id="report-form" onSubmit={submit}>
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-ink-500">
            What is wrong?
          </legend>
          <div className="mt-3 grid gap-2">
            {REASONS.map((r, i) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  reason === r
                    ? 'border-brand-400 bg-brand-50 font-semibold text-brand-800'
                    : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  ref={i === 0 ? firstRadioRef : undefined}
                  onChange={() => {
                    setReason(r);
                    setError('');
                  }}
                  className="h-4 w-4 accent-brand-600"
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        {reason === 'Other' && (
          <div className="mt-4">
            <label htmlFor="report-details" className="ui-label">
              Describe the problem <span className="text-red-500">*</span>
            </label>
            <textarea
              id="report-details"
              className="ui-input mt-1.5"
              rows={4}
              maxLength={1000}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                setError('');
              }}
              placeholder="What did you expect, and what happened instead?"
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          One open report per template, per account. We do not tell the developer who reported it.
        </p>
      </form>
    </Modal>
  );
}
