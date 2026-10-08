import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { connectToDatabase } from "@/database/mongoose";

type Db = Parameters<typeof mongodbAdapter>[0];

const createAuth = (db: Db) => betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
    },
    plugins: [nextCookies()],
});

let authInstance: ReturnType<typeof createAuth> | null = null;

// Connects to MongoDB on first use (not when the file is imported),
// so `npm run build` works without a database
export const getAuth = async () => {
    if(authInstance) return authInstance;

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if(!db) throw new Error('MongoDB connection not found');

    authInstance = createAuth(db as unknown as Db);

    return authInstance;
}
