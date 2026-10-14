// How many wrong passwords the sign-in form takes before it pauses. Better Auth's own rate limit only covers its HTTP
// routes, and this app signs in through a server action, so the limit lives here. The site is public, so without it
// anyone could keep guessing the owner's password.
//   - 10 failures from one address in 15 minutes pause that address.
//   - 30 failures for one email in 15 minutes pause that email from everywhere (guesses spread over many addresses).
// Signed-in sessions keep working while a pause lasts.

export const SIGN_IN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_ADDRESS = 10;
export const MAX_FAILURES_PER_EMAIL = 30;

export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many sign-in attempts. Wait 15 minutes and try again.";

// The visitor's address. Vercel sets x-forwarded-for itself (the client's address first) and x-real-ip; anything
// else (a local dev server) shares one bucket.
export const clientAddress = (forwardedFor: string | null, realIp: string | null): string => {
    const first = forwardedFor?.split(",")[0]?.trim();
    return (first || realIp?.trim() || "unknown").slice(0, 64);
};

export const attemptKeys = (address: string, email: string) => ({
    address: `ip:${address}`,
    email: `email:${email.trim().toLowerCase()}`,
});

export const signInPaused = (failures: { address: number; email: number }): boolean =>
    failures.address >= MAX_FAILURES_PER_ADDRESS || failures.email >= MAX_FAILURES_PER_EMAIL;
