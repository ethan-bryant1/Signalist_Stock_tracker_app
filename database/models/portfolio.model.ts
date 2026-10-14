import { Schema, model, models, type Model } from 'mongoose';

// One document per user holding their saved portfolios (lib/portfolio.ts checks the shape on every read and write)
export interface PortfolioRecord {
  userId: string;
  doc: unknown;
  updatedAt: Date;
}

const PortfolioSchema = new Schema<PortfolioRecord>(
  {
    userId: { type: String, required: true, unique: true },
    doc: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false, collection: 'portfolios' }
);

export const PortfolioModel: Model<PortfolioRecord> =
  (models?.Portfolio as Model<PortfolioRecord>) || model<PortfolioRecord>('Portfolio', PortfolioSchema);
