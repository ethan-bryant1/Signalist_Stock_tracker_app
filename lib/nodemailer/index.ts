import nodemailer from 'nodemailer';
import {WELCOME_EMAIL_TEMPLATE, NEWS_SUMMARY_EMAIL_TEMPLATE} from "@/lib/nodemailer/templates";

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Where the "Visit Loops Watch" links in emails go: the address the app runs on
const appUrl = () => (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData) => {
    // Replacer functions stop `$` in the values being read as replace() patterns
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replace('{{name}}', () => escapeHtml(name))
        .replace('{{intro}}', () => intro)
        .replaceAll('{{appUrl}}', appUrl);

    const mailOptions = {
        from: `"Loops Watch" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: `Welcome to Loops Watch - your stock market toolkit is ready!`,
        text: 'Thanks for joining Loops Watch',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

export const sendNewsSummaryEmail = async (
    { email, date, newsContent }: { email: string; date: string; newsContent: string }
): Promise<void> => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', () => date)
        .replace('{{newsContent}}', () => newsContent)
        .replaceAll('{{appUrl}}', appUrl);

    const mailOptions = {
        from: `"Loops Watch News" <${process.env.NODEMAILER_EMAIL}>`,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from Loops Watch`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
};
