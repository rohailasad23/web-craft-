import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BrandMark } from './BrandLogo';

/**
 * The opening.
 *
 * Three acts, 1.8 seconds, and every one of them is a keyframe: React's only
 * job is to take the layer away when it is over, because leaving it mounted
 * would keep a full-screen layer (and its blur) in the compositor for the
 * life of the page.
 *
 *   1  the logo arrives oversized, and the camera pulls back until the
 *      wordmark is a medium size
 *   2  at that size the word comes out of its own centre -- one letter at a
 *      time, radiating outwards -- and a hairline draws under it, followed
 *      by the credit
 *   3  the credit lets go, the word travels the exact distance to the navbar
 *      wordmark, and the veil lifts onto the real interface
 *
 * What it is not: a loading screen. No spinner, no bar, no "loading" text,
 * and nothing here waits for data -- the page underneath is fully rendered
 * and fully clickable from the first frame.
 *
 * `pointer-events: none` is set in CSS, so the page keeps every click even
 * while this is on screen; a wheel, a swipe or a key press ends it early
 * from the parent.
 */
const WORDMARK = 'WEB CRAFT';
const STAGE_MS = 1800;

export default function CinematicIntro({ onDone, duration = STAGE_MS }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(timer);
  }, [onDone, duration]);

  const middle = (WORDMARK.length - 1) / 2;

  return createPortal(
    <div
      className="intro-stage"
      // The whole act is timed off this one value: every keyframe in the CSS
      // is a percentage of the stage, and the per-letter delays are fractions
      // of it, so 1800ms for a first visit and 900ms for everyone after it
      // are the same choreography played at two tempos.
      style={{ '--intro-stage-ms': `${duration}ms` }}
      aria-hidden="true"
    >
      <div className="intro-veil" />
      <div className="intro-grid" />
      <div className="intro-glow" />

      {/* Mark above, name below -- the same lockup the navbar shows, so the
          closing flight lands on the real thing rather than near it. */}
      <div className="intro-lockup">
        <BrandMark size={180} sparkle={false} className="intro-mark" />
        <div className="intro-word">
          {Array.from(WORDMARK).map((char, i) => (
            <span
              key={`${char}-${i}`}
              // Two numbers per letter, both plain arithmetic done once here:
              //   --d      how far this letter sits from the middle one, which
              //            becomes its delay, so the word assembles outward
              //            from the centre
              //   --slide  how far it must travel to REACH that centre, in ems
              //            of the giant type. Every letter therefore starts
              //            stacked in the middle and slides horizontally out
              //            into its own place.
              className="intro-letter"
              style={{
                '--d': String(Math.abs(i - middle)),
                '--slide': ((middle - i) * 0.62).toFixed(2),
              }}
            >
              {char === ' ' ? '\u00a0' : char}
            </span>
          ))}
        </div>
      </div>

      <p className="intro-signoff">
        <span className="intro-rule" />
        <span className="intro-credit">Developed by Rohail Asad</span>
        <span className="intro-legal">@ all rights reserved</span>
      </p>
    </div>,
    // Straight onto <body>, deliberately. The page wrapper runs a fade/rise
    // transition, and an ancestor with a transform becomes the containing
    // block for `position: fixed` -- inside it this layer would size itself
    // to the whole document instead of the viewport, and the word would sit
    // a full page below the fold. On <body> there is no such ancestor.
    document.body
  );
}
