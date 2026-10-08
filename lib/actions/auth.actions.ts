'use server';

import {getAuth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {headers} from "next/headers";

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }: SignUpFormData) => {
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
