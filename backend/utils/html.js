'use strict';

/**
 * HTML escaping helpers.
 * Every value interpolated into generated HTML MUST pass through one of these,
 * otherwise user/AI supplied content becomes stored XSS.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** Escape for use inside a double-quoted HTML attribute. */
function escapeAttr(value) {
  return escapeHtml(value);
}

/** Escape for use inside an XML/SVG text node (used for data-URI placeholders). */
function escapeXml(value) {
  return escapeHtml(value);
}

module.exports = { escapeHtml, escapeAttr, escapeXml };
