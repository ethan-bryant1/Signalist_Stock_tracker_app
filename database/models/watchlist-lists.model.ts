import { Schema, model, models, type Model } from 'mongoose';

// One document per user holding all their watchlists and the grid's settings (lib/watchlists.ts checks the shape on
// every read and write). rev goes up on every save, so two tabs saving at once can't overwrite each other's change.
// The older `watchlists` collection (one document per saved stock) is read once to build the first list and is
// otherwise left as it was.
export interface WatchlistListsRecord {
  userId: string;
  doc: unknown;
  rev: number;
  updatedAt: Date;
}

const WatchlistListsSchema = new Schema<WatchlistListsRecord>(
  {
    userId: { type: String, required: true, unique: true },
    doc: { type: Schema.Types.Mixed, required: true },
    rev: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false, collection: 'watchlist_lists' }
);

export const WatchlistLists: Model<WatchlistListsRecord> =
  (models?.WatchlistLists as Model<WatchlistListsRecord>) || model<WatchlistListsRecord>('WatchlistLists', WatchlistListsSchema);
