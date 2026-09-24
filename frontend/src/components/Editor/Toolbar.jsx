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
    <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{lpData?.businessName}</span>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {!saving && <span className="text-xs text-green-600">Saved</span>}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="sr-only">Primary colour</span>
          <input
            type="color"
            aria-label="Primary colour"
            value={lpData?.colorScheme || '#3B82F6'}
            onChange={(e) => updateColors(e.target.value)}
            className="w-10 h-8 border rounded cursor-pointer"
          />
        </label>

        {lpData?.paymentStatus === 'paid' ? (
          <span className="text-xs bg-green-100 text-green-700 px-3 py-2 rounded-lg">
            Payment received
          </span>
        ) : (
          <button
            onClick={handlePayAndPublish}
            disabled={publishing}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:bg-gray-400"
          >
            {publishing ? 'Working…' : `Pay ₹${lpData?.amount || 1500} & Publish`}
          </button>
        )}
      </div>
    </div>
  );
}
