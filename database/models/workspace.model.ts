import { Schema, model, models, type Model } from 'mongoose';

// One document per user holding all their workspaces (lib/workspace.ts checks the shape on every read and write)
export interface WorkspaceDoc {
  userId: string;
  store: unknown;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<WorkspaceDoc>(
  {
    userId: { type: String, required: true, unique: true },
    store: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false }
);

export const WorkspaceModel: Model<WorkspaceDoc> =
  (models?.Workspace as Model<WorkspaceDoc>) || model<WorkspaceDoc>('Workspace', WorkspaceSchema);
