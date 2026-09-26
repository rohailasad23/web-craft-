'use strict';

/**
 * Escape a string so a RegExp reads it as literal text.
 *
 * Search input reaches the query operator on both catalogue search (spec §3)
 * and the developer directory (§10). Unescaped it does the wrong thing quietly
 * -- "c++" stops matching "c++" -- and an unbalanced "(" throws a SyntaxError,
 * which turns a typo in a search box into a 500.
 */
function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A case-insensitive literal substring pattern, bounded in length.
 *
 * Bounded and escaped rather than $text on purpose: $text only matches whole
 * words, so searching "port" would never find "Portfolio" -- which is the
 * search people actually try.
 */
function safeRegex(input, maxLength = 80) {
  return new RegExp(escapeRegex(String(input).trim().slice(0, maxLength)), 'i');
}

module.exports = { escapeRegex, safeRegex };
