const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
  },
  minOrderValue: {
    type: Number,
    default: 0, // Minimum order value to apply promo code
  },
  expirationDate: {
    type: Date,
    required: true,
  },
  usageLimit: {
    type: Number,
    default: 1, // Default to 1 if not specified
  },
  usedBy: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      count: {
        type: Number,
        default: 0,
      },
    },
  ],
  appliesTo: {
    type: String,
    enum: ['product', 'service', 'delivery'],
    required: true,
  },
});

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

module.exports = PromoCode;
