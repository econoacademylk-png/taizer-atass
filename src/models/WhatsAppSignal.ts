import mongoose from 'mongoose';

const WhatsAppSignalSchema = new mongoose.Schema({
  signalNumber: { type: Number, required: true },
  coin: { type: String, required: true },
  direction: { type: String, enum: ['LONG', 'SHORT'], required: true },
  leverage: { type: String },
  entryType: { type: String },
  entryPrice: { type: String },
  tpTargets: [{ type: String }],
  stopLoss: { type: String },
  walletUsage: { type: String },
  status: { type: String, enum: ['Pending', 'Profit', 'Loss'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const WhatsAppSignal = (mongoose.models.WhatsAppSignal || mongoose.model('WhatsAppSignal', WhatsAppSignalSchema)) as mongoose.Model<any>;
