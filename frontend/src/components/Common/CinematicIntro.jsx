import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * The opening (spec §1-§9, §19, §30).
 *
 * One fixed layer, 1.45 seconds, four keyframes -- all of it in CSS. React's
 * only job is to take the layer away when the animation is over, because
 * leaving it mounted would keep a full-screen layer (and its blur) in the
 * compositor for the life of the page.
 *
 * What it is not: a loading screen. There is no spinner, no bar, no
 * "loading" text, and nothing here waits for data. The word arrives on the
 * first frame; the real page has been rendering underneath the whole time and
 * simply becomes visible as the veil lifts (§15, §29).
 *
 * Nothing is interactive by design: `pointer-events: none` is set in CSS, so
 * the page underneath keeps every click even while this is on screen. A wheel,
 * a swipe or a key press ends it early from the parent (§16).
 */
export default function CinematicIntro({ onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1450);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <div className="intro-stage" aria-hidden="true">
      <div className="intro-veil" />
      <div className="intro-grid" />
      <div className="intro-glow" />
      <div className="intro-word">WEB CRAFT</div>
    </div>,
    // Straight onto <body>, deliberately. The page wrapper runs a fade/rise
    // transition, and an ancestor with a transform becomes the containing
    // block for `position: fixed` -- inside it this layer would size itself
    // to the whole document instead of the viewport, and the word would sit
    // a full page below the fold. On <body> there is no such ancestor.
    document.body
  );
}
