import { DeletedUsersModel } from "../models/deleted-users.model.js";

export class DeletedUsersRepo {
    static async insert(user_id: string) {
        await DeletedUsersModel.insertDeletedUser(user_id);
    }

    static async exists(user_id: string): Promise<boolean> {
        return await DeletedUsersModel.exists(user_id);
    }
}