import { pgPool } from "../db/index.js";
import { BadRequestError } from "../errors/bad-request-errors.js";

export interface UserProfile {
    id: string;
    user_id: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    profile_image: string | null;
    created_at: Date;
    updated_at: Date | null;
};

export interface UserData {
    user_id: string;
    first_name: string;
    last_name: string;
    username: string;
    profile_image: string;
}

export class ProfileModel {

    static async getProfile(user_id: string): Promise<UserProfile> {
        try {
            const result = await pgPool.query(
                `SELECT * FROM lp_profiles WHERE user_id = $1`,
                [user_id]
            );
    
            return result.rows[0];
        }
        catch( err: any ) {
            console.error("Get profile error:", err);
            // if (err?.code === "23505") {
                // unique_violation
                // throw new Error("Fetching profile data error", err);
            // }
            throw err;
        }
    }

    static async deleteProfileById(user_id: string) {
        try {
            return await pgPool.query(
                `DELETE FROM lp_profiles WHERE user_id = $1`,
                [user_id]
            );
        }
        catch( err: any ) {
            console.error("deleteProfileById error:", err);
            throw err;
        }
    }

    static async updateProfile(id: string, userData: UserData): Promise<UserProfile> {
        try {
            const result = await pgPool.query(
                `
                UPDATE lp_profiles
                SET
                    username = $1,
                    first_name = $2,
                    last_name = $3,
                    profile_image = $4,
                    updated_at = now()
                WHERE user_id = $5
                RETURNING *
                `,
                [
                    userData.username,
                    userData.first_name,
                    userData.last_name,
                    userData.profile_image,
                    id,
                ]
            );

            if (!result.rows[0]) {
                throw new BadRequestError("Profile not found");
            }
        
            return result.rows[0];
        }
        catch(err: any) {
            console.error("Update profile error:", err);

            // Handle unique username violation gracefully
            if (err.code === "23505") {
                throw new BadRequestError("Username already exists. Choose another username.");
            }

            throw new BadRequestError("Something went wrong!");
        }
    }


    static async createProfile(userData: UserData): Promise<UserProfile> {
        try {
            const result = await pgPool.query(
                `INSERT INTO lp_profiles (user_id, username, first_name, last_name, profile_image)
                    VALUES ($1,$2,$3,$4,$5)
                    RETURNING *`,
                [
                    userData.user_id,
                    userData.username,
                    userData.first_name,
                    userData.last_name,
                    userData.profile_image,
                ]
            );
    
            return result.rows[0];
        }
        catch( err: any ) {
            console.error("Create profile error:", err);
            if (err?.code === "23505") {
                // unique_violation
                throw new Error("Create profile error", err);
            }
            throw err;
        }
    }

    static async profileIfNotExists(user_id: string): Promise<UserProfile | undefined> {
        try {
            const existing = await pgPool.query(
                `SELECT user_id FROM lp_profiles WHERE user_id = $1`,
                [user_id]
            );

            if (existing && existing.rowCount! > 0) {
                return existing.rows[0];
            }
        }
        catch(err) {
            console.error("Create profile error:", err);
            throw err;
        }
    }

    static async createProfileIfNotExists(user_id: string, email: string): Promise<UserProfile> {
        try {
            const result = await pgPool.query(
                `
                INSERT INTO lp_profiles (user_id, username)
                VALUES ($1, $2)
                ON CONFLICT (user_id)
                DO UPDATE SET username = EXCLUDED.username
                RETURNING *
                `,
                [user_id, email]
            );
    
            return result.rows[0];
        }
        catch( err: any ) {
            console.error("Create profile error:", err);
            if (err?.code === "23505") {
                // unique_violation
                throw new Error("Create profile error", err);
            }
            throw err;
        }
    }
}