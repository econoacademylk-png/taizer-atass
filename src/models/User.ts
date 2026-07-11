import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  city: { type: String },
  postalCode: { type: String },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  approved: { type: Boolean, default: false },
  paymentMethod: { type: String },
  transactionId: { type: String },
  paymentReceiptUrl: { type: String },
  selectedPackage: { type: String },
  expiryDate: { type: Date },
  hasUsedFreeTrial: { type: Boolean, default: false },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
