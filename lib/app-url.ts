// The address Loops Watch runs on, for links in emails and for Better Auth. BETTER_AUTH_URL wins when it's set. On
// Vercel, a deploy that forgets it falls back to the project's production address (which Vercel provides as
// VERCEL_PROJECT_PRODUCTION_URL, without "https://") rather than sending email links to localhost.
export const appUrl = (env: Record<string, string | undefined> = process.env): string => {
    const configured = env.BETTER_AUTH_URL?.trim();
    const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    const url = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
    return url.replace(/\/+$/, "");
};
