import { NavLink, Outlet } from 'react-router-dom';
import Breadcrumbs from '../../components/Common/Breadcrumbs';
import Footer from '../../components/Common/Footer';

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/templates', label: 'Templates' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/audit', label: 'Audit log' },
];

/**
 * Shared shell for every admin screen (spec §8).
 *
 * The tab row is a list of `NavLink`s rather than buttons that call navigate():
 * each section is a real URL, so a moderator can bookmark the report queue,
 * hand it to a colleague, or hit Back after opening a template. `end` on the
 * first tab stops `/admin` from staying highlighted once you are on
 * `/admin/templates`.
 *
 * Routes are only ever mounted behind `ProtectedRoute roles={['admin']}`, and
 * every API behind `requireRole('admin')` -- this layout is presentation, not
 * the security boundary (§8: the backend verifies role === admin).
 */
export default function AdminLayout() {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-16 pt-8 sm:px-6">
        <Breadcrumbs items={[{ label: 'Admin' }]} className="mb-4" />

        <header className="animate-fade-up">
          <span className="ui-eyebrow">Moderation</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Admin</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            Review submissions, answer reports, and keep an eye on the catalogue. Every action
            here is written to the audit log.
          </p>
        </header>

        <nav aria-label="Admin sections" className="mt-6 overflow-x-auto">
          <ul className="flex w-max min-w-full gap-1.5 border-b border-ink-200 pb-px">
            {TABS.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `-mb-px block whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-ink-500 hover:text-ink-800'
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
