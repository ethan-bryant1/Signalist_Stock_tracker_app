import {inngest} from "@/lib/inngest/client";
import {PERSONALIZED_WELCOME_EMAIL_PROMPT} from "@/lib/inngest/prompts";
import {sendWelcomeEmail} from "@/lib/nodemailer";

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email' },
    { event: 'app/user.created'},
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)

        // Without a Gemini key, or if Gemini keeps failing, send the default intro
        let response: Awaited<ReturnType<typeof step.ai.infer>> | null = null;
        if(process.env.GEMINI_API_KEY) {
            try {
                response = await step.ai.infer('generate-welcome-intro', {
                    // gemini-2.5-flash-lite (used in the video) is closed to new API keys;
                    // this alias always points at Google's current Flash model
                    model: step.ai.models.gemini({ model: 'gemini-flash-latest' }),
                    body: {
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    { text: prompt }
                                ]
                            }]
                    }
                })
            } catch (e) {
                console.error('Gemini welcome intro failed, using default intro', e);
            }
        }

        await step.run('send-welcome-email', async () => {
            const part = response?.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) ||'Thanks for joining Signalist. You now have the tools to track markets and make smarter moves.'

            const { data: { email, name } } = event;

            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }
    }
)
