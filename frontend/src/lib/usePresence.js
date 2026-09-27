import { useEffect, useRef, useState } from 'react';

/**
 * Keep a dismissed overlay mounted long enough for its exit animation to run
 * (anim guide §18 "Closing: smooth reverse animation", §23 "Closing should
 * also be smooth").
 *
 * Without this an overlay unmounts on the very frame it is dismissed, so the
 * user sees it blink out from under the pointer instead of closing. The cost
 * is one `setTimeout`; the benefit is that "closing" becomes a real, styled
 * state instead of a disappearance.
 *
 *   const [present, exiting] = usePresence(open);
 *   if (!present) return null;
 *   return <div className={exiting ? 'is-closing' : ''}>…</div>;
 *
 * Both <Modal /> and the screenshot lightbox use it so the timing lives in
 * exactly one place.
 *
 * The two directions are handled deliberately differently:
 *
 * - **Closing** never writes state synchronously. `present` is simply still
 *   true from when the overlay was open, and the timeout is what clears it --
 *   so the exit gets its full window before anything unmounts.
 * - **Reopening** has to take effect in the *same* render as the prop,
 *   otherwise an overlay dismissed and reopened within the window would spend
 *   a frame blank. That is the render-phase adjustment below (the pattern
 *   React documents for deriving state from props): it is conditional and
 *   converges in one pass, so React applies it before committing.
 *
 * Two guards exist because each one bought a real failure, not a hypothetical:
 *
 * - The timeout is **never armed unless there is something on screen to let go
 *   of** (`open || !present`). An effect that runs on mount while the overlay
 *   is closed would otherwise schedule a dismissal for something that was
 *   never shown -- and that stray timeout, firing once the overlay *has*
 *   opened, wiped `present` from under it. The next close then saw
 *   `!open && !present` and unmounted in a single frame, silently skipping the
 *   whole exit. Only arming from a genuine open->close transition removes the
 *   timer at its source.
 * - When it does fire, it re-checks the **live** `open` through a ref rather
 *   than the `open` it closed over. A dismissal is only valid while the overlay
 *   is still dismissed; if it was reopened while we waited, this timeout is
 *   stale and must not blank a modal that is visibly open.
 *
 * @param {boolean} open     whether the overlay should currently be shown
 * @param {number}  exitMs   how long the exit animation is given to play
 * @returns {[boolean, boolean]} `[present, exiting]`
 */
export default function usePresence(open, exitMs = 200) {
  const [present, setPresent] = useState(Boolean(open));
  const [wasOpen, setWasOpen] = useState(open);
  // Written from the effect below so the timeout can read the value that is
  // true *when it fires*, not the one that was true when it was scheduled.
  const openRef = useRef(open);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setPresent(true);
  }

  useEffect(() => {
    openRef.current = open;

    // Nothing showing, nothing to release. This is also the mount path, and
    // not arming it is what keeps a stray timeout from ever existing.
    if (open || !present) return undefined;

    // `open` just went false while we are still on screen: hold the DOM for
    // the length of the exit, then let it go. Changing our mind inside that
    // window (a reopen) cancels the timer via this cleanup -- and the ref
    // check below covers us even if that cleanup runs late.
    const timer = setTimeout(() => {
      if (openRef.current) return;
      setPresent(false);
    }, exitMs);
    return () => clearTimeout(timer);
  }, [open, present, exitMs]);

  return [present, present && !open];
}
