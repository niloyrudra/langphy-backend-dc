import { mockPool, mockClient, asPoolClient } from "../../helpers/mock-pg.js";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockPgPool = mockPool();
const client = mockClient();

jest.mock("../../../src/db/index.js", () => ({ pgPool: mockPgPool }));

import { OtpModel } from "../../../src/models/otp.model.js";
import { UserModel } from "../../../src/models/user.model.js";
import { OutboxRepo } from "../../../src/repos/outbox.repo.js";
import { verifyOtpController } from "../../../src/controllers/signup.controller.js";

describe("verifyOtpController — transactional integrity (C2)", () => {
    const email = "tx@test.local";
    const fakeUser = {
        id: "00000000-0000-4000-8000-00000000aa00",
        email,
        password: "$2b$12$hash",
        provider: "email",
        provider_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
    };

    beforeEach(() => {
        client.query.mockReset();
        mockPgPool.connect.mockReset();
        jest.restoreAllMocks();
        client.query.mockResolvedValue({ rows: [], rowCount: 0 });
        mockPgPool.connect.mockResolvedValue(asPoolClient(client));
    });

    const makeRes = () => ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
    });

    it("rolls back the ENTIRE transaction when the outbox enqueue fails", async () => {
        jest.spyOn(OtpModel, "verifyInTx").mockResolvedValue(true);
        const createSpy = jest.spyOn(UserModel, "createInTx").mockResolvedValue(fakeUser);
        jest.spyOn(OutboxRepo, "enqueue").mockRejectedValue(new Error("outbox insert failed"));

        const res = makeRes();
        await expect(
            verifyOtpController({ body: { email, password: "password123", otp: "123456" } } as any, res as any)
        ).rejects.toThrow("outbox insert failed");

        // The user INSERT ran on the SAME transaction client, not the pool.
        expect(createSpy).toHaveBeenCalledWith(asPoolClient(client), email, "password123", "email");

        const sqls = client.query.mock.calls.map((c) => String(c[0]).toUpperCase());
        expect(sqls).toContain("ROLLBACK");
        expect(sqls).not.toContain("COMMIT");
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("commits user creation, OTP cleanup and outbox enqueue as one unit on success", async () => {
        jest.spyOn(OtpModel, "verifyInTx").mockResolvedValue(true);
        jest.spyOn(UserModel, "createInTx").mockResolvedValue(fakeUser);
        jest.spyOn(OutboxRepo, "enqueue").mockResolvedValue(undefined);

        const res = makeRes();
        await verifyOtpController(
            { body: { email, password: "password123", otp: "123456" } } as any,
            res as any
        );

        const sqls = client.query.mock.calls.map((c) => String(c[0]).toUpperCase());
        expect(sqls).toContain("COMMIT");
        expect(sqls).not.toContain("ROLLBACK");
        expect(res.status).toHaveBeenCalledWith(201);
    });
});