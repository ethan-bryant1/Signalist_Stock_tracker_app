// Loops Watch is private. Finnhub's free plan is licensed for personal use, so only the emails listed in
// ALLOWED_EMAILS (comma separated) can create an account, sign in or use a session. With the variable
// unset nobody can, so a deploy that forgets it stays closed rather than open to everyone.

export const PRIVATE_SITE_MESSAGE = "Loops Watch is a private site, so only its owner can sign up or sign in.";

const MISSING_LIST_MESSAGE = "ALLOWED_EMAILS isn't set in .env, so nobody can sign up or sign in. Add your email to it and restart the server.";

const normalize = (email: string) => email.trim().toLowerCase();

export const parseAllowedEmails = (value: string | undefined): Set<string> =>
    new Set((value ?? "").split(/[\s,;]+/).map(normalize).filter((email) => email.includes("@")));

export const isAllowedEmail = (email: string | null | undefined, allowed = process.env.ALLOWED_EMAILS): boolean =>
    !!email && parseAllowedEmails(allowed).has(normalize(email));

// What a refused visitor sees. Only a developer running locally is told about the missing setting.
export const accessDeniedMessage = (allowed = process.env.ALLOWED_EMAILS, env = process.env.NODE_ENV): string => {
    if (parseAllowedEmails(allowed).size > 0) return PRIVATE_SITE_MESSAGE;
    console.error(MISSING_LIST_MESSAGE);
    return env === "production" ? PRIVATE_SITE_MESSAGE : MISSING_LIST_MESSAGE;
};
