import { Link } from 'react-router-dom';

/**
 * The full-maintenance page (spec §12).
 *
 * This is a wall, not an error: the platform is deliberately down, not
 * broken, so it says that plainly and stops there -- no fake progress bars,
 * no countdown nobody can promise (§24: never pretend).
 *
 * The sign-in link stays here on purpose. Maintenance mode keeps the login
 * endpoint open so an administrator can reach the panel and switch the site
 * back on; without this link the operator would lock everyone (including
 * themselves) out of the only screen that can undo it.
 */
export default function MaintenanceWall({ message }) {
  const text =
    (message || '').trim() || 'Website is temporarily under maintenance. Please try again later.';

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-24 text-center">
      <span className="ui-eyebrow">Maintenance</span>
      <h1 className="ui-title mt-3 text-3xl sm:text-4xl">We&rsquo;ll be right back</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-500">{text}</p>

      <Link to="/login" className="ui-btn ui-btn--primary mt-8 px-6 py-3 text-sm font-semibold">
        Sign in as an administrator
      </Link>

      <p className="mt-6 text-xs leading-relaxed text-ink-400">
        Your accounts and saved templates are untouched &mdash; everything returns when the
        platform comes back.
      </p>
    </main>
  );
}
