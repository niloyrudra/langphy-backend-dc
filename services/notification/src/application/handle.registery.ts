import { TOPICS } from "@langphy/shared";
// import { AchievementUnlockedHandler } from "./handlers/achievement-unlocked.handler.js";
import { LessonCompletedHandler } from "./handlers/lesson-completed.handler.js";
import { ReminderTriggeredHandler } from "./handlers/reminder-triggered.handler.js";
import { SessionCompletedHandler } from "./handlers/session-completed.handler.js";
import { StreakUpdatedHandler } from "./handlers/streak-updated.handler.js";
import { UserRegisteredHandler } from "./handlers/userCreatedHandler.js";
import { UserDeletedHandler } from "./handlers/userDeletionHandler.js";

export const topicHandlerMap: Record<string, NotificationEventHandler<any>> = {
  // [TOPICS.ACHIEVEMENT_UNLOCKED]: new AchievementUnlockedHandler(),
  [TOPICS.SESSION_COMPLETED]: new SessionCompletedHandler(),
  [TOPICS.REMINDER_TRIGGERED]: new ReminderTriggeredHandler(),
  [TOPICS.LESSON_COMPLETED]: new LessonCompletedHandler(),
  [TOPICS.USER_REGISTERED]: new UserRegisteredHandler(),
  [TOPICS.STREAK_UPDATED]: new StreakUpdatedHandler(),
  [TOPICS.USER_DELETED]: new UserDeletedHandler(),
};

export interface NotificationEventHandler<TEvent> {
  handle( event: TEvent ): Promise<void>;
};