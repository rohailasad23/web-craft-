'use strict';

const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const asyncHandler = require('../middleware/asyncHandler');
const LandingPage = require('../models/LandingPage');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { readSecret } = require('../utils/secrets');

const router = express.Router();

function getRazorpay() {
  const key_id = readSecret('RAZORPAY_KEY_ID');
  const key_secret = readSecret('RAZORPAY_KEY_SECRET');
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

/** Constant-time string comparison; !== is vulnerable to timing attacks. */
function signaturesMatch(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ===== CREATE ORDER =====
router.post(
  '/create-order',
  asyncHandler(async (req, res) => {
    const { pageId } = req.body || {};
    if (!pageId) return res.status(400).json({ error: 'pageId is required' });

    const page = await LandingPage.findOne({ _id: pageId, userId: req.user.id });
    if (!page) return res.status(404).json({ error: 'Landing page not found' });

    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({
        error: 'Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env',
      });
    }

    // Price comes from the SERVER, never the client. Accepting `amount` from
    // the request body allowed paying any value to unlock publishing.
    const amount = page.amount || 1500;

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `order_${pageId}`,
      notes: { pageId: String(pageId), userId: String(req.user.id) },
    });

    await Payment.create({
      userId: req.user.id,
      pageId,
      orderId: order.id,
      amount,
      status: 'pending',
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  })
);

// ===== VERIFY PAYMENT =====
router.post(
  '/verify-order',
  asyncHandler(async (req, res) => {
    const { orderId, paymentId, signature, pageId } = req.body || {};
    if (!orderId || !paymentId || !signature || !pageId) {
      return res.status(400).json({ error: 'orderId, paymentId, signature and pageId are required' });
    }

    const keySecret = readSecret('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      return res.status(503).json({ error: 'Payment gateway not configured' });
    }

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (!signaturesMatch(expected, signature)) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Bind the order to this user and this page before trusting it. Without
    // this, a payment for page A could unlock page B.
    const payment = await Payment.findOne({ orderId, userId: req.user.id });
    if (!payment) return res.status(404).json({ error: 'Order not found' });
    if (String(payment.pageId) !== String(pageId)) {
      return res.status(400).json({ error: 'Order does not match this landing page' });
    }
    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Payment already verified' });
    }

    payment.status = 'completed';
    payment.paymentId = paymentId;
    await payment.save();

    const page = await LandingPage.findOneAndUpdate(
      { _id: pageId, userId: req.user.id },
      { $set: { paymentStatus: 'paid', paymentId } },
      { new: true }
    );
    if (!page) return res.status(404).json({ error: 'Landing page not found' });

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalRevenue: payment.amount } });

    res.json({ success: true, message: 'Payment verified', page });
  })
);

// ===== GET PAYMENT STATUS =====
router.get(
  '/status/:pageId',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.pageId, userId: req.user.id });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json({ success: true, paymentStatus: page.paymentStatus });
  })
);

module.exports = router;
