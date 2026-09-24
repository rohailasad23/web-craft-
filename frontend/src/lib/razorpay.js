import React from 'react';

let loadPromise = null;

/**
 * Load the Razorpay checkout script on demand.
 *
 * index.html did not include it, so `window.Razorpay` was always undefined and
 * the Pay & Publish button could never work. Loading it lazily keeps it out of
 * the critical path and gives a clear, actionable error if it is blocked.
 */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    const script = existing || document.createElement('script');

    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else {
        loadPromise = null;
        reject(new Error('Razorpay loaded but did not initialise.'));
      }
    };

    script.onerror = () => {
      loadPromise = null;
      reject(
        new Error(
          'Could not load the Razorpay checkout script. Check your network or any ad-blocker.'
        )
      );
    };

    if (!existing) document.head.appendChild(script);
  });

  return loadPromise;
}

export default loadRazorpay;
