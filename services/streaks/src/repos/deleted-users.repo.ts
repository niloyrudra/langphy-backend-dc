import { DeletedUsersModel } from "../models/deleted-users.model.js";

/**
 * Public repo over DeletedUsersModel. Kept as a separate layer so
 * future soft-delete + outbox logic can compose without touching the
 * raw model.
 */
export class DeletedUsersRepo {
    static async insert(user_id: string): Promise<void> {
        await DeletedUsersModel.insertDeletedUser(user_id);
    }

    static async exists(user_id: string): Promise<boolean> {
        return await DeletedUsersModel.exists(user_id);
    }
}
