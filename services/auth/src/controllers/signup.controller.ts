import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/user.model.js";
import { OtpModel } from "../models/otp.model.js";
// import { DatabaseConnectionErrors } from "../errors/database-connection-errors.js";
// import { validationResult } from "express-validator";
// import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { publishUserRegistered } from "../kafka/producer.js";
import { sendOtpEmail } from "../services/email.service.js";

// Step 1 — request OTP (replaces old signupController)
export const requestOtpController = async (req: Request, res: Response) => {
    // const errors = validationResult(req);
    // if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const { email, password } = req.body;

    // Check email not already registered
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) throw new BadRequestError("Email in use!");

    // Generate and store OTP
    const otp = OtpModel.generateOtp();
    await OtpModel.upsert(email, otp);

    // Send email (non-blocking — don't fail signup if email fails)
    try {
        await sendOtpEmail(email, otp);
    } catch (emailErr) {
        console.error("OTP email failed:", emailErr);
        // Still return success — user can request resend
    }

    // Store password temporarily in the OTP record or client-side
    // Simplest: return nothing sensitive, client holds password until verify step
    res.status(200).json({ message: "Verification code sent to your email." });
};

// Step 2 — verify OTP and create user
export const verifyOtpController = async (req: Request, res: Response) => {
    // const errors = validationResult(req);
    // if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const { email, password, otp } = req.body;

    const valid = await OtpModel.verify(email, otp);
    if (!valid) throw new BadRequestError("Invalid or expired verification code.");

    // Double-check email not taken (race condition guard)
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) throw new BadRequestError("Email in use!");

    // Create user
    const user = await UserModel.create(email, password, "email");

    // Cleanup OTP record
    await OtpModel.cleanup(email);

    // Publish Kafka event
    try {
        await publishUserRegistered({
            event_id: uuidv4(),
            event_type: "user.registered.v1",
            event_version: 1,
            occurred_at: new Date().toISOString(),
            user_id: user.id,
            payload: { email, provider: "email" },
        });
    } catch (eventError) {
        console.error("Kafka publish failed:", eventError);
    }

    res.status(201).json({
        message: "Account created successfully!",
        user: { id: user.id, email: user.email, created_at: user.created_at }
    });
};

export const signupController = async ( req: Request, res: Response ) => {
    // const errors = validationResult(req);
    
    // if( ! errors.isEmpty() ) throw new RequestValidationError( errors.array() );
            
    const { email, password } = req.body;

    try {
        const existingUser = await UserModel.findByEmail( email );

        if( existingUser ) {
            throw new BadRequestError( "Email in use!" );
        }

        const user = await UserModel.create( email, password, "email" );
        console.log("✅ User created:", user.id);

        /** KAFKA */
        /**
         * Emit user.registered event
         * This initializes user-related services (profile, settings, etc.)
         * Consumers must be idempotent
         */
        try {
            await publishUserRegistered({
                event_id: uuidv4(),
                event_type: "user.registered.v1",
                event_version: 1,
                occurred_at: new Date().toISOString(),
                user_id: user.id,
                payload: {
                    email,
                    provider: "email",
                },
            });
        }
        catch(eventError) {
            console.error( "Kafka publish failed:", eventError );
        }
        /** KAFKA */
        
        res.status( 201 ).send({
            message: "User created successfully!",
            user: {
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                provider: user.provider
            }
        });
    }
    catch( err ) {
        console.error( "Signup error:", err );
        // throw new DatabaseConnectionErrors();
        throw err;
    }
}
