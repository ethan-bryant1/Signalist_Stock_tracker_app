import { Schema, model, models, type Model } from 'mongoose';

// One document per user: their Markets screener presets, last screen and table settings (lib/screener.ts checks the
// shape on every read and write)
export interface MarketsPrefsDoc {
  userId: string;
  prefs: unknown;
  updatedAt: Date;
}

const MarketsPrefsSchema = new Schema<MarketsPrefsDoc>(
  {
    userId: { type: String, required: true, unique: true },
    prefs: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false, collection: 'markets_prefs' }
);

export const MarketsPrefsModel: Model<MarketsPrefsDoc> =
  (models?.MarketsPrefs as Model<MarketsPrefsDoc>) || model<MarketsPrefsDoc>('MarketsPrefs', MarketsPrefsSchema);
