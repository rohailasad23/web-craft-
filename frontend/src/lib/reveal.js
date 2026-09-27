import { useEffect } from 'react';

/**
 * Scroll reveal (anim guide §9: "sections can animate into view when the user
 * scrolls").
 *
 * A `.stagger` grid whose reveal runs on mount plays the whole thing while it
 * is still off screen -- the effect is spent before anyone can see it, and the
 * section simply appears already settled. This hook fixes that without ever
 * putting content at risk of staying invisible:
 *
 *  1. Only containers whose top is still below the fold get `.will-reveal`
 *     (which stops their children animating and holds them at opacity 0).
 *     Anything already on screen is left completely alone and animates on
 *     mount exactly as it did before.
 *  2. An IntersectionObserver strips the class the moment the container
 *     arrives, which restarts the animation with its staggered delays intact.
 *     Observers always deliver an initial callback, so a container that is in
 *     fact visible is revealed on the very next frame -- nothing on screen can
 *     be left blank.
 *  3. If IntersectionObserver does not exist, the class is never added at
 *     all: the old behaviour is the fallback, not a broken page.
 *
 * It scans on a mutation observer rather than per page because grids render
 * after their data arrives -- a one-shot scan on route change would run
 * against the loading skeleton and find nothing.
 */
export default function useScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove('will-reveal');
          observer.unobserve(entry.target);
        }
      },
      // Reveal a touch before the section is fully in, so it is already
      // settling as it appears rather than after it stops moving.
      { rootMargin: '0px 0px -6% 0px' }
    );

    let frame = 0;
    const scan = () => {
      frame = 0;
      const viewport = window.innerHeight;
      document.querySelectorAll('.stagger:not([data-reveal])').forEach((el) => {
        el.setAttribute('data-reveal', '1');
        // Below the fold? Hold it. In view? Never touch it.
        if (el.getBoundingClientRect().top > viewport) {
          el.classList.add('will-reveal');
          observer.observe(el);
        }
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(scan);
    };

    schedule();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);

    return () => {
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      // Nothing survives navigation anyway, but leave no state behind that a
      // future scan would mistake for "already handled".
      document.querySelectorAll('.stagger[data-reveal]').forEach((el) => {
        el.removeAttribute('data-reveal');
      });
    };
  }, []);
}
