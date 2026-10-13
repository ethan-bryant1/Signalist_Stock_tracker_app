import { Schema, model, models, type Model } from 'mongoose';

// One document per user: the News page's settings and saved articles (lib/news.ts checks both on every read)
export interface NewsPrefsRecord {
  userId: string;
  prefs: unknown;
  saved: unknown[];
  updatedAt: Date;
}

const NewsPrefsSchema = new Schema<NewsPrefsRecord>(
  {
    userId: { type: String, required: true, unique: true },
    prefs: { type: Schema.Types.Mixed, default: {} },
    saved: { type: [Schema.Types.Mixed], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false, collection: 'news_prefs' }
);

export const NewsPrefs: Model<NewsPrefsRecord> = (models?.NewsPrefs as Model<NewsPrefsRecord>) || model<NewsPrefsRecord>('NewsPrefs', NewsPrefsSchema);
