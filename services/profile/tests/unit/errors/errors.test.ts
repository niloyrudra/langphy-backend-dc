import { beforeEach, describe, it, expect, jest } from "@jest/globals";
import type { Request, Response } from "express";

jest.mock("../../../src/errors/custom-errors.js", () => {
    const actual = jest.requireActual("../../../src/errors/custom-errors.js");
    return actual;
});

import { BadRequestError } from "../../../src/errors/bad-request-errors.js";
import { ConflictValidationError } from "../../../src/errors/conflict-errors.js";
import { DatabaseConnectionErrors } from "../../../src/errors/database-connection-errors.js";
import { NotFoundError } from "../../../src/errors/no-find-errors.js";
import { RequestValidationError } from "../../../src/errors/request-validation-errors.js";
import { errorHandler } from "../../../src/middlewares/error-handler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Individual error classes — verify statusCode, serializeErrors, instanceof
// ─────────────────────────────────────────────────────────────────────────────

describe("error classes (profile)", () => {
    describe("BadRequestError", () => {
        it("serializes message and carries status 400 by default", () => {
            const e = new BadRequestError("nope");
            expect(e.statusCode).toBe(400);
            expect(e.serializeErrors()).toEqual([{ message: "nope" }]);
            expect(e.message).toBe("nope");
        });

        it("honours suppliedStatusCode override", () => {
            const e = new BadRequestError("conflict-ish", 409);
            expect(e.statusCode).toBe(409);
        });
    });

    describe("ConflictValidationError", () => {
        it("returns 409 and single message", () => {
            const e = new ConflictValidationError();
            expect(e.statusCode).toBe(409);
            expect(e.serializeErrors()).toEqual([{ message: "User already exists!" }]);
        });
    });

    describe("DatabaseConnectionErrors", () => {
        it("returns 500 and single message", () => {
            const e = new DatabaseConnectionErrors();
            expect(e.statusCode).toBe(500);
            expect(e.serializeErrors()).toEqual([{ message: "Error database connection!" }]);
        });
    });

    describe("NotFoundError", () => {
        it("returns 404 and single message", () => {
            const e = new NotFoundError();
            expect(e.statusCode).toBe(404);
            expect(e.serializeErrors()).toEqual([{ message: "Route not Found!" }]);
        });
    });

    describe("RequestValidationError", () => {
        it("returns 400 and preserves field info for 'field' type errors", () => {
            const e = new RequestValidationError([
                { type: "field", path: "username", msg: "Username is required" },
                { type: "alternative", msg: "invalid body" },
            ] as any);
            expect(e.statusCode).toBe(400);
            expect(e.serializeErrors()).toEqual([
                { message: "Username is required", field: "username" },
                { message: "invalid body" },
            ]);
        });
    });

    describe("instanceof behaviour", () => {
        it("subclassed errors are instanceof CustomError and their concrete class", () => {
            expect(new BadRequestError("x")).toBeInstanceOf(BadRequestError);
            expect(new BadRequestError("x")).toBeInstanceOf(Error);
            expect(new ConflictValidationError()).toBeInstanceOf(ConflictValidationError);
            expect(new NotFoundError()).toBeInstanceOf(NotFoundError);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// errorHandler middleware — verify status routing and JSON shape
// ─────────────────────────────────────────────────────────────────────────────

describe("errorHandler middleware", () => {
    let res: jest.Mocked<Response>;
    let next: jest.Mock;

    beforeEach(() => {
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;
        next = jest.fn();
    });

    it("serializes CustomError subclasses with their statusCode", () => {
        const err = new BadRequestError("bad input");
        errorHandler(err, {} as Request, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            errors: [{ message: "bad input" }],
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("falls back to 400 for unknown errors", () => {
        errorHandler(new Error("boom"), {} as Request, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            errors: [{ message: "Something went wrong!" }],
        });
    });

    it("handles Non-Error values without crashing", () => {
        errorHandler("string err" as any, {} as Request, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            errors: [{ message: "Something went wrong!" }],
        });
    });
});
