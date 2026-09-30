import { mockPool } from "../../helpers/mock-pg.js";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({ pgPool: mockPgPool }));

import { UserModel } from "../../../src/models/user.model.js";
import { DeletedUsersRepo } from "../../../src/repos/deleted-users.repo.js";
import { Password } from "../../../src/services/password.js";
import { signinController } from "../../../src/controllers/signin.controller.js";

describe("signinController", () => {
    const user = {
        id: "00000000-0000-4000-8000-000000000001",
        email: "a@b.com",
        password: "$2b$12$abcdefghijklmnopqrstuvwxyz1234567890", // fake bcrypt hash
        provider: "email",
        provider_user_id: null,
        created_at: new Date("2025-01-01T00:00:00Z"),
        updated_at: new Date("2025-01-01T00:00:00Z"),
    };

    beforeEach(() => {
        mockPgPool.query.mockReset();
        jest.restoreAllMocks();
    });

    const makeRes = () => {
        const send = jest.fn();
        const status = jest.fn().mockReturnValue({ send });
        return { send, status };
    };

    it("issues a JWT and returns only {id, email, created_at} — never the password hash (C1)", async () => {
        jest.spyOn(UserModel, "findByEmail").mockResolvedValue(user);
        jest.spyOn(DeletedUsersRepo, "exists").mockResolvedValue(false);
        jest.spyOn(Password, "compare").mockResolvedValue(true);

        const res = makeRes();
        await signinController({ body: { email: user.email, password: "password123" } } as any, res as any);

        expect(res.status).toHaveBeenCalledWith(200);
        const body: any = res.send.mock.calls[0][0];
        expect(body.token).toBeTruthy();
        expect(body.user).toEqual({
            id: user.id,
            email: user.email,
            created_at: user.created_at,
        });
        expect(body.user).not.toHaveProperty("password");
        expect(JSON.stringify(body)).not.toContain("$2");
    });

    it("throws the generic Invalid credentials error for a wrong password", async () => {
        jest.spyOn(UserModel, "findByEmail").mockResolvedValue(user);
        jest.spyOn(DeletedUsersRepo, "exists").mockResolvedValue(false);
        jest.spyOn(Password, "compare").mockResolvedValue(false);

        const res = makeRes();
        await expect(
            signinController({ body: { email: user.email, password: "wrong" } } as any, res as any)
        ).rejects.toThrow(/Invalid credentials/);
    });
});