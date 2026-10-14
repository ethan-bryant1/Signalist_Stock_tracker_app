import { describe, expect, it } from "vitest";
import { appUrl } from "@/lib/app-url";

describe("appUrl", () => {
    it("uses BETTER_AUTH_URL without a trailing slash", () => {
        expect(appUrl({ BETTER_AUTH_URL: "https://loops-watch.vercel.app/" })).toBe("https://loops-watch.vercel.app");
    });

    it("prefers BETTER_AUTH_URL over Vercel's production address", () => {
        expect(appUrl({ BETTER_AUTH_URL: "https://watch.example.com", VERCEL_PROJECT_PRODUCTION_URL: "loops-watch.vercel.app" }))
            .toBe("https://watch.example.com");
    });

    it("falls back to Vercel's production address over https", () => {
        expect(appUrl({ BETTER_AUTH_URL: " ", VERCEL_PROJECT_PRODUCTION_URL: "loops-watch.vercel.app" }))
            .toBe("https://loops-watch.vercel.app");
    });

    it("falls back to localhost when running locally", () => {
        expect(appUrl({})).toBe("http://localhost:3000");
    });
});
