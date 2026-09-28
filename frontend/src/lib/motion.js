/**
 * Pointer-motion capability checks for the interactive layer (premium spec
 * §6, §8, §22, §35, §36).
 *
 * Every effect in this pass that follows the mouse is opt-in through these
 * three functions, and all of them resolve to the same answer: no fine
 * pointer, no effect. That covers touch devices outright (§35 -- mobile
 * keeps fade/slide/scale and loses parallax), and `reducedMotion()` is read
 * on each event rather than cached at load, so turning the OS setting on
 * mid-session stops the movement immediately (§36).
 *
 * Nothing here runs a loop: callers write one CSS custom property per frame
 * and let a transition do the easing (§34).
 */

/** True when the device has a real mouse/trackpad -- evaluated once at load. */
export const FINE_POINTER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The OS-level "reduce motion" answer, read fresh every time it is asked. */
export function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Master switch for cursor-driven effects: fine pointer, and motion allowed. */
export function pointerEffectsAllowed() {
  return FINE_POINTER && !reducedMotion();
}

/**
 * Selective 3D tilt (§8) for the two cards that earn it -- the hero preview
 * and the primary featured template. Rotations stay inside ±2deg / ±3deg, the
 * lift matches `.ui-card--hover` exactly (-4px) so the card never jumps when
 * the pointer arrives, and the inline transform clears on leave so the class
 * takes over again.
 *
 * The handlers only ever read a bounding box and write one string: no
 * requestAnimationFrame, no layout reads per frame beyond the single
 * getBoundingClientRect a pointer event already implies.
 *
 * Returned object is a module-level singleton in practice -- the handlers use
 * `event.currentTarget`, so one shared pair is safe for every card.
 */
export function tiltHandlers(maxX = 2, maxY = 3) {
  return {
    onPointerMove(event) {
      if (!pointerEffectsAllowed() || event.pointerType === 'touch') return;
      const el = event.currentTarget;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;

      const nx = (event.clientX - box.left) / box.width - 0.5; // -0.5 .. 0.5
      const ny = (event.clientY - box.top) / box.height - 0.5;

      // rotateX follows the cursor's vertical position (top edge leans
      // towards the pointer), rotateY answers the horizontal one.
      el.style.transform =
        `perspective(1000px) rotateX(${(ny * maxX * 2).toFixed(2)}deg) ` +
        `rotateY(${(-nx * maxY * 2).toFixed(2)}deg) translateY(-4px)`;
    },
    onPointerLeave(event) {
      event.currentTarget.style.transform = '';
    },
  };
}
