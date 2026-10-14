'use server';

import {getAuth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {headers} from "next/headers";
import {INVESTMENT_GOALS, PREFERRED_INDUSTRIES, RISK_TOLERANCE_OPTIONS} from "@/lib/constants";
import {accessDeniedMessage, isAllowedEmail} from "@/lib/owner-access";
import {isAPIError} from "better-auth/api";
import {isSignInPaused, recordSignInFailure} from "@/lib/sign-in-attempts";
import {clientAddress, TOO_MANY_ATTEMPTS_MESSAGE} from "@/lib/sign-in-limit";

// Server actions take whatever the caller sends, so check the shape before anything reads it
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

// Better Auth's own messages ("Invalid email or password") are written for people. Anything else (a database
// error, say) can name hosts or settings, so the page gets a plain message and the details stay in the server log.
const authErrorMessage = (e: unknown, fallback: string) => isAPIError(e) && e.message ? e.message : fallback;

const isOption = (options: { value: string }[], value: string) => options.some((option) => option.value === value);

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }: SignUpFormData) => {
    // These go into the welcome email prompt, so only accept the values the form offers
    if(!isText(email, 254) || !isText(password, 128) || !isText(fullName, 100)) return { success: false, error: 'Please fill in your name, email and password' }

    const validProfile = typeof country === 'string' && /^[A-Z]{2}$/.test(country)
        && isOption(INVESTMENT_GOALS, investmentGoals)
        && isOption(RISK_TOLERANCE_OPTIONS, riskTolerance)
        && isOption(PREFERRED_INDUSTRIES, preferredIndustry);

    if(!validProfile) return { success: false, error: 'Please choose your country and preferences from the lists' }
    if(!isAllowedEmail(email)) return { success: false, error: accessDeniedMessage() }

    try {
        const auth = await getAuth();
        const response = await auth.api.signUpEmail({ body: { email, password, name: fullName }, headers: await headers() })

        if(response) {
            // The account already exists at this point, so a failed welcome email shouldn't fail the sign-up
            try {
                await inngest.send({
                    name: 'app/user.created',
                    data: { email, name: fullName, country, investmentGoals, riskTolerance, preferredIndustry }
                })
            } catch (e) {
                console.log('Could not queue welcome email', e)
            }
        }

        // The response carries the session token; the cookie already holds it, so it never goes back to the page
        return { success: true }
    } catch (e) {
        console.log('Sign up failed', e)
        return { success: false, error: authErrorMessage(e, 'Sign up failed') }
    }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
    if(!isText(email, 254) || !isText(password, 128)) return { success: false, error: 'Please enter your email and password' }

    const requestHeaders = await headers();
    const address = clientAddress(requestHeaders.get('x-forwarded-for'), requestHeaders.get('x-real-ip'));

    // Checked before the email list too, so a paused address can't keep probing which emails are allowed
    try {
        if(await isSignInPaused(address, email)) return { success: false, error: TOO_MANY_ATTEMPTS_MESSAGE }
    } catch (e) {
        // Without the database the sign-in below fails anyway
        console.error('Could not check sign-in attempts', e)
    }

    if(!isAllowedEmail(email)) {
        await recordSignInFailure(address, email).catch((e) => console.error('Could not record a failed sign-in', e))
        return { success: false, error: accessDeniedMessage() }
    }

    try {
        const auth = await getAuth();
        await auth.api.signInEmail({ body: { email, password }, headers: requestHeaders })

        return { success: true }
    } catch (e) {
        console.log('Sign in failed', e)
        if(isAPIError(e)) await recordSignInFailure(address, email).catch((err) => console.error('Could not record a failed sign-in', err))
        return { success: false, error: authErrorMessage(e, 'Sign in failed') }
    }
}

export const signOut = async () => {
    try {
        const auth = await getAuth();
        await auth.api.signOut({ headers: await headers() });
    } catch (e) {
        console.log('Sign out failed', e)
        return { success: false, error: 'Sign out failed' }
    }
}
