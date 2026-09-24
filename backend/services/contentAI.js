'use strict';

const axios = require('axios');
const { readSecret } = require('../utils/secrets');

/**
 * AI content generation service.
 *
 * Design goals (these are what previously broke the app):
 *  1. Never throw to the caller -- a dead upstream must not break generation.
 *  2. Support multiple providers, selected by whichever key is configured.
 *  3. Always return a normalized, complete content object so downstream
 *     rendering can rely on every field existing.
 *  4. Never log credentials.
 */

const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(input) {
  const {
    businessName,
    businessType,
    description,
    targetAudience,
    features = [],
  } = input;

  const featureList = features.filter(Boolean).join(', ') || 'Not specified';

  return `Generate professional marketing copy for a landing page.

Business Name: ${businessName}
Business Type: ${businessType}
Description: ${description}
Target Audience: ${targetAudience || 'General audience'}
Key Features: ${featureList}

Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:
{
  "headline": "Catchy main heading (max 10 words)",
  "subheadline": "Supporting subheading (max 15 words)",
  "benefits": ["Benefit 1", "Benefit 2", "Benefit 3"],
  "ctaText": "Call to action button text",
  "featureDescriptions": ["Description 1", "Description 2", "Description 3"],
  "footerText": "Professional footer text"
}

Rules:
- "benefits" must contain exactly 3 short strings.
- "featureDescriptions" must contain exactly 3 strings, each 15-25 words.
- Make it conversion-focused, professional and compelling.`;
}

// ---------------------------------------------------------------------------
// Parsing / normalization
// ---------------------------------------------------------------------------

/** Pull the first well-formed JSON object out of an arbitrary model response. */
function extractJson(text) {
  if (!text) throw new Error('Empty model response');
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asString(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function asStringList(value, count, fallback) {
  const list = Array.isArray(value)
    ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
  const source = list.length >= count ? list : [...list, ...fallback];
  return source.slice(0, count);
}

/**
 * Deterministic copy used both as the final fallback and as the baseline that
 * partial model responses are merged into. Guarantees a complete object.
 */
function fallbackContent(input) {
  const { businessName, features = [] } = input;
  const name = asString(businessName, 'Your Business');
  const supplied = features.filter((f) => typeof f === 'string' && f.trim());

  const benefits = asStringList(supplied, 3, [
    'Trusted Quality',
    'Expert Support',
    'Great Value',
  ]);

  return {
    headline: `Grow Your Business with ${name}`,
    subheadline: 'A simpler, faster way to get results — built for teams like yours.',
    benefits,
    ctaText: 'Get Started Today',
    featureDescriptions: benefits.map(
      (b) => `${b}. Everything you need delivered by ${name}, backed by a team that cares about your results.`
    ),
    footerText: `© ${new Date().getFullYear()} ${name}. All rights reserved.`,
  };
}

/**
 * Merge whatever the model returned onto the deterministic fallback so a
 * malformed or partial response can never produce a 500 downstream.
 */
function normalizeContent(raw, input) {
  const base = fallbackContent(input);
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    headline: asString(source.headline, base.headline),
    subheadline: asString(source.subheadline, base.subheadline),
    benefits: asStringList(source.benefits, 3, base.benefits),
    ctaText: asString(source.ctaText, base.ctaText),
    featureDescriptions: asStringList(
      source.featureDescriptions,
      3,
      base.featureDescriptions
    ),
    footerText: asString(source.footerText, base.footerText),
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function logProviderFailure(provider, error) {
  // Log only the status + short message. Never the axios config: it carries
  // the Authorization / x-api-key header.
  const status = error?.response?.status;
  const upstream = error?.response?.data?.error;
  const detail =
    (typeof upstream === 'string' ? upstream : upstream?.message) ||
    error?.code ||
    error?.message ||
    'unknown error';
  console.warn(`⚠️  ${provider} failed${status ? ` (${status})` : ''}: ${detail}`);
}

async function generateWithClaude(input) {
  const apiKey = readSecret('CLAUDE_API_KEY');
  if (!apiKey) return null;

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        // Required by the Anthropic API; omitting this is an instant 400.
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  const text = res.data?.content?.[0]?.text;
  return extractJson(text);
}
generateWithClaude.provider = 'claude';

async function generateWithOpenAI(input) {
  const apiKey = readSecret('OPENAI_API_KEY');
  if (!apiKey) return null;

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a conversion copywriter. Reply with raw JSON only.' },
        { role: 'user', content: buildPrompt(input) },
      ],
    },
    {
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  return extractJson(res.data?.choices?.[0]?.message?.content);
}
generateWithOpenAI.provider = 'openai';

async function generateWithOllama(input) {
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl) return null;

  const res = await axios.post(
    `${baseUrl.replace(/\/$/, '')}/api/generate`,
    {
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      prompt: `${buildPrompt(input)}\n\nReply with raw JSON only.`,
      format: 'json',
      stream: false,
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );

  return extractJson(res.data?.response);
}
generateWithOllama.provider = 'ollama';

// Providers are tried in order; the first configured + successful one wins.
const PROVIDERS = [generateWithClaude, generateWithOpenAI, generateWithOllama];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate landing page copy. Never throws.
 *
 * @returns {Promise<{content: object, provider: string}>}
 *   `provider` is the AI backend used, or `'template'` when every provider
 *   was unavailable/failed -- so the UI can tell the user honestly.
 */
async function generateContent(input) {
  for (const provider of PROVIDERS) {
    try {
      const raw = await provider(input);
      if (raw === null) continue; // provider not configured, try next
      return { content: normalizeContent(raw, input), provider: provider.provider };
    } catch (error) {
      logProviderFailure(provider.provider, error);
    }
  }

  console.warn('⚠️  No AI provider available -- using deterministic template copy.');
  return { content: fallbackContent(input), provider: 'template' };
}

module.exports = {
  generateContent,
  fallbackContent,
  normalizeContent,
  extractJson,
};
