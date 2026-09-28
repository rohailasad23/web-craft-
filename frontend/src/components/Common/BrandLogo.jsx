/**
 * The identity: the mark and the wordmark, in one place.
 *
 * The mark is a drawn piece, not an emoji. The old one was the platform's
 * 🧩 glyph sitting in a flat square, which is why it read as a placeholder:
 * a real OS emoji brought its own colours (green on purple), its own optical
 * weight and its own rendering on every machine. A vector piece is ours --
 * same shape on every device, crisp at 20px, and it takes the brand gradient
 * instead of fighting it.
 *
 * Composition, outside in: an indigo disc with a light gloss across the top,
 * one white piece floating on it (the "template" -- the thing you find and
 * take away), and a four-point spark in the corner (the craft). The spark is
 * the only part that gets dropped below 28px, where it would turn into a
 * smudge.
 *
 * Round, not a rounded square, and that is not a taste call: a browser tab
 * shows the favicon inside a circle, so a circular mark fills the space it is
 * given while a square gets its corners shaved off. Everything is clipped to
 * one circle so the gloss stays a horizontal band across the top instead of
 * being a second shape with corners of its own.
 *
 * One component so the navbar, the footer and the favicon can never drift
 * apart: the same geometry, the same gradient, the same wordmark.
 */
import { useId } from 'react';

const PIECE =
  'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.42 0 2.5 1.09 2.5 2.5s-1.08 2.5-2.5 2.5H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.41 1.09-2.5 2.5-2.5s2.5 1.09 2.5 2.5V22h3.5c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z';

/* Pulled in off the rim: on a square there was room to sit in the corner, on
   a disc the same coordinates would clip. */
const SPARK = 'M28.5 5.9 29.85 9.35 33.3 10.7 29.85 12.05 28.5 15.5 27.15 12.05 23.7 10.7 27.15 9.35Z';

/**
 * The mark alone. Always decorative: it only ever appears beside the
 * wordmark, or inside a link that already names itself -- an `aria-label`
 * here would just make screen readers say "web craft — home" twice.
 */
export function BrandMark({ size = 32, sparkle = true, className = '' }) {
  // One gradient per instance, so the navbar and the footer can both have a
  // brand without two elements fighting over a single id. `useId` is stable
  // across renders and safe to server-render; the strip keeps the characters
  // a CSS `url(#...)` reference will not choke on.
  const raw = useId();
  const id = `wc-mark-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={`block shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.45" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-disc`}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id}-disc)`}>
        {/* the disc */}
        <rect width="40" height="40" fill={`url(#${id}-tile)`} />
        {/* light from above -- the difference between "app icon" and "blob" */}
        <rect width="40" height="21" fill={`url(#${id}-gloss)`} />
        {/* the piece, with a matching stroke to round its corners */}
        <g transform="translate(7.1 10.4) scale(0.85)">
          <path d={PIECE} fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
        {sparkle && (
          <path d={SPARK} fill="#fff" opacity="0.95" stroke="#fff" strokeWidth="0.7" strokeLinejoin="round" />
        )}
      </g>
    </svg>
  );
}

/**
 * The wordmark on its own, so a layout that needs the mark and the name in
 * different places (the navbar drops the name on the narrowest phones) still
 * sets them identically. Same face and weight as the opening's giant
 * WEB CRAFT, so the logo the intro hands over to is the one already on screen.
 */
export function BrandWord({ className = '' }) {
  return (
    <span
      className={`text-[1.0625rem] font-extrabold leading-none tracking-[-0.025em] whitespace-nowrap text-ink-900 ${className}`}
    >
      web craft
    </span>
  );
}

export default function BrandLogo({
  size = 32,
  showWordmark = true,
  wordClassName = '',
  markClassName = '',
  className = '',
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} sparkle={size >= 28} className={markClassName} />
      {showWordmark && <BrandWord className={wordClassName} />}
    </span>
  );
}
