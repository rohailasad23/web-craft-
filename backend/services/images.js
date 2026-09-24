'use strict';

const axios = require('axios');
const { readSecret } = require('../utils/secrets');
const { escapeXml } = require('../utils/html');

/**
 * Image sourcing with a hard dependency on nothing.
 *
 * Previously this fell back to via.placeholder.com, which no longer exists, so
 * users got broken images whenever Unsplash was unavailable or the key was a
 * placeholder. The fallback is now a local SVG data URI: zero network calls,
 * always renders.
 */

const UNSPLASH_QUERY = {
  ecommerce: 'shopping business',
  service: 'professional service',
  saas: 'technology software',
  portfolio: 'creative portfolio',
  agency: 'business team',
  nonprofit: 'community volunteer',
};

const FALLBACK_IMAGES = [
  { label: 'Hero Image', width: 1200, height: 600 },
  { label: 'Feature 1', width: 400, height: 300 },
  { label: 'Feature 2', width: 400, height: 300 },
];

/** A self-contained placeholder that needs no network access. */
function placeholderImage(label, width, height) {
  const bg = ['#e5e7eb', '#e0e7ff', '#fce7f3'][label.length % 3];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<text x="50%" y="50%" fill="#6b7280" font-family="system-ui,sans-serif" font-size="${Math.round(
      width / 18
    )}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function fallbackImages() {
  return FALLBACK_IMAGES.map(({ label, width, height }) => ({
    url: placeholderImage(label, width, height),
    alt: label,
  }));
}

async function getImages(businessType) {
  const apiKey = readSecret('UNSPLASH_API_KEY');
  if (!apiKey) return fallbackImages();

  try {
    const query = UNSPLASH_QUERY[businessType] || businessType || 'business';
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: 3 },
      headers: { Authorization: `Client-ID ${apiKey}` },
      timeout: 10_000,
    });

    const images = (response.data?.results || [])
      .filter((img) => img?.urls?.regular)
      .map((img) => ({
        url: img.urls.regular,
        alt: img.alt_description || query,
      }));

    return images.length >= 3 ? images.slice(0, 3) : [...images, ...fallbackImages()].slice(0, 3);
  } catch (error) {
    const status = error?.response?.status;
    console.warn(`⚠️  Unsplash fetch failed${status ? ` (${status})` : ''}; using local placeholders.`);
    return fallbackImages();
  }
}

module.exports = { getImages, placeholderImage, fallbackImages };
