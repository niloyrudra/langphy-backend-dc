import type { UserDeletedEvent } from "@langphy/shared";
import type { NotificationEventHandler } from "../handle.registry.js";
import { deleteNotification } from "../../repos/notifications.repo.js";
import { deleteUserActivity } from "../../repos/user-daily-activity.repo.js";
import { deleteDeviceToken } from "../../repos/device-token.repo.js";
import { DeletedUsersRepo } from "../../repos/deleted-users.repo.js";

export class UserDeletedHandler
    implements NotificationEventHandler<UserDeletedEvent>
{
    async handle(event: UserDeletedEvent) {

        // 1️⃣ Insert tombstone first
        await DeletedUsersRepo.insert(event.user_id);

        // 2️⃣ Delete service-owned data
        await deleteNotification(event.user_id);
        await deleteUserActivity(event.user_id);
        await deleteDeviceToken(event.user_id);

        console.log("🗑 Notification data cleaned for:", event.user_id);
    }
}