/**
 * Event payload normalization utilities.
 *
 * Handles client-side compatibility issues where events may be sent with
 * camelCase fields or nested "data" wrappers. This will be removed once
 * all clients are updated to send the correct snake_case shape.
 */

import type { BaseEvent } from "@langphy/shared";

/**
 * Unwraps nested envelope payloads.
 * Some clients wrap the actual event payload in a "data" or "payload" property.
 */
export function unwrapPayload(payload: unknown): unknown {
    let current = payload;

    while (
        current &&
        typeof current === "object" &&
        "payload" in current
    ) {
        console.log(`[Gateway] Unwrapping nested envelope`);
        current = (current as Record<string, unknown>).payload;
    }

    return current;
}

/**
 * Normalizes camelCase fields to snake_case for known event payload fields.
 * This is a temporary workaround for clients sending camelCase.
 */
export function normalizePayloadFields(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object") {
        return payload as Record<string, unknown>;
    }

    const normalized = { ...payload } as Record<string, unknown>;

    // Map camelCase to snake_case for known fields
    const fieldMappings: Record<string, string> = {
        unitId: "unit_id",
        userId: "user_id",
        lessonId: "lesson_id",
        categoryId: "category_id",
        sessionType: "session_type",
        duration_ms: "total_duration_ms", // also handle this legacy field
        occurredAt: "completed_at",
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMappings)) {
        if (camelKey in normalized && !(snakeKey in normalized)) {
            normalized[snakeKey] = normalized[camelKey];
        }
        delete normalized[camelKey];
    }

    // Handle the special case where duration_ms should become total_duration_ms
    if ("duration_ms" in normalized && !("total_duration_ms" in normalized)) {
        normalized.total_duration_ms = normalized.duration_ms;
    }
    delete normalized.duration_ms;

    return normalized;
}

/**
 * Normalizes an entire event by unwrapping and normalizing its payload.
 */
export function normalizeEvent(event: BaseEvent): BaseEvent {
    const unwrappedPayload = unwrapPayload(event.payload);
    const normalizedPayload = normalizePayloadFields(unwrappedPayload);

    return {
        ...event,
        payload: normalizedPayload,
    };
}