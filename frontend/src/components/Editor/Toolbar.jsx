import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { loadRazorpay } from '../../lib/razorpay';

export default function Toolbar({ lpData, updateColors, saving }) {
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);

  const handlePayAndPublish = async () => {
    if (publishing) return;
    setPublishing(true);

    try {
      // Price comes from the server; only the pageId is sent.
      const orderRes = await api.post('/api/payment/create-order', { pageId: lpData._id });

      // Lazily inject the checkout script -- it was never in index.html, so
      // window.Razorpay was always undefined and publishing could never work.
      const Razorpay = await loadRazorpay();

      await new Promise((resolve, reject) => {
        const checkout = new Razorpay({
          key: orderRes.data.key,
          amount: orderRes.data.amount,
          currency: orderRes.data.currency || 'INR',
          order_id: orderRes.data.orderId,
          name: lpData.businessName || 'Landing Page',
          prefill: { name: '', email: '' },
          theme: { color: lpData.colorScheme || '#3B82F6' },
          handler: async (response) => {
            try {
              await api.post('/api/payment/verify-order', {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                pageId: lpData._id,
              });

              const pubRes = await api.post(`/api/pages/${lpData._id}/publish`, {});
              resolve(pubRes.data.publicUrl);
            } catch (err) {
              reject(new Error(getErrorMessage(err, 'Payment verification failed')));
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        });

        checkout.on('payment.failed', (response) => {
          reject(new Error(response.error?.description || 'Payment failed'));
        });

        checkout.open();
      })
        .then((publicUrl) => {
          alert(`Published! URL: ${publicUrl}`);
          navigate('/dashboard');
        })
        .catch((err) => {
          // A dismissed checkout is user-driven, not an error worth alarming.
          if (err?.message !== 'Payment cancelled') {
            alert(err.message || 'Publish failed');
          }
        });
    } catch (error) {
      alert(getErrorMessage(error, 'Payment failed to start'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-ink-100 bg-white/90 px-4 py-2.5 backdrop-blur-md animate-slide-down sm:px-6">
      {/* Left: identity + save state */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="ui-btn ui-btn--ghost !px-2.5 !py-1.5 text-sm"
          title="Back to dashboard"
        >
          ←
        </button>

        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm shadow-soft">
          ⚡
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight tracking-tight" title={lpData?.businessName}>
            {lpData?.businessName || 'Untitled page'}
          </p>

          <div className="flex items-center gap-1.5 text-[11px] leading-tight">
            {saving ? (
              <>
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-500" />
                <span className="text-amber-600">Saving…</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.9)]" />
                <span className="text-emerald-600">All changes saved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <label
          className="group flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 transition-all duration-300 hover:border-brand-300 hover:shadow-soft"
          title="Change primary colour"
        >
          <span className="sr-only">Primary colour</span>
          <span className="text-xs font-medium text-ink-500 transition-colors group-hover:text-ink-700">
            Colour
          </span>
          <span
            className="h-6 w-6 rounded-lg ring-1 ring-black/10 transition-transform duration-300 group-hover:scale-110"
            style={{ backgroundColor: lpData?.colorScheme || '#3B82F6' }}
          />
          <input
            type="color"
            aria-label="Primary colour"
            value={lpData?.colorScheme || '#3B82F6'}
            onChange={(e) => updateColors(e.target.value)}
            className="h-0 w-0 opacity-0 absolute"
          />
        </label>

        {lpData?.paymentStatus === 'paid' ? (
          <span className="ui-badge ring-1 bg-emerald-100 text-emerald-700 ring-emerald-200">
            ✓ Payment received
          </span>
        ) : (
          <button
            onClick={handlePayAndPublish}
            disabled={publishing}
            className="ui-btn ui-btn--success !px-4 !py-2 text-sm"
          >
            {publishing && <span className="ui-spinner" aria-hidden />}
            {publishing ? 'Processing…' : `Pay ₹${lpData?.amount || 1500} & Publish`}
          </button>
        )}
      </div>
    </header>
  );
}
