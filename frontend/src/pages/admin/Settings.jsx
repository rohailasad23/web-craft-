import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { usePlatform, flagLabel } from '../../lib/platform';
import { RowSkeleton } from '../../components/Common/Skeletons';

/** The sentence the backend itself falls back to when no message is stored. */
const DEFAULT_MAINTENANCE_MESSAGE =
  'Website is temporarily under maintenance. Please try again later.';

/** §22's health states, dot for dot the way Overview.jsx draws them. */
const DOTS = {
  healthy: 'bg-emerald-500',
  configured: 'bg-emerald-500',
  attention: 'bg-amber-500',
  unknown: 'bg-ink-300',
  not_configured: 'bg-ink-300',
  unhealthy: 'bg-red-500',
};

const CHECK_LABELS = {
  database: 'Database',
  api: 'API',
  storage: 'Storage',
  moderation: 'Moderation',
  security: 'Security',
  backup: 'Backups',
};

function humanise(key) {
  const s = String(key || '').replace(/([A-Z])/g, ' $1').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * /admin/settings -- §11's feature switchboard, §12's maintenance wall and
 * §24's honest system status.
 *
 * Switch changes are staged and saved in one PUT, because a row of toggles
 * that applies itself per click is how half a platform gets configured by
 * accident. Turning anything OFF asks first (it changes what visitors can
 * do), then every save calls platform.reload() so the rest of the app picks
 * up the new state without a page refresh.
 */
export default function AdminSettings() {
  const [flags, setFlags] = useState(null);
  const [staged, setStaged] = useState({});
  const [maintenance, setMaintenance] = useState(null);
  const [maintStaged, setMaintStaged] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const platform = usePlatform();

  const applyFlags = (data) => {
    const list = data.flags || [];
    setFlags(list);
    setStaged(Object.fromEntries(list.map((f) => [f.key, f.enabled !== false])));
    const m = data.maintenance || { enabled: false, message: '' };
    setMaintenance(m);
    setMaintStaged(m.enabled === true);
  };

  const load = async () => {
    setError('');
    try {
      const res = await api.get('/api/admin/flags');
      applyFlags(res.data);
      setMessage(res.data.maintenance?.message || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the feature switches'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Only on mount; each save below refetches instead of guessing what the
    // server stored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §24: a separate probe so a failing health check cannot blank the
  // switchboard (and a failed switchboard cannot hide the checks).
  useEffect(() => {
    let alive = true;
    api
      .get('/api/admin/health')
      .then((res) => alive && setHealth(res.data))
      .catch((err) => alive && setHealthError(getErrorMessage(err, 'Health checks unavailable')));
    return () => {
      alive = false;
    };
  }, []);

  const changed = (flags || []).filter(
    (f) => staged[f.key] !== undefined && Boolean(staged[f.key]) !== Boolean(f.enabled)
  );
  const turnedOff = changed.filter((f) => staged[f.key] === false);

  const saveFlags = async () => {
    if (turnedOff.length) {
      const names = turnedOff.map((f) => f.label || flagLabel(platform, f.key)).join(', ');
      const ok = await confirm({
        title: `Turn off ${names}?`,
        body: `${names} will stop working for everyone straight away — each row above shows the exact message visitors will read. Switching them back on is instant.`,
        confirmLabel: 'Turn off',
        tone: 'danger',
      });
      if (!ok) return;
    }

    setSaving('flags');
    try {
      const res = await api.put('/api/admin/flags', { flags: staged });
      toast.success(res.data?.message || 'Feature switches updated');
      await load();
      platform.reload();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the switches'));
    } finally {
      setSaving(null);
    }
  };

  const saveMaintenance = async () => {
    // Enabling is the lockout moment: everyone but admins hits the wall on
    // their next request, so it confirms; disabling needs no dialog because
    // it only ever opens the site back up.
    if (maintStaged && !maintenance?.enabled) {
      const ok = await confirm({
        title: 'Turn on maintenance mode?',
        body: 'Non-admin visitors get the maintenance page immediately — the whole site, not just writes. You keep full access to this panel, and signing in stays open. Turning it off returns everyone to the site instantly.',
        confirmLabel: 'Turn on maintenance',
        tone: 'danger',
      });
      if (!ok) return;
    }

    setSaving('maintenance');
    try {
      const res = await api.put('/api/admin/maintenance', {
        enabled: maintStaged === true,
        message,
      });
      const saved = res.data?.maintenance || { enabled: maintStaged === true, message };
      setMaintenance(saved);
      setMaintStaged(saved.enabled === true);
      setMessage(saved.message || '');
      toast.success(res.data?.message || 'Maintenance mode updated');
      platform.reload();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update maintenance mode'));
    } finally {
      setSaving(null);
    }
  };

  const checks = health?.checks;
  const checkRows = checks ? Object.entries(checks) : [];

  // Each check prints what the API measured. The backup row in particular
  // shows its own words verbatim -- if nothing is configured, the page says
  // so; inventing a "last backup" time is the one thing §22 forbids here.
  const detailFor = (key, check) => {
    if (key === 'api' && Number.isFinite(check?.uptimeSeconds)) {
      const h = Math.floor(check.uptimeSeconds / 3600);
      const m = Math.floor((check.uptimeSeconds % 3600) / 60);
      return `up ${h}h ${m}m`;
    }
    if (check?.state === 'not_configured' && check?.message) return check.message;
    if (check?.state === 'attention' && check?.pending) return `${check.pending} waiting for you`;
    if (check?.state === 'attention' && check?.critical24h)
      return `${check.critical24h} in the last 24 hours`;
    return '';
  };

  return (
    <div>
      {error && (
        <div className="ui-alert ui-alert--error mb-6" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-10">
        {/* ------------------------------------------------------- §11 */}
        <section aria-labelledby="flags-heading">
          <h2 id="flags-heading" className="ui-title text-xl">
            Feature switches
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Everything is on unless you turn it off. Changes here are staged until you save, and the
            whole app re-reads them the moment you do.
          </p>

          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={6} />
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {(flags || []).map((f) => {
                  const on = staged[f.key] !== false;
                  return (
                    <li key={f.key} className="flex flex-wrap items-start justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink-900">
                          {f.label || flagLabel(platform, f.key)}
                        </p>
                        {!on && (
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            Users will see: “{f.message}”
                          </p>
                        )}
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={on}
                          onChange={(e) =>
                            setStaged((prev) => ({ ...prev, [f.key]: e.target.checked }))
                          }
                          aria-label={f.label || flagLabel(platform, f.key)}
                        />
                        {on ? 'On' : 'Off'}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500" aria-live="polite">
              {changed.length === 0
                ? 'No pending changes.'
                : `${changed.length} switch${changed.length === 1 ? '' : 'es'} about to be saved.`}
            </p>
            <button
              type="button"
              onClick={saveFlags}
              disabled={saving === 'flags' || loading}
              className="ui-btn ui-btn--primary !px-4 !py-2 !text-sm"
            >
              {saving === 'flags' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------- §12 */}
        <section aria-labelledby="maintenance-heading">
          <h2 id="maintenance-heading" className="ui-title text-xl">
            Maintenance mode
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            One wall in front of the whole site. Admins keep this panel; everyone else reads your
            message until you switch it back off.
          </p>

          {maintenance?.enabled && (
            <div className="ui-alert ui-alert--warning mt-4" role="status">
              Maintenance is ON — non-admin visitors see the maintenance page. Turning it off
              returns everyone to the site instantly.
            </div>
          )}

          <div className="ui-card mt-4 p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                Message shown on the wall
              </span>
              <textarea
                rows={3}
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={DEFAULT_MAINTENANCE_MESSAGE}
                className="ui-input text-sm"
              />
            </label>
            <p className="mt-1.5 text-xs text-ink-500">{message.length}/300 characters.</p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={maintStaged}
                  disabled={loading}
                  onChange={(e) => setMaintStaged(e.target.checked)}
                />
                Maintenance mode
              </label>
              <button
                type="button"
                onClick={saveMaintenance}
                disabled={saving === 'maintenance' || loading}
                className="ui-btn ui-btn--primary !px-4 !py-2 !text-sm"
              >
                {saving === 'maintenance'
                  ? 'Saving…'
                  : maintStaged && !maintenance?.enabled
                    ? 'Turn on maintenance'
                    : 'Save'}
              </button>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- §24 */}
        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="ui-title text-xl">
            System status
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Measured right now, never assumed. Anything the platform cannot check says so.
          </p>

          <div className="mt-4">
            {healthError ? (
              <div className="ui-alert ui-alert--warning" role="alert">
                {healthError}
              </div>
            ) : !health ? (
              <RowSkeleton rows={6} />
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {checkRows.length === 0 ? (
                  <li className="p-4 text-sm text-ink-500">No checks were returned.</li>
                ) : (
                  checkRows.map(([key, check]) => {
                    const detail = detailFor(key, check);
                    return (
                      <li key={key} className="flex flex-wrap items-center justify-between gap-4 p-4">
                        <span className="flex items-center gap-2.5 text-sm text-ink-700">
                          <span
                            aria-hidden
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              DOTS[check?.state] || 'bg-ink-300'
                            }`}
                          />
                          {CHECK_LABELS[key] || humanise(key)}
                        </span>
                        <span className="flex min-w-0 items-center gap-3 text-right">
                          {detail && <span className="truncate text-xs text-ink-500">{detail}</span>}
                          <span className="text-sm font-semibold text-ink-900">
                            {check?.label || '—'}
                          </span>
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {!healthError && health?.generatedAt && (
            <p className="mt-3 text-xs text-ink-500">Measured {formatDate(health.generatedAt)}.</p>
          )}
        </section>
      </div>
    </div>
  );
}
