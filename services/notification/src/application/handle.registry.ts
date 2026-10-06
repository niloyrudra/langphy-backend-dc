import { TOPICS } from "@langphy/shared";
// import { AchievementUnlockedHandler } from "./handlers/achievement-unlocked.handler.js";
// import { LessonCompletedHandler } from "./handlers/lesson-completed.handler.js";
import { ReminderTriggeredHandler } from "./handlers/reminder-triggered.handler.js";
import { SessionCompletedHandler } from "./handlers/session-completed.handler.js";
import { StreakUpdatedHandler } from "./handlers/streak-updated.handler.js";
import { UserRegisteredHandler } from "./handlers/userCreatedHandler.js";
import { UserDeletedHandler } from "./handlers/userDeletionHandler.js";
import { VocabSessionCompletedHandler } from "./handlers/vocab-session-completed.handler.js";
import { VocabWordMasteredHandler } from "./handlers/vocab-word-mastered.handler.js";
import { VocabAchievementUnlockedHandler } from "./handlers/vocab-achievement-unlocked.handler.js";

export const topicHandlerMap: Record<string, NotificationEventHandler<any>> = {
  // [TOPICS.ACHIEVEMENT_UNLOCKED]: new AchievementUnlockedHandler(),
  // [TOPICS.LESSON_COMPLETED]: new LessonCompletedHandler(), //  ⛔️ LessonCompleted events are now consumed by Progress service, NOT Notification service. This prevents circular dependencies and infinite loops.
  [TOPICS.SESSION_COMPLETED]: new SessionCompletedHandler(),
  [TOPICS.VOCAB_SESSION_COMPLETED]: new VocabSessionCompletedHandler(),
  [TOPICS.VOCAB_WORD_MASTERED]: new VocabWordMasteredHandler(),
  [TOPICS.VOCAB_ACHIEVEMENT_UNLOCKED]: new VocabAchievementUnlockedHandler(),
  [TOPICS.REMINDER_TRIGGERED]: new ReminderTriggeredHandler(),
  [TOPICS.USER_REGISTERED]: new UserRegisteredHandler(),
  [TOPICS.STREAK_UPDATED]: new StreakUpdatedHandler(),
  [TOPICS.USER_DELETED]: new UserDeletedHandler(),
};

export interface NotificationEventHandler<TEvent> {
  handle( event: TEvent ): Promise<void>;
};