'use strict';

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Ties an order to a specific page: verification refuses a mismatch,
    // so a payment for page A cannot unlock page B.
    pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage', required: true, index: true },
    orderId: { type: String, required: true, unique: true },
    paymentId: String,
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
