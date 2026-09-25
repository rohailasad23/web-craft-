/**
 * Persistent notice for a suspended account (spec §9).
 *
 * Spec asks for "a clear message" when a user is suspended. This is that
 * message, and it says three things in order: what happened, what still works,
 * and what to do about it -- because the alternative is a user whose save and
 * download buttons simply start failing with no explanation.
 *
 * It is rendered above the page rather than as a toast: a toast auto-dismisses,
 * and a condition that blocks every write needs to stay on screen for as long
 * as it is true. It is also not dismissible for the same reason.
 */
export default function SuspendedBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-5 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-x-3 gap-y-1.5 text-sm">
        <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
          ⚠️
        </span>
        <p className="min-w-0 flex-1 leading-relaxed text-amber-900">
          <strong className="font-bold">Your account is suspended.</strong> You can keep
          browsing, but saving, downloading and editing are paused while it is in place.
          Contact support if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}
