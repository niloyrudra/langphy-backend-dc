import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
    console.log(`Sending OTP email to ${email} with code ${otp}`);
    await resend.emails.send({
        from: "Langphy <no-reply@langphy.com>", // "onboarding@resend.dev", // "Langphy <no-reply@langphy.com>", // use verified domain or onboarding@resend.dev for testing
        to: email,
        subject: "Your Langphy verification code",
        html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
                <h2>Verify your email</h2>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing: 8px; font-size: 40px; color: #1B7CF5;">${otp}</h1>
                <p style="color: #666;">This code expires in 10 minutes.</p>
                <p style="color: #666;">If you didn't request this, ignore this email.</p>
            </div>
        `,
    });
};