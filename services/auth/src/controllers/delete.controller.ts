import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { validationResult } from "express-validator";
import { RequestValidationError } from "../errors/request-validation-errors.js";
import { BadRequestError } from "../errors/bad-request-errors.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";
import type { AuthRequest } from "../middlewares/require-auth.js";

/**
 * Account deletion endpoint.
 *
 * Side effects, all atomic in one transaction:
 *   1. DELETE FROM lp_users
 *   2. INSERT INTO deleted_users (tombstone)
 *   3. INSERT INTO outbox_events (user.deleted.v1)
 *
 * The outbox publisher polls every 2s and ships the event to Kafka.
 * If Kafka is down at this moment, the event stays durable in the DB
 * and will be delivered when Kafka recovers — no event loss.
 */
export const deleteController = async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new RequestValidationError(errors.array());

    const userId = req?.user?.id;
    if (!userId) {
        throw new BadRequestError("User ID is missing!");
    }

    const envelope = {
        event_id: uuidv4(),
        event_type: "user.deleted.v1" as const,
        event_version: 1 as const,
        occurred_at: new Date(),
        user_id: userId,
        payload: {
            reason: "user_requested",
            deleted_by: "user" as const,
        },
    };

    // One transaction. If any of the three writes fails, the user is unaffected.
    await DeletedUsersRepo.softDeleteWithOutbox(userId, envelope);

    res.status(200).send({
        message: "Account Deletion is successful!",
        user: null,
    });
};