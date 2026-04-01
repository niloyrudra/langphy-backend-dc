export const TOPICS = {
    USER_REGISTERED: "user.registered.v1",
    USER_PASSWORD_CHANGED: "user.password.changed.v1",
    USER_SIGNED_OUT: "user.signed-out.v1",
    USER_DELETED: "user.deleted.v1",

    USERS_EVENTS: "users.events.v1",
    USERS_EVENTS_RETRY: "users.events.retry.v1",
    USERS_EVENTS_DLQ: "users.events.dlq.v1",

    SETTINGS_UPDATED: "settings.updated.v1",

    STREAK_UPDATED: "streaks.updated.v1",
    STREAK_UPDATED_DLQ: "streaks.updated.dlq.v1",

    PRACTICE_COMPLETED: "practice.completed.v1",

    NOTIFICATION_CREATED: "notification.created.v1",
    REMINDER_TRIGGERED: "reminder.triggered.v1",
    
    // Progress service related
    PROGRESS_UPDATED: "progress.updated.v1",
    PROGRESS_UPDATED_DLQ: "progress.updated.dlq.v1",
    
    LESSON_COMPLETED: "lesson.completed.v1",
    SESSION_COMPLETED: "session.completed.v1",

    PERFORMANCE_UPDATED: "performance.updated.v1",
    PERFORMANCE_UPDATED_DLQ: "performance.updated.dlq.v1",

    // ACHIEVEMENT_UNLOCKED: "achievement.unlocked.v1",
    // ACHIEVEMENTS_UPDATED: "achievements.updated.v1",
    // ACHIEVEMENTS_UPDATED_DLQ: "achievements.updated.dlq.v1",
} as const;