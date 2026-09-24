'use strict';

/**
 * Deterministic SVG artwork used as a template thumbnail.
 *
 * Seeded templates get one of these, and so does any upload that omits a
 * thumbnail -- which keeps the grid free of broken images without reaching out
 * to Unsplash or any other third party.
 */

const PALETTES = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#6366f1'],
  ['#f43f5e', '#f97316'],
  ['#10b981', '#0ea5e9'],
  ['#8b5cf6', '#ec4899'],
  ['#f59e0b', '#ef4444'],
  ['#14b8a6', '#22c55e'],
  ['#3b82f6', '#1e293b'],
];

/** Escape for use inside an SVG/HTML text node and attribute value. */
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hash(input) {
  let h = 0;
  for (const ch of String(input)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * 1200x750 card graphic: browser chrome, a gradient wash and the title.
 * Returned as a string; the caller writes it to .svg on disk.
 */
function makeThumbnail(title, category = '') {
  const seed = hash(`${title}${category}`);
  const [a, b] = PALETTES[seed % PALETTES.length];
  const words = String(title).trim().split(/\s+/);
  const line1 = esc(words.slice(0, 2).join(' '));
  const line2 = esc(words.slice(2, 4).join(' '));
  const label = esc(category || 'Template');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" width="1200" height="750" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="750" fill="url(#g)"/>
  <rect width="1200" height="750" fill="url(#w)"/>
  <g opacity=".16" fill="#ffffff">
    <circle cx="1010" cy="150" r="190"/>
    <circle cx="150" cy="640" r="140"/>
  </g>
  <g>
    <rect x="64" y="64" width="1072" height="74" rx="14" fill="#0f172a" fill-opacity=".28"/>
    <circle cx="106" cy="101" r="11" fill="#ff5f57"/>
    <circle cx="142" cy="101" r="11" fill="#febc2e"/>
    <circle cx="178" cy="101" r="11" fill="#28c840"/>
    <rect x="216" y="88" width="640" height="26" rx="13" fill="#ffffff" fill-opacity=".18"/>
  </g>
  <rect x="64" y="188" width="360" height="18" rx="9" fill="#ffffff" fill-opacity=".55"/>
  <rect x="64" y="222" width="240" height="18" rx="9" fill="#ffffff" fill-opacity=".35"/>
  <text x="64" y="430" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="86" font-weight="800" fill="#ffffff" letter-spacing="-3">${line1}</text>
  <text x="64" y="520" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="86" font-weight="800" fill="#ffffff" letter-spacing="-3">${line2}</text>
  <rect x="64" y="574" width="${Math.max(140, label.length * 20)}" height="52" rx="26" fill="#0f172a" fill-opacity=".35"/>
  <text x="${64 + Math.max(140, label.length * 20) / 2}" y="608" text-anchor="middle" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="26" font-weight="700" fill="#ffffff">${label}</text>
</svg>
`;
}

module.exports = { makeThumbnail };
