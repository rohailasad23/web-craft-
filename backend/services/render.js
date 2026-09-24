'use strict';

const { escapeHtml, escapeAttr } = require('../utils/html');

/**
 * Turns a LandingPage document into standalone HTML.
 *
 * This is the single source of truth for what gets published. It renders from
 * `currentState.sections`, so any edit made in the editor is reflected the
 * next time the page is saved. Previously `htmlOutput` was frozen at
 * generation time, meaning edits and the color picker had no effect on the
 * published page.
 */

const DEFAULT_COLOR = '#3B82F6';

/** Fallback for pages created before the editor existed. */
function buildTemplate({ businessName, content, images = [], colorScheme }) {
  const color = colorScheme || DEFAULT_COLOR;
  const benefits = Array.isArray(content.benefits) ? content.benefits : [];
  const descriptions = Array.isArray(content.featureDescriptions)
    ? content.featureDescriptions
    : [];

  return {
    sections: [
      {
        id: 'hero',
        type: 'hero',
        content: {
          headline: content.headline,
          subheadline: content.subheadline,
          cta: content.ctaText,
          backgroundImage: images[0]?.url || '',
        },
        // Every section gets a styling object: the editor calls
        // Object.assign(section.styling, ...) and previously crashed on the
        // sections that omitted it.
        styling: { backgroundColor: color },
      },
      {
        id: 'features',
        type: 'features',
        content: {
          title: 'Why Choose Us?',
          features: benefits.map((benefit, idx) => ({
            title: benefit,
            description: descriptions[idx] || benefit,
            image: images[idx + 1]?.url || '',
          })),
        },
        styling: {},
      },
      {
        id: 'cta',
        type: 'cta',
        content: {
          headline: 'Ready to Get Started?',
          description: 'Join thousands of satisfied customers',
          buttonText: content.ctaText,
        },
        styling: { backgroundColor: color },
      },
      {
        id: 'footer',
        type: 'footer',
        content: {
          businessName,
          email: 'contact@example.com',
          phone: '+1 (555) 123-4567',
          text: content.footerText,
        },
        styling: {},
      },
    ],
  };
}

function colorOf(section, fallback = DEFAULT_COLOR) {
  const value = section?.styling?.backgroundColor;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function renderHero(section, brand) {
  const c = section.content || {};
  const bg = colorOf(section);
  const image = c.backgroundImage
    ? `<div class="hero-bg" style="background-image:url('${escapeAttr(c.backgroundImage)}')"></div>`
    : '';

  return `
  <section class="hero" style="background:linear-gradient(135deg, ${escapeAttr(bg)} 0%, ${escapeAttr(
    bg
  )}cc 100%)">
    ${image}
    <div class="hero-content">
      <h1>${escapeHtml(c.headline)}</h1>
      <p>${escapeHtml(c.subheadline)}</p>
      ${c.cta ? `<button class="btn">${escapeHtml(c.cta)}</button>` : ''}
    </div>
  </section>`;
}

function renderFeatures(section, brand) {
  const c = section.content || {};
  const features = Array.isArray(c.features) ? c.features : [];

  const cards = features
    .map(
      (feature) => `
        <div class="feature-card">
          ${
            feature.image
              ? `<img src="${escapeAttr(feature.image)}" alt="${escapeAttr(
                  feature.title || 'Feature'
                )}" loading="lazy">`
              : `<div style="font-size:2.5rem;">✨</div>`
          }
          <h3>${escapeHtml(feature.title)}</h3>
          <p>${escapeHtml(feature.description)}</p>
        </div>`
    )
    .join('');

  return `
  <section class="features">
    <div class="container">
      <h2>${escapeHtml(c.title)}</h2>
      <div class="features-grid">${cards}</div>
    </div>
  </section>`;
}

function renderCta(section, brand) {
  const c = section.content || {};
  const bg = colorOf(section);

  return `
  <section class="cta" style="background:linear-gradient(135deg, ${escapeAttr(bg)} 0%, ${escapeAttr(
    bg
  )}cc 100%)">
    <div class="container">
      <h2>${escapeHtml(c.headline)}</h2>
      <p>${escapeHtml(c.description)}</p>
      ${c.buttonText ? `<button class="btn btn-solid">${escapeHtml(c.buttonText)}</button>` : ''}
    </div>
  </section>`;
}

function renderFooter(section, brand) {
  const c = section.content || {};
  const name = c.businessName || brand;

  return `
  <footer>
    <p>${escapeHtml(name)}</p>
    ${c.email ? `<p><a href="mailto:${escapeAttr(c.email)}">${escapeHtml(c.email)}</a></p>` : ''}
    ${c.phone ? `<p>${escapeHtml(c.phone)}</p>` : ''}
    <p>${escapeHtml(c.text)}</p>
  </footer>`;
}

const RENDERERS = {
  hero: renderHero,
  features: renderFeatures,
  cta: renderCta,
  footer: renderFooter,
};

const BASE_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    a { color: inherit; }
    .hero {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      color: white; text-align: center; position: relative; overflow: hidden;
    }
    .hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .18; }
    .hero-content { position: relative; z-index: 2; max-width: 800px; padding: 40px; }
    .hero h1 { font-size: 3.5rem; margin-bottom: 20px; font-weight: 700; }
    .hero p { font-size: 1.5rem; margin-bottom: 30px; opacity: .95; }
    .btn {
      display: inline-block; padding: 15px 40px; background: white; color: #333;
      text-decoration: none; border-radius: 50px; font-weight: 600; border: none;
      cursor: pointer; font-size: 1rem; transition: transform .3s, box-shadow .3s;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,.2); }
    .btn-solid { background: white; color: #333; }
    .features { padding: 80px 20px; background: #f9f9f9; }
    .features h2 { text-align: center; font-size: 2.5rem; margin-bottom: 60px; color: #333; }
    .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 40px; }
    .feature-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,.1); text-align: center; }
    .feature-card img { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; }
    .feature-card h3 { font-size: 1.5rem; margin: 20px 0 10px; color: #333; }
    .feature-card p { color: #666; line-height: 1.8; }
    .cta { padding: 80px 20px; color: white; text-align: center; }
    .cta h2 { font-size: 2.5rem; margin-bottom: 20px; }
    .cta p { font-size: 1.2rem; margin-bottom: 30px; opacity: .95; }
    footer { background: #222; color: white; padding: 40px 20px; text-align: center; }
    footer p { margin: 10px 0; }
    @media (max-width: 768px) {
      .hero h1 { font-size: 2rem; }
      .hero p { font-size: 1rem; }
      .features h2, .cta h2 { font-size: 1.8rem; }
    }`;

/**
 * Render a page document (or a plain object shaped like one) to HTML.
 */
function renderHtml(page) {
  const businessName = page.businessName || 'Your Business';
  const sections = page.currentState?.sections || [];
  const color = page.colorScheme || DEFAULT_COLOR;

  const body = sections
    .map((section) => {
      const render = RENDERERS[section.type];
      return render ? render(section, businessName) : '';
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(businessName)} — Landing Page</title>
  <style>${BASE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

module.exports = { buildTemplate, renderHtml };
