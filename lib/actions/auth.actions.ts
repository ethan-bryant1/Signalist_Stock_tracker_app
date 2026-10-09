'use server';

import {getAuth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {headers} from "next/headers";
import {INVESTMENT_GOALS, PREFERRED_INDUSTRIES, RISK_TOLERANCE_OPTIONS} from "@/lib/constants";

const isOption = (options: { value: string }[], value: string) => options.some((option) => option.value === value);

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }: SignUpFormData) => {
    // These go into the welcome email prompt, so only accept the values the form offers
    const validProfile = /^[A-Z]{2}$/.test(country)
        && isOption(INVESTMENT_GOALS, investmentGoals)
        && isOption(RISK_TOLERANCE_OPTIONS, riskTolerance)
        && isOption(PREFERRED_INDUSTRIES, preferredIndustry);

    if(!validProfile) return { success: false, error: 'Please choose your country and preferences from the lists' }

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

        return { success: true, data: response }
    } catch (e) {
        console.log('Sign up failed', e)
        return { success: false, error: e instanceof Error ? e.message : 'Sign up failed' }
    }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
    try {
        const auth = await getAuth();
        const response = await auth.api.signInEmail({ body: { email, password }, headers: await headers() })

        return { success: true, data: response }
    } catch (e) {
        console.log('Sign in failed', e)
        return { success: false, error: e instanceof Error ? e.message : 'Sign in failed' }
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
