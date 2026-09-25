import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Footer from '../components/Common/Footer';

/**
 * The route-level failure states (spec §17): 404, 403 and 401.
 *
 * One layout, three answers -- they differ in what they say and where they
 * send you, never in how they look, so an unexpected URL still feels like the
 * same product. Copy is written here in the UI on purpose: a raw backend
 * payload is not a message a visitor can act on.
 */
function StatusPage({ code, icon, title, body, children }) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16 sm:px-6">
        <div className="ui-card animate-pop-in p-8 text-center sm:p-10">
          <span className="text-5xl" aria-hidden>
            {icon}
          </span>
          <p className="ui-eyebrow mt-5">{code}</p>
          <h1 className="ui-title mt-2 text-2xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">{body}</p>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Any URL the router could not match -- replaces the silent bounce home. */
export function NotFound() {
  const location = useLocation();

  return (
    <StatusPage
      code="404"
      icon="🧭"
      title="Page not found"
      body={
        <>
          Nothing lives at{' '}
          <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-700">
            {location.pathname}
          </span>
          . The link may be old, or the address may have a typo.
        </>
      }
    >
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/templates" className="ui-btn ui-btn--primary">
          Browse templates
        </Link>
        <Link to="/" className="ui-btn ui-btn--soft">
          Back home
        </Link>
      </div>
    </StatusPage>
  );
}

/** Signed in, but the account does not carry the role this area needs. */
export function Forbidden() {
  return (
    <StatusPage
      code="403"
      icon="🔒"
      title="This area is not open to your account"
      body="Uploading and managing templates is reserved for developer and administrator accounts. If your role just changed, sign out and back in so the new one is picked up."
    >
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/dashboard" className="ui-btn ui-btn--primary">
          Go to my dashboard
        </Link>
        <Link to="/" className="ui-btn ui-btn--soft">
          Back home
        </Link>
      </div>
    </StatusPage>
  );
}

/** The page needs a session that is not there. */
export function Unauthorized() {
  const location = useLocation();

  return (
    <StatusPage
      code="401"
      icon="🔑"
      title="Please sign in first"
      body="This page belongs to an account. Signing in takes a moment and brings you straight back here."
    >
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {/* `from` is what ProtectedRoute already passes, so logging in
            returns the visitor to the page they actually asked for. */}
        <Link to="/login" state={{ from: location }} className="ui-btn ui-btn--primary">
          Log in
        </Link>
        <Link to="/register" className="ui-btn ui-btn--soft">
          Create an account
        </Link>
      </div>
    </StatusPage>
  );
}
