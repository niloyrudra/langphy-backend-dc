import { type Pool } from "pg";
import { pgPool } from "../db/index.js";
import { DeletedUsersModel } from "../models/deleted-users.model.js";

/**
 * A `pg` object that can run queries — either the shared pool or a dedicated
 * client obtained via `pgPool.connect()` inside a transaction.
 */
type Queryable = Pick<Pool, "query">;

export class DeletedUsersRepo {
    static async insert(user_id: string, client?: Queryable) {
        await DeletedUsersModel.insertDeletedUser(user_id, client ?? pgPool);
    }

    static async exists(user_id: string, client?: Queryable): Promise<boolean> {
        return await DeletedUsersModel.exists(user_id, client ?? pgPool);
    }
}