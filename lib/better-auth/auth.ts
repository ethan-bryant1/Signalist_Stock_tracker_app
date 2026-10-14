import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { connectToDatabase } from "@/database/mongoose";
import { appUrl } from "@/lib/app-url";
import { isAllowedEmail, PRIVATE_SITE_MESSAGE } from "@/lib/owner-access";

type Db = Parameters<typeof mongodbAdapter>[0];

const createAuth = (db: Db) => betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: appUrl(),
    emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
    },
    // The sign-up and sign-in actions check ALLOWED_EMAILS first to give a clear message. These hooks are the
    // backstop that holds for every way into Better Auth.
    user: {
        validateUserInfo: ({ user }) => isAllowedEmail(user.email) ? undefined : { error: "private_site", errorDescription: PRIVATE_SITE_MESSAGE },
    },
    databaseHooks: {
        session: {
            create: {
                before: async (session, ctx) => {
                    const user = await ctx?.context.internalAdapter.findUserById(session.userId);
                    return isAllowedEmail(user?.email);
                },
            },
        },
    },
    plugins: [nextCookies()],
});

let authInstance: ReturnType<typeof createAuth> | null = null;

// Connects to MongoDB on first use (not when the file is imported),
// so `npm run build` works without a database
export const getAuth = async () => {
    if(authInstance) return authInstance;

    // Without this, Better Auth falls back to a public default secret outside production
    if(!process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
        throw new Error('BETTER_AUTH_SECRET must be set within .env');
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if(!db) throw new Error('MongoDB connection not found');

    authInstance = createAuth(db as unknown as Db);

    return authInstance;
}

// The signed-in user's session, or null. Use this rather than auth.api.getSession: it also turns away sessions
// whose email has since been taken off ALLOWED_EMAILS (or that were created before the list existed).
export const getSession = async (requestHeaders: Headers) => {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session?.user && isAllowedEmail(session.user.email) ? session : null;
}
